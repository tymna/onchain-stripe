import { formatUnits } from 'viem';

// Display formatters. The chain (and thus the DB) speaks in base units and
// seconds; these turn that into something a human reads. Format last, at the
// edge — nothing downstream does math on the output.

// USDC has 6 decimals on Base. The DB stores raw base units as a numeric
// string — "10000000" means 10 USDC. SQL sum() can return a decimal string,
// so drop any fractional part before BigInt (base units are whole numbers).
export function usdc(raw: string): string {
    const whole = raw.split('.')[0] || '0';
    const value = Number(formatUnits(BigInt(whole), 6));
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Same value, compact — "$10K", "$3.2M" — for tight stat cards where the full
// figure would overflow. maximumFractionDigits: 1 keeps it to one decimal
// ("$3.2M", not "$3.21M") so it stays short. Pair with usdc() in a tooltip for
// the exact number.
export function usdcCompact(raw: string): string {
    const whole = raw.split('.')[0] || '0';
    const value = Number(formatUnits(BigInt(whole), 6));
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
    });
}

// Plan intervals are stored in seconds (the contract's unit). Show the largest
// unit that doesn't round down to zero, so a short test interval reads as
// "45 sec" or "5 min" instead of the misleading "0 days".
export function duration(seconds: number): string {
    // All in seconds — 60s to a minute, 60 min to an hour, 24 hr to a day...
    const MIN = 60;
    const HOUR = 60 * MIN; // 3_600
    const DAY = 24 * HOUR; // 86_400
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY; // "month" = 30 days (billing convention, not calendar)
    const YEAR = 365 * DAY;

    // Exact common billing periods read as a clean singular word ("/ month").
    const exact: Record<number, string> = {
        [DAY]: 'day',
        [WEEK]: 'week',
        [MONTH]: 'month',
        [YEAR]: 'year',
    };
    if (exact[seconds]) return exact[seconds];

    // Otherwise pick the largest whole unit that gives a count ≥ 1, and pluralize.
    const units: [number, string][] = [
        [YEAR, 'year'],
        [MONTH, 'month'],
        [WEEK, 'week'],
        [DAY, 'day'],
        [HOUR, 'hour'],
        [MIN, 'min'],
        [1, 'sec'],
    ];
    for (const [size, label] of units) {
        if (seconds >= size) {
            const n = Math.round(seconds / size);
            return `${n} ${label}${n === 1 ? '' : 's'}`;
        }
    }
    return '0 sec';
}

// Postgres timestamps arrive as ISO strings over JSON. Show a plain date.
export function date(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

// 0x1234…abcd — enough to recognize, short enough to fit a row.
export function addr(a: string): string {
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// The indexer stores subIds as bare hex (64 chars, no 0x); viem needs a
// 0x-prefixed bytes32. A plain `as` cast isn't enough — it's compile-time only,
// the runtime string would still be unprefixed.
export function to0x(subId: string): `0x${string}` {
    return (subId.startsWith('0x') ? subId : `0x${subId}`) as `0x${string}`;
}
