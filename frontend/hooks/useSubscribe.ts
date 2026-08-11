// Wraps SubscriptionManager.subscribe(planId, periods) — user pays USDC, gets a subscription.
//
// Uniswap-style two-step flow, mirror of useRenew. On mount (the modal opens fresh
// each time) it reads the plan and my slot on-chain; useUsdcApproval reads the
// wallet's current USDC allowance — so the UI knows BEFORE any click whether an
// Approve step is needed:
//   allowance ≥ price × periods → one step:  [Subscribe]
//   allowance < price × periods → two steps: [1. Approve USDC] → [2. Subscribe]
// Each step is its own click + tx; `phase` tells the UI which one is in flight.
//
// Writes go through useSendTx: embedded wallet → Privy sponsored (EIP-7702 +
// paymaster, a 0-ETH wallet can pay); external wallet → wagmi, own gas. Reads stay on wagmi.
import { useEffect, useState } from 'react';
import { useAccount, useConfig } from 'wagmi';
import { waitForTransactionReceipt, readContract, simulateContract } from '@wagmi/core';
import { useSendTx } from './useSendTx';
import { useUsdcApproval } from './useUsdcApproval';
import { encodeFunctionData, zeroAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import { subscriptionManager, deriveSubId } from '../lib/contract';
import { friendlyError } from '../lib/errors';
import { addPendingSub } from '../lib/subOverrides';

// loading = reading plan/slot · idle = waiting for a click ·
// approving/subscribing = that tx is signing/mining · done = subscribe confirmed.
export type SubscribePhase = 'loading' | 'idle' | 'approving' | 'subscribing' | 'done';

export function useSubscribe(planId: bigint) {
    const config = useConfig();
    const { address } = useAccount();
    const { sendTx } = useSendTx();
    const { allowance, approve: approveUsdc } = useUsdcApproval();

    const [price, setPrice] = useState<bigint | null>(null);
    // On-chain truth, read fresh on open — the catalog filters on the DB's active
    // flag, which can lag a just-disabled plan. false = the contract will reject
    // subscribe; the UI should say so up front instead of wasting an approve tx.
    const [planActive, setPlanActive] = useState<boolean | null>(null);
    // Whether MY slot for this plan is already taken, read on-chain on open. The
    // approve step is a plain USDC call — the token knows nothing about
    // subscriptions, so it can't refuse; only subscribe() would revert. Without
    // this read the modal happily takes the approve tx and fails at step 2.
    // null = still loading (block the button until known).
    const [alreadySubscribed, setAlreadySubscribed] = useState<boolean | null>(null);
    const [phase, setPhase] = useState<SubscribePhase>('loading');
    const [error, setError] = useState<Error>();

    // Read the plan + my slot once per mount (the allowance read lives in
    // useUsdcApproval). `stale` guards the async writes if the modal closes
    // before the reads land.
    useEffect(() => {
        if (!address) return;
        let stale = false;
        (async () => {
            try {
                const plan = await readContract(config, {
                    ...subscriptionManager,
                    functionName: 'getPlan',
                    args: [planId],
                });
                // A non-zero subscriber means the slot is taken and subscribe()
                // would revert; renew is the way back.
                const sub = await readContract(config, {
                    ...subscriptionManager,
                    functionName: 'getSubscription',
                    args: [deriveSubId(address, planId)],
                });
                if (stale) return;
                setPrice(plan.price);
                setPlanActive(plan.active);
                setAlreadySubscribed(sub.subscriber !== zeroAddress);
                setPhase('idle');
            } catch (e) {
                if (!stale) {
                    setError(friendlyError(e));
                    setPhase('idle');
                }
            }
        })();
        return () => {
            stale = true;
        };
    }, [address, planId, config]);

    // The contract pulls price × periods; until both reads land, treat approval
    // as needed so the button can't jump the gun.
    const needsApproval = (periods: bigint) =>
        price === null || allowance === null || allowance < price * periods;

    // Step 1 — approve exactly what this subscribe will pull (no unlimited
    // approvals). The ERC-20 mechanics live in useUsdcApproval; this owns
    // phase + error.
    const approve = async (periods: bigint) => {
        if (price === null) return;
        setError(undefined);
        setPhase('approving');
        try {
            await approveUsdc(price * periods);
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setPhase('idle');
        }
    };

    // Step 2 — the subscribe itself. `done` is the component's success signal.
    const subscribe = async (periods: bigint) => {
        setError(undefined);
        setPhase('subscribing');
        try {
            // Dry-run before asking for a signature: a would-be revert throws here
            // with its DECODED custom error (e.g. PlanInactive, SubscriptionExists)
            // and costs nothing. Skipping this hands the revert to the wallet's gas
            // estimator, which buries it under "exceeds max transaction gas limit".
            await simulateContract(config, {
                ...subscriptionManager,
                functionName: 'subscribe',
                args: [planId, periods],
                account: address,
            });
            const hash = await sendTx({
                to: subscriptionManager.address,
                data: encodeFunctionData({
                    abi: subscriptionManager.abi,
                    functionName: 'subscribe',
                    args: [planId, periods],
                }),
                chainId: baseSepolia.id,
            });
            const receipt = await waitForTransactionReceipt(config, { hash });
            if (receipt.status !== 'success') throw new Error('subscribe reverted');
            // The DB won't list this brand-new sub until the indexer catches up
            // — the API answer stays sub-less for seconds+, repainting "not
            // subscribed" right after the tx confirmed. Read the sub straight
            // back from the contract and remember a whole synthesized row
            // locally; views append it until the DB returns the real one.
            // Own try: the subscribe DID succeed; a failed read here must not
            // surface as a subscribe error.
            try {
                const subId = deriveSubId(address!, planId);
                const sub = await readContract(config, {
                    ...subscriptionManager,
                    functionName: 'getSubscription',
                    args: [subId],
                });
                addPendingSub({
                    subId: subId.slice(2), // API shape: bare hex, no 0x
                    subscriber: address!.toLowerCase(),
                    planId: Number(planId),
                    // chain stores seconds, JS Date counts milliseconds → ×1000
                    expiresAt: new Date(Number(sub.expiryTimestamp) * 1000).toISOString(),
                    cancelled: false,
                });
            } catch {
                // best-effort: without the row the list just lags to the next poll
            }
            setPhase('done');
        } catch (e) {
            setError(friendlyError(e));
            setPhase('idle');
        }
    };

    return {
        phase,
        price,
        planActive,
        alreadySubscribed,
        needsApproval,
        approve,
        subscribe,
        error,
    };
}
