import { db } from '../src/db';
import { events, subscriberEmails, expiryNotices } from '../src/schema';

// runs against the mocked db (see vi.mock in each test file)
export async function reset() {
    await db.delete(events);
    await db.delete(subscriberEmails);
    await db.delete(expiryNotices);
}

// fake chain: every event lands in its own block, so ordering = insertion order
let block = 1;

export function event(eventType: string, fields: Partial<typeof events.$inferInsert> = {}) {
    const n = block++;
    return db.insert(events).values({
        id: `0x${n.toString(16)}:0`,
        eventType,
        blockNumber: n,
        blockTimestamp: new Date(),
        txHash: `0x${n.toString(16)}`,
        logIndex: 0,
        ...fields,
    });
}

const DAY = 24 * 60 * 60;

export const days = (d: number) => new Date(Date.now() + d * DAY * 1000);

export async function plan(
    planId: number,
    merchant: string,
    price: string,
    intervalDays: number,
    name = `plan ${planId}`,
) {
    await event('PlanCreated', {
        merchant,
        planId,
        name,
        price,
        interval: intervalDays * DAY,
    });
}

export async function subscribe(
    subId: string,
    subscriber: string,
    planId: number,
    expiresAt: Date,
) {
    await event('Subscribed', { subId, subscriber, planId, amount: '1', expiresAt });
}
