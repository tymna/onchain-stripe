import { Hono } from 'hono';
import { and, eq, gt, lte, isNotNull, sql, isNull } from 'drizzle-orm';

import { db } from '../db';
import { vSubscriptions, vPlans, subscriberEmails, expiryNotices } from '../schema';
import { sendEmail } from '../email';

export const cron = new Hono();

// plan names are free text set by any merchant on-chain — escape before they hit HTML
function escapeHtml(s: string) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

cron.post('/expiry', async (c) => {
    // machine-to-machine guard: only the scheduler knows the secret.
    // the !secret check keeps the route closed if the env var is ever missing
    const secret = process.env.CRON_SECRET;
    if (!secret || c.req.header('x-cron-secret') !== secret) {
        return c.json({ error: 'unauthorized' }, 401);
    }

    const rows = await db
        .select({
            subId: vSubscriptions.subId,
            expiresAt: vSubscriptions.expiresAt,
            email: subscriberEmails.email,
            planName: vPlans.name, // the email says "Pro plan", not a keccak hash
        })
        .from(vSubscriptions)
        .innerJoin(subscriberEmails, eq(subscriberEmails.address, vSubscriptions.subscriber))
        .innerJoin(vPlans, eq(vPlans.planId, vSubscriptions.planId))
        .leftJoin(
            expiryNotices,
            and(
                eq(expiryNotices.subId, vSubscriptions.subId),
                eq(expiryNotices.expiresAt, vSubscriptions.expiresAt),
            ),
        )
        .where(
            and(
                gt(vSubscriptions.expiresAt, sql`now()`), // still alive
                lte(vSubscriptions.expiresAt, sql`now() + interval '3 days'`), // dying soon
                eq(vSubscriptions.cancelled, false),
                isNotNull(subscriberEmails.confirmedAt), // confirmed email exists
                isNull(expiryNotices.subId), // ← not yet reminded
            ),
        );

    let sent = 0;
    for (const row of rows) {
        // the where clause already excludes nulls; this proves it to TS
        if (!row.subId || !row.expiresAt) continue;
        // per-row isolation: one bad send must not abort the rest. A row that
        // fails here gets no notice row, so the next run simply retries it.
        try {
            await sendEmail(
                row.email,
                'Your subscription is expiring soon',
                `<p>Your <b>${escapeHtml(row.planName ?? 'subscription')}</b> plan expires on ${row.expiresAt.toUTCString()}. Renew on the dashboard to keep it active.</p>`,
            );
            await db.insert(expiryNotices).values({
                subId: row.subId,
                expiresAt: row.expiresAt,
            });
            sent++;
        } catch (err) {
            console.error('cron/expiry:', row.subId, err);
        }
    }

    // sent < matched signals partial failure — the scheduler's logs catch it
    return c.json({ ok: true, sent, matched: rows.length });
});
