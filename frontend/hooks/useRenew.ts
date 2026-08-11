// Wraps SubscriptionManager.renew(subId, periods) — extends an existing subscription.
//
// Uniswap-style two-step flow, mirror of useSubscribe. On mount (the modal opens
// fresh each time) it reads the sub's plan on-chain; useUsdcApproval reads the
// wallet's current USDC allowance — so the UI knows BEFORE any click whether an
// Approve step is needed:
//   allowance ≥ price × periods → one step:  [Renew]
//   allowance < price × periods → two steps: [1. Approve USDC] → [2. Renew]
// Each step is its own click + tx; `phase` tells the UI which one is in flight.
//
// Writes go through useSendTx: embedded wallet → Privy sponsored (EIP-7702 +
// paymaster, a 0-ETH wallet can pay); external wallet → wagmi, own gas. Reads stay on wagmi.
import { useEffect, useState } from 'react';
import { useAccount, useConfig } from 'wagmi';
import { waitForTransactionReceipt, readContract, simulateContract } from '@wagmi/core';
import { useSendTx } from './useSendTx';
import { useUsdcApproval } from './useUsdcApproval';
import { encodeFunctionData } from 'viem';
import { baseSepolia } from 'viem/chains';
import { subscriptionManager } from '../lib/contract';
import { friendlyError } from '../lib/errors';
import { setSubOverride } from '../lib/subOverrides';

// loading = reading plan price · idle = waiting for a click ·
// approving/renewing = that tx is signing/mining · done = renew confirmed.
export type RenewPhase = 'loading' | 'idle' | 'approving' | 'renewing' | 'done';

export function useRenew(subId: `0x${string}`) {
    const config = useConfig();
    const { address } = useAccount();
    const { sendTx } = useSendTx();
    const { allowance, approve: approveUsdc } = useUsdcApproval();

    const [price, setPrice] = useState<bigint | null>(null);
    // On-chain truth, read fresh on open — the DB mirror can lag a just-flipped
    // plan. false = renewals are blocked by the contract; the UI should say so
    // up front instead of letting the user approve USDC for a doomed renew.
    const [planActive, setPlanActive] = useState<boolean | null>(null);
    const [phase, setPhase] = useState<RenewPhase>('loading');
    const [error, setError] = useState<Error>();

    // Read the plan price (via the sub) once per mount (the allowance read lives
    // in useUsdcApproval). `stale` guards the async writes if the modal closes
    // before the reads land.
    useEffect(() => {
        if (!address) return;
        let stale = false;
        (async () => {
            try {
                const sub = await readContract(config, {
                    ...subscriptionManager,
                    functionName: 'getSubscription',
                    args: [subId],
                });
                const plan = await readContract(config, {
                    ...subscriptionManager,
                    functionName: 'getPlan',
                    args: [sub.planId],
                });
                if (stale) return;
                setPrice(plan.price);
                setPlanActive(plan.active);
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
    }, [address, subId, config]);

    // The contract pulls price × periods; until both reads land, treat approval
    // as needed so the button can't jump the gun.
    const needsApproval = (periods: bigint) =>
        price === null || allowance === null || allowance < price * periods;

    // Step 1 — approve exactly what this renew will pull (no unlimited
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

    // Step 2 — the renew itself. `done` is the component's success signal.
    const renew = async (periods: bigint) => {
        setError(undefined);
        setPhase('renewing');
        try {
            // Dry-run before asking for a signature: a would-be revert throws here
            // with its DECODED custom error (e.g. PlanInactive) and costs nothing.
            // Skipping this hands the revert to the wallet's gas estimator, which
            // buries it under "exceeds max transaction gas limit".
            await simulateContract(config, {
                ...subscriptionManager,
                functionName: 'renew',
                args: [subId, periods],
                account: address,
            });
            const hash = await sendTx({
                to: subscriptionManager.address,
                data: encodeFunctionData({
                    abi: subscriptionManager.abi,
                    functionName: 'renew',
                    args: [subId, periods],
                }),
                chainId: baseSepolia.id,
            });
            const receipt = await waitForTransactionReceipt(config, { hash });
            if (receipt.status !== 'success') throw new Error('renew reverted');
            // The DB mirror won't see this Renewed event until the indexer
            // catches up (minutes+), so read the sub straight back from the
            // contract and remember its authoritative new state locally — the UI
            // merges it over the stale API row. Own try: the renew DID succeed;
            // a failed read here must not surface as a renew error.
            try {
                const sub = await readContract(config, {
                    ...subscriptionManager,
                    functionName: 'getSubscription',
                    args: [subId],
                });
                setSubOverride(subId, {
                    cancelled: sub.canceled,
                    // chain stores seconds, JS Date counts milliseconds → ×1000
                    expiresAt: new Date(Number(sub.expiryTimestamp) * 1000).toISOString(),
                });
            } catch {
                // best-effort: without the patch the row just stays stale
            }
            setPhase('done');
        } catch (e) {
            setError(friendlyError(e));
            setPhase('idle');
        }
    };

    return { phase, price, planActive, needsApproval, approve, renew, error };
}
