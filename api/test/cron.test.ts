import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../src/db';
import { app } from '../src/app';
import { sendEmail } from '../src/email';
import { subscriberEmails } from '../src/schema';
import { days, plan, reset, subscribe } from './fixtures';

const SECRET = 'test-secret';
const M = '0x' + 'a'.repeat(40);
const U = '0x' + 'c'.repeat(40);

const runCron = (secret = SECRET) =>
    app.request('/api/v1/cron/expiry', { method: 'POST', headers: { 'x-cron-secret': secret } });

async function confirmedEmail(address = U) {
    await db
        .insert(subscriberEmails)
        .values({ address, email: 'u@example.com', confirmedAt: new Date() });
}

describe('POST /cron/expiry', () => {
    beforeEach(async () => {
        vi.stubEnv('CRON_SECRET', SECRET);
        vi.mocked(sendEmail).mockReset();
        await reset();
    });

    it('rejects a wrong secret', async () => {
        expect((await runCron('nope')).status).toBe(401);
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('emails once per expiry period, however often it runs', async () => {
        await plan(1, M, '10000000', 30);
        await subscribe('0x01', U, 1, days(1));
        await confirmedEmail();

        expect(await (await runCron()).json()).toEqual({ ok: true, sent: 1, matched: 1 });
        expect(await (await runCron()).json()).toEqual({ ok: true, sent: 0, matched: 0 });
        expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it('retries a failed send on the next run', async () => {
        await plan(1, M, '10000000', 30);
        await subscribe('0x01', U, 1, days(1));
        await confirmedEmail();
        vi.mocked(sendEmail).mockRejectedValueOnce(new Error('resend down'));

        expect(await (await runCron()).json()).toEqual({ ok: true, sent: 0, matched: 1 });
        expect(await (await runCron()).json()).toEqual({ ok: true, sent: 1, matched: 1 });
        expect(await (await runCron()).json()).toEqual({ ok: true, sent: 0, matched: 0 });
        expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it('skips subs that are far from expiry or have no confirmed email', async () => {
        await plan(1, M, '10000000', 30);
        await subscribe('0x01', U, 1, days(10));
        await subscribe('0x02', '0x' + 'd'.repeat(40), 1, days(1)); // no email on file
        await confirmedEmail();

        expect(await (await runCron()).json()).toEqual({ ok: true, sent: 0, matched: 0 });
    });

    it('escapes the plan name in the email html', async () => {
        await plan(1, M, '10000000', 30, '<img src=x onerror=alert(1)>');
        await subscribe('0x01', U, 1, days(1));
        await confirmedEmail();

        await runCron();
        const html = vi.mocked(sendEmail).mock.calls[0][2];
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(html).not.toContain('<img');
    });
});
