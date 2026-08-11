import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { db } from '../db';
import { subscriberEmails } from '../schema';
import { privyAuth } from '../auth';
import { sendEmail } from '../email';

// the generic tells TS that c.get('address') exists (set by privyAuth)
export const settings = new Hono<{ Variables: { address: string } }>();

// where confirmation links point — the API's own public address once deployed
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const bodySchema = z.object({ email: z.email() });

settings.post('/email', privyAuth, zValidator('json', bodySchema), async (c) => {
    const address = c.get('address');
    const { email } = c.req.valid('json');

    const token = crypto.randomUUID();

    // upsert: re-submitting replaces the email and resets confirmation,
    // so a changed address must prove itself with a fresh link
    await db
        .insert(subscriberEmails)
        .values({
            address,
            email,
            confirmToken: token,
            confirmedAt: null,
        })
        .onConflictDoUpdate({
            target: subscriberEmails.address,
            set: {
                email,
                confirmToken: token,
                confirmedAt: null,
            },
        });
    await sendEmail(
        email,
        'Confirm your notifications',
        `<p><a href="${API_URL}/api/v1/settings/confirm?token=${token}">Click here to confirm</a></p>`,
    );

    return c.json({ ok: true });
});

// read half for the dashboard: does MY address have an email, and is it
// confirmed? null = never signed up (simpler for the frontend than a 404)
settings.get('/email', privyAuth, async (c) => {
    const address = c.get('address');
    const rows = await db
        .select({
            email: subscriberEmails.email,
            confirmedAt: subscriberEmails.confirmedAt,
        })
        .from(subscriberEmails)
        .where(eq(subscriberEmails.address, address));

    if (rows.length === 0) return c.json(null);
    return c.json({ email: rows[0].email, confirmed: rows[0].confirmedAt !== null });
});

settings.get('/confirm', async (c) => {
    const token = c.req.query('token');
    if (!token) return c.text('missing token', 400);

    // one atomic statement: flip the row and read it back — a row returned
    // means the token was valid; nothing returned means bad or already used.
    // (nulling the token is what makes the link one-time)
    const updated = await db
        .update(subscriberEmails)
        .set({
            confirmedAt: new Date(),
            confirmToken: null,
        })
        .where(eq(subscriberEmails.confirmToken, token))
        .returning();

    if (updated.length === 0) return c.text('invalid token', 400);
    return c.text('email confirmed ✓');
});
