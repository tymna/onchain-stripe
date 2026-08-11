import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { db } from '../db';
import { vSubscriptions } from '../schema';

export const subscriptions = new Hono();

const querySchema = z.object({
    subscriber: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid address'),
});

subscriptions.get('/', zValidator('query', querySchema), async (c) => {
    const { subscriber } = c.req.valid('query');
    const s = subscriber.toLowerCase();

    const rows = await db.select().from(vSubscriptions).where(eq(vSubscriptions.subscriber, s));

    return c.json(rows);
});
