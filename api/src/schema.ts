import {
    pgTable,
    pgView,
    text,
    bigint,
    numeric,
    integer,
    timestamp,
    boolean,
    primaryKey,
} from 'drizzle-orm/pg-core';

export const payments = pgTable('payments', {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    subId: text('sub_id').notNull(),
    subscriber: text('subscriber').notNull(),
    planId: bigint('plan_id', {
        mode: 'number',
    }).notNull(),
    amount: numeric('amount').notNull(),
    expiresAt: timestamp('expires_at', {
        withTimezone: true,
    }).notNull(),
    blockNumber: bigint('block_number', {
        mode: 'number',
    }).notNull(),
    blockTimestamp: timestamp('block_timestamp', {
        withTimezone: true,
    }).notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),
});

export const events = pgTable('events', {
    id: text('id').primaryKey(),
    eventType: text('event_type').notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    blockTimestamp: timestamp('block_timestamp', { withTimezone: true }).notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull(),

    merchant: text('merchant'),
    subscriber: text('subscriber'),
    subId: text('sub_id'),
    planId: bigint('plan_id', { mode: 'number' }),
    price: numeric('price'),
    amount: numeric('amount'),
    interval: bigint('interval', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    active: boolean('active'),
    name: text('name'),
});

export const vPlans = pgView('v_plans', {
    planId: bigint('plan_id', { mode: 'number' }),
    merchant: text('merchant'),
    name: text('name'),
    // numeric (not bigint mode:"number") → Drizzle returns a string, keeping
    // base units past 2^53 precise. usdc() takes that string straight to BigInt.
    price: numeric('price'),
    interval: bigint('interval', { mode: 'number' }),
    active: boolean('active'),
}).existing();

export const vSubscriptions = pgView('v_subscriptions', {
    subId: text('sub_id'),
    subscriber: text('subscriber'),
    planId: bigint('plan_id', { mode: 'number' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    cancelled: boolean('cancelled'),
}).existing();

export const subscriberEmails = pgTable('subscriber_emails', {
    address: text('address').primaryKey(),
    email: text('email').notNull(),
    confirmToken: text('confirm_token'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
});

export const expiryNotices = pgTable(
    'expiry_notices',
    {
        subId: text('sub_id').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        notifiedAt: timestamp('notified_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (t) => [primaryKey({ columns: [t.subId, t.expiresAt] })],
);
