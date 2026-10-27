'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount, useReadContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { UserPill } from '@privy-io/react-auth/ui';
import { ActionButton } from '../components/ActionButton';
import { Section } from '../components/Section';
import { useRegisterMerchant } from '../hooks/useRegisterMerchant';
import { useUsdcBalance } from '../hooks/useUsdcBalance';
import { useMintUsdc, FAUCET_AMOUNT } from '../hooks/useMintUsdc';
import { usdc } from '../lib/format';
import { usePlans } from '../hooks/usePlans';
import { useMetrics } from '../hooks/useMetrics';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { subscriptionManager } from '../lib/contract';
import { Metrics } from '../components/Metrics';
import { Plans } from '../components/Plans';
import { Subscriptions } from '../components/Subscriptions';
import { NotificationSettings } from '../components/NotificationSettings';
import { CreatePlan } from '../components/CreatePlan';
import { MerchantPlans } from '../components/MerchantPlans';
import { SetProtocolFee, SetFeeRecipient, SetMerchantFee } from '../components/FeeSetters';

// Each button maps 1:1 to a contract function. Wire a hook → pass its
// trigger as the button's onClick, and its isPending as disabled.
//
// "Register Merchant" is the worked example of the write-hook diagram:
//   C1 — disable while pending
//   C4 — surface error (toast, auto-dismisses — never swallow the throw)
//   C3 — on success, invalidate the isMerchant read; the refetch swaps the
//        button for the plan tools (visible proof the invalidation fired).

export default function Home() {
    const { address, isConnecting, isReconnecting } = useAccount();
    const { ready, authenticated } = usePrivy();
    const queryClient = useQueryClient();

    // Boot gate — the sections' own hooks fire one query each, so on a cold
    // load the page assembles piecemeal (plans pop in, then subs, then the
    // Protocol row). These calls watch the SAME queries (identical queryKeys →
    // React Query dedupes, zero extra requests) so we can hold one loading
    // screen until everything's in, then reveal the dashboard as a whole.
    // isPending (not isLoading): true from mount until FIRST data. isLoading
    // has a false window between "query enabled" and "fetch started" — that
    // one-frame gap dropped the gate mid-boot and showed the loader twice.
    const plansQ = usePlans();
    const metricsQ = useMetrics(address);
    const subsQ = useSubscriptions(address);
    const { data: balance } = useUsdcBalance();

    const {
        data: isMerchant,
        queryKey: isMerchantKey,
        isPending: merchantPending,
    } = useReadContract({
        ...subscriptionManager,
        functionName: 'isMerchant',
        args: address ? [address] : undefined,
        query: { enabled: !!address },
    });

    // Protocol section is onlyOwner on-chain — mirror that gate in the UI so
    // non-owners never see knobs whose txs would just revert Unauthorized.
    // Addresses compare lowercased: the contract returns checksummed casing.
    const { data: owner, isPending: ownerPending } = useReadContract({
        ...subscriptionManager,
        functionName: 'owner',
    });
    const isOwner = !!address && !!owner && owner.toLowerCase() === address.toLowerCase();

    // The boot has TWO wallet windows, and both must hold the gate:
    //   1. Privy restoring its session (!ready),
    //   2. session restored but the wagmi connector not attached yet
    //      (authenticated && !address) — isConnecting/isReconnecting are
    //      false in that gap, which was the other cause of the double loader.
    // Wallet-scoped queries count only once an address exists — a disabled
    // query is isPending forever, so unguarded it would hang the gate for
    // logged-out visitors.
    const stillBooting =
        !ready ||
        (authenticated && !address) ||
        isConnecting ||
        isReconnecting ||
        plansQ.isPending ||
        ownerPending ||
        (!!address && (merchantPending || metricsQ.isPending || subsQ.isPending));

    // One-way latch: after the first reveal the loader never comes back —
    // a later wallet switch re-runs queries but must not blank the app.
    // Set during render (guarded, so it fires once), not in an effect: React
    // restarts the render immediately, so the reveal never paints a stale frame.
    const [booted, setBooted] = useState(false);
    if (!booted && !stillBooting) setBooted(true);
    const booting = !booted && stillBooting;

    const { registerMerchant, isPending: registering, isSuccess, error } = useRegisterMerchant();
    const {
        mint: mintUsdc,
        isPending: minting,
        isSuccess: minted,
        error: mintError,
    } = useMintUsdc();

    useEffect(() => {
        if (minted) toast.success(`Minted ${usdc(FAUCET_AMOUNT.toString())} test USDC`);
    }, [minted]);
    useEffect(() => {
        if (mintError) toast.error(mintError.message);
    }, [mintError]);

    // The deal, shown before the button is pressed: what registering costs and
    // what cut the protocol takes. Same queryKeys as the reads inside
    // useRegisterMerchant/FeeSetters → wagmi dedupes, no extra RPC calls.
    const { data: merchantFee } = useReadContract({
        ...subscriptionManager,
        functionName: 'getMerchantFee',
    });
    const { data: feeRate } = useReadContract({
        ...subscriptionManager,
        functionName: 'getFeeRate',
    });

    // C3 — on confirm, toast + refresh the isMerchant read so the UI reflects the new state.
    useEffect(() => {
        if (isSuccess) {
            toast.success('Registered as merchant');
            queryClient.invalidateQueries({ queryKey: isMerchantKey });
        }
    }, [isSuccess, queryClient, isMerchantKey]);

    // C4 — errors surface as a toast (auto-dismisses ~4s), matching the success
    // path. Inline text stretched the button column and lingered forever.
    useEffect(() => {
        if (error) toast.error(error.message);
    }, [error]);

    return (
        <div className="min-h-screen w-full">
            {/* .stagger — direct children rise in sequence on load (globals.css). */}
            <main className="stagger mx-auto max-w-2xl px-6 py-14">
                <header className="mb-10 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="font-display text-2xl font-semibold tracking-tight text-paper">
                            onchain-stripe
                        </h1>
                        <p className="mt-1.5 flex items-center gap-2 font-mono text-xs tracking-wide text-faint">
                            {/* Live dot — the dashboard polls the indexer every 30s. */}
                            <span className="relative flex size-1.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint/60" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-mint" />
                            </span>
                            live on Base Sepolia · settled in USDC
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <UserPill />
                        {/* What the wallet can spend — every flow here pulls USDC,
                            so keep the figure one glance away. 30s poll (see hook). */}
                        {balance !== undefined && (
                            <p className="font-mono text-xs tracking-wide text-faint">
                                {usdc(balance.toString())} <span className="uppercase">usdc</span>
                                {/* Testnet faucet — the token is an open-mint mock. */}
                                {' · '}
                                <button
                                    onClick={mintUsdc}
                                    disabled={minting}
                                    className="text-mint underline-offset-2 hover:underline disabled:cursor-wait disabled:opacity-50"
                                >
                                    {minting
                                        ? 'minting…'
                                        : `+${usdc(FAUCET_AMOUNT.toString())} test`}
                                </button>
                            </p>
                        )}
                    </div>
                </header>

                {booting ? (
                    // One quiet loader instead of five sections trickling in.
                    // Same pulsing mint dot as the header's live indicator, so
                    // "loading" and "live" read as the same heartbeat.
                    <div className="flex flex-col items-center gap-3 py-24">
                        <span className="relative flex size-1.5">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint/60" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-mint" />
                        </span>
                        <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
                            loading data…
                        </p>
                    </div>
                ) : (
                    <>
                        <Section title="Revenue">
                            <Metrics merchant={address} />
                        </Section>
                        <Section title="Plans">
                            <Plans />
                        </Section>
                        <Section title="Your subs">
                            <Subscriptions subscriber={address} />
                        </Section>
                        <Section title="Merchant">
                            {/* Two states, one at a time — createPlan is gated by isMerchant
                        on-chain, so mirror it: not a merchant → the register button
                        (its whole job); merchant → just the plan tools. No
                        "Merchant ✓" tombstone — registration succeeding IS the
                        button disappearing (plus the toast). */}
                            {isMerchant ? (
                                <>
                                    <CreatePlan />
                                    {/* The connected merchant's own plans (incl. inactive), with per-row
                                Update + Enable/Disable. Empty until you've created a plan. */}
                                    <MerchantPlans merchant={address} />
                                </>
                            ) : (
                                // items-center (not stretch): both children keep their own
                                // width and the caption sits centered under the button.
                                <div className="flex flex-col items-center gap-1">
                                    <ActionButton
                                        label={registering ? 'Registering…' : 'Register Merchant'}
                                        onClick={registerMerchant}
                                        disabled={!address || registering}
                                    />
                                    {!registering && (
                                        <p className="text-center font-mono text-[0.65rem] tracking-wide text-faint">
                                            {merchantFee !== undefined && (
                                                <>{usdc(merchantFee.toString())} one-time · </>
                                            )}
                                            unlocks plan creation
                                            {/* bps → percent: 250 bps = 2.5% (100 bps = 1%). */}
                                            {feeRate !== undefined && (
                                                <>
                                                    <br />
                                                    protocol keeps {Number(feeRate) / 100}% of every
                                                    payment
                                                </>
                                            )}
                                        </p>
                                    )}
                                </div>
                            )}
                        </Section>
                        {isOwner && (
                            <Section title="Protocol" note="current:">
                                <SetProtocolFee />
                                <SetFeeRecipient />
                                <SetMerchantFee />
                            </Section>
                        )}
                    </>
                )}

                {/* Receipt footer — the contract's core invariant, stated as a fact. */}
                <footer className="tear pt-6">
                    <p className="text-center font-mono text-[0.65rem] uppercase tracking-[0.18em] text-faint">
                        the contract holds no value — every payment leaves in the same transaction
                    </p>
                    {/* Email-reminder state: centered under the receipt footer, same
                        quiet fine-print register as the invariant line above it.
                        Only rendered once a wallet is connected — the API binds the
                        email to the signed-in address. */}
                    {address && (
                        <div className="mt-4 flex justify-center">
                            <NotificationSettings />
                        </div>
                    )}
                </footer>
            </main>
        </div>
    );
}
