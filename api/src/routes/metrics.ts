import { Hono } from 'hono';
import { sql, eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { db } from '../db';
import { vPlans, vSubscriptions } from '../schema';

export const metrics = new Hono();

const MONTH = sql.raw(String(30 * 24 * 60 * 60)); // seconds, matching on-chain intervals

const querySchema = z.object({
    merchant: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid address'),
});

metrics.get('/', zValidator('query', querySchema), async (c) => {
    const { merchant } = c.req.valid('query');
    const m = merchant.toLowerCase();

    // A sub is active iff it hasn't expired AND wasn't cancelled; churned is the
    // exact complement (a count, not a rate). Decided on the DB's clock (now()) —
    // never the API server's — so every metric shares one notion of "current".
    const active = sql`${vSubscriptions.expiresAt} > now() and ${vSubscriptions.cancelled} = false`;

    // One pass instead of two queries: FILTER is a per-aggregate WHERE — the
    // merchant's subs are scanned once and each aggregate counts only the rows
    // matching its own condition.
    const [row] = await db
        .select({
            // plans bill per arbitrary interval, so each price is normalized to a
            // 30-day month (price × 30d / interval) before summing. floor keeps it
            // whole base units, which the frontend parses with BigInt
            mrr: sql<string>`floor(coalesce(sum(${vPlans.price}::numeric * ${MONTH} / ${vPlans.interval}) filter (where ${active}), 0))`,
            active: sql<number>`(count(*) filter (where ${active}))::int`,
            churned: sql<number>`(count(*) filter (where not (${active})))::int`,
        })
        .from(vSubscriptions)
        .innerJoin(vPlans, eq(vSubscriptions.planId, vPlans.planId))
        .where(eq(vPlans.merchant, m));

    return c.json(row);
});
