import { Hono } from 'hono';
import { sql, eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { db } from '../db';
import { vPlans, vSubscriptions } from '../schema';

export const metrics = new Hono();

const querySchema = z.object({
    merchant: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid address'),
});

metrics.get('/', zValidator('query', querySchema), async (c) => {
    const { merchant } = c.req.valid('query');
    const m = merchant.toLowerCase();

    // A sub is active iff it hasn't expired AND wasn't cancelled; churn is the
    // exact complement. Decided on the DB's clock (now()) — never the API
    // server's — so every metric shares one notion of "current".
    const active = sql`${vSubscriptions.expiresAt} > now() and ${vSubscriptions.cancelled} = false`;

    // One pass instead of two queries: FILTER is a per-aggregate WHERE — the
    // merchant's subs are scanned once and each aggregate counts only the rows
    // matching its own condition.
    const [row] = await db
        .select({
            mrr: sql<string>`coalesce(sum(${vPlans.price}) filter (where ${active}), 0)`,
            active: sql<number>`(count(*) filter (where ${active}))::int`,
            churn: sql<number>`(count(*) filter (where not (${active})))::int`,
        })
        .from(vSubscriptions)
        .innerJoin(vPlans, eq(vSubscriptions.planId, vPlans.planId))
        .where(eq(vPlans.merchant, m));

    return c.json(row);
});
