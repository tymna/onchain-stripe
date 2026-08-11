import { Hono } from 'hono';

import { db } from '../db';
import { vPlans } from '../schema';

export const plans = new Hono();

plans.get('/', async (c) => {
    const rows = await db.select().from(vPlans);

    return c.json(rows);
});
