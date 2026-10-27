import { beforeEach, describe, expect, it } from 'vitest';

import { app } from '../src/app';
import { days, event, plan, reset, subscribe } from './fixtures';

const M = '0x' + 'a'.repeat(40);
const OTHER = '0x' + 'b'.repeat(40);

async function getMetrics(merchant = M) {
    const res = await app.request(`/api/v1/metrics?merchant=${merchant}`);
    expect(res.status).toBe(200);
    return res.json();
}

describe('GET /metrics', () => {
    beforeEach(() => reset());

    it('returns zeros for a merchant with no subscribers', async () => {
        await plan(1, M, '10000000', 30);
        expect(await getMetrics()).toEqual({ mrr: '0', active: 0, churned: 0 });
    });

    it('normalizes every plan price to a 30-day month', async () => {
        await plan(1, M, '10000000', 30); // 10 USDC / 30d → 10
        await plan(2, M, '1000000', 1); //   1 USDC / day → 30
        await plan(3, M, '120000000', 365); // 120 USDC / year → 9.863013…
        await subscribe('0x01', '0xu1', 1, days(10));
        await subscribe('0x02', '0xu2', 2, days(10));
        await subscribe('0x03', '0xu3', 3, days(10));

        // floored to whole base units: 10 + 30 + 9.863013 USDC
        expect(await getMetrics()).toEqual({ mrr: '49863013', active: 3, churned: 0 });
    });

    it('counts cancelled and expired subs as churned, not revenue', async () => {
        await plan(1, M, '10000000', 30);
        await subscribe('0x01', '0xu1', 1, days(10)); // active
        await subscribe('0x02', '0xu2', 1, days(10));
        await event('Cancelled', { subId: '0x02', subscriber: '0xu2', planId: 1 });
        await subscribe('0x03', '0xu3', 1, days(-1)); // lapsed

        expect(await getMetrics()).toEqual({ mrr: '10000000', active: 1, churned: 2 });
    });

    it('a renew after cancel brings the sub back', async () => {
        await plan(1, M, '10000000', 30);
        await subscribe('0x01', '0xu1', 1, days(10));
        await event('Cancelled', { subId: '0x01', subscriber: '0xu1', planId: 1 });
        await event('Renewed', {
            subId: '0x01',
            subscriber: '0xu1',
            planId: 1,
            amount: '10000000',
            expiresAt: days(40),
        });

        expect(await getMetrics()).toEqual({ mrr: '10000000', active: 1, churned: 0 });
    });

    it('uses the latest plan price and ignores other merchants', async () => {
        await plan(1, M, '10000000', 30);
        await event('PlanUpdated', {
            merchant: M,
            planId: 1,
            price: '20000000',
            interval: 30 * 24 * 60 * 60,
        });
        await plan(2, OTHER, '99000000', 30);
        await subscribe('0x01', '0xu1', 1, days(10));
        await subscribe('0x02', '0xu2', 2, days(10));

        // checksummed / uppercase input is lowercased before the lookup
        expect(await getMetrics(M.toUpperCase().replace('0X', '0x'))).toEqual({
            mrr: '20000000',
            active: 1,
            churned: 0,
        });
    });
});
