'use client';

import { useEffect, useRef, useState } from 'react';
import { useMetrics } from '../hooks/useMetrics';
import { usdc, usdcCompact } from '../lib/format';
import { Empty } from './Empty';

// Creator view. Reads /metrics for the connected wallet (as merchant) and shows
// the three health numbers. Pure display — the hook owns the fetch and the
// loading/error state; this only branches on what comes back.

// Zero out the numeric part of a formatted string ("$1.2K" → "$0K") — the
// count-up's starting frame, so the final value never flashes before animating.
function zeroed(text: string): string {
    return text.replace(/-?[\d,]+(\.\d+)?/, '0');
}

// Animates the number inside an already-formatted string: "$1.2K" ticks up
// 0 → 1.2 while the "$" and "K" stay put. 700ms with a cubic ease-out — long
// enough to register as motion, short enough not to feel like a slot machine.
// On a poll update it animates from the previous value, not from zero.
// Skipped entirely under prefers-reduced-motion (the target renders at once).
function useCountUp(target: string, ms = 700) {
    const [display, setDisplay] = useState(() => zeroed(target));
    const prev = useRef(0);

    useEffect(() => {
        const m = target.match(/-?[\d,]+(\.\d+)?/);
        if (!m || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            // Still one frame, not synchronous: setState directly in an effect
            // body triggers a cascading re-render (react-hooks/set-state-in-effect).
            const raf = requestAnimationFrame(() => setDisplay(target));
            return () => cancelAnimationFrame(raf);
        }
        const end = parseFloat(m[0].replace(/,/g, ''));
        // Keep the target's own decimal places ("$1.2K" stays one decimal while moving).
        const decimals = m[1] ? m[1].length - 1 : 0;
        const start = prev.current;
        prev.current = end;

        const t0 = performance.now();
        let raf: number;
        const tick = (t: number) => {
            const p = Math.min((t - t0) / ms, 1);
            const eased = 1 - Math.pow(1 - p, 3); // cubic ease-out: fast start, soft landing
            const v = start + (end - start) * eased;
            setDisplay(
                target.replace(
                    m[0],
                    v.toLocaleString('en-US', {
                        minimumFractionDigits: decimals,
                        maximumFractionDigits: decimals,
                    }),
                ),
            );
            if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, ms]);

    return display;
}

function Stat({
    label,
    value,
    title,
    accent,
}: {
    label: string;
    value: string;
    title?: string;
    accent?: boolean;
}) {
    const display = useCountUp(value);
    return (
        // min-w-0 lets the card shrink inside the grid so `truncate` can engage —
        // a hard guard against any value ever overflowing its box.
        <div className="min-w-0 border border-ink-800 bg-gradient-to-b from-ink-850 to-ink-900 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
                {label}
            </div>
            <div
                title={title}
                className={`mt-1.5 truncate font-mono text-[1.65rem] font-medium leading-none ${
                    accent
                        ? 'text-brand [text-shadow:0_0_24px_rgba(204,255,229,0.25)]'
                        : 'text-paper'
                }`}
            >
                {display}
            </div>
        </div>
    );
}

export function Metrics({ merchant }: { merchant?: `0x${string}` }) {
    const { data, isLoading, error } = useMetrics(merchant);

    if (!merchant) return <Empty>Connect a wallet to view revenue.</Empty>;
    if (isLoading) return <Empty>Loading metrics…</Empty>;
    if (error) return <Empty tone="error">Couldn’t load metrics: {error.message}</Empty>;
    if (!data) return null;

    return (
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="MRR" value={usdcCompact(data.mrr)} title={usdc(data.mrr)} accent />
            <Stat label="Active subs" value={String(data.active)} />
            <Stat label="Churned" value={String(data.churn)} />
        </div>
    );
}
