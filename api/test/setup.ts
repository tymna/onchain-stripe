import { vi } from 'vitest';
import { createMiddleware } from 'hono/factory';

// shared by every test file: in-process Postgres, no real email, no real Privy
vi.mock('../src/db', async () => ({ db: await (await import('./pglite')).createTestDb() }));
vi.mock('../src/email', () => ({ sendEmail: vi.fn() }));
// stand-in for Privy: every request is a logged-in wallet
vi.mock('../src/auth', () => ({
    privyAuth: createMiddleware(async (c, next) => {
        c.set('address', '0x' + 'c'.repeat(40));
        await next();
    }),
}));
