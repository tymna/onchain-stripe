import { describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { sendEmail } from '../src/email';

describe('zod validation', () => {
    it.each([
        '/api/v1/metrics',
        '/api/v1/metrics?merchant=0x123',
        '/api/v1/metrics?merchant=not-an-address',
        '/api/v1/v_subscriptions',
        '/api/v1/v_subscriptions?subscriber=0x' + 'z'.repeat(40),
    ])('GET %s → 400', async (path) => {
        expect((await app.request(path)).status).toBe(400);
    });

    it('POST /settings/email rejects a bad email before sending anything', async () => {
        const res = await app.request('/api/v1/settings/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'not-an-email' }),
        });
        expect(res.status).toBe(400);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('POST /settings/email accepts a valid one', async () => {
        const res = await app.request('/api/v1/settings/email', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: 'u@example.com' }),
        });
        expect(res.status).toBe(200);
        expect(sendEmail).toHaveBeenCalledOnce();
    });
});
