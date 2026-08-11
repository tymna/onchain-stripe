import { useState } from 'react';
import { useSimulateContract, useWaitForTransactionReceipt } from 'wagmi';
import { encodeFunctionData } from 'viem';
import type { ContractFunctionArgs, ContractFunctionName, Hash } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useSendTx } from './useSendTx';
import { subscriptionManager } from '../lib/contract';
import { friendlyErrorOpt } from '../lib/errors';

// The one simulate → send → receipt pipeline behind every single-step contract
// write (cancel, createPlan, updatePlan, setPlanActive, the three fee knobs).
// Each named hook is a one-line wrapper over this — same return shape
// everywhere, one place to fix the pattern instead of seven copies.
//
// Simulate stays as the preflight gate (canSubmit); the write itself goes
// through useSendTx — embedded wallet → Privy sponsored (gasless); external
// wallet → wagmi (own gas).

type WriteAbi = typeof subscriptionManager.abi;
type WriteName = ContractFunctionName<WriteAbi, 'nonpayable' | 'payable'>;

export function useContractWrite<name extends WriteName>(
    functionName: name,
    args: ContractFunctionArgs<WriteAbi, 'nonpayable' | 'payable', name>,
) {
    const { data: sim, error: simError } = useSimulateContract({
        ...subscriptionManager,
        functionName,
        args,
    } as Parameters<typeof useSimulateContract>[0]);
    const { sendTx } = useSendTx();

    const [hash, setHash] = useState<Hash>();
    const [isPending, setPending] = useState(false);
    const [writeError, setWriteError] = useState<Error>();

    const write = async () => {
        if (!sim) return;
        setPending(true);
        setWriteError(undefined);
        try {
            const h = await sendTx({
                to: subscriptionManager.address,
                data: encodeFunctionData({
                    abi: subscriptionManager.abi,
                    functionName,
                    args,
                } as Parameters<typeof encodeFunctionData>[0]),
                chainId: baseSepolia.id,
            });
            setHash(h);
        } catch (e) {
            setWriteError(e as Error);
        } finally {
            setPending(false);
        }
    };

    // receipt carries the tx logs — createPlan's wrapper needs it to decode the
    // contract-assigned planId from the PlanCreated event.
    const {
        data: receipt,
        isLoading: isConfirming,
        isSuccess: isConfirmed,
        error: receiptError,
    } = useWaitForTransactionReceipt({ hash });

    return {
        write,
        canSubmit: !!sim?.request,
        hash,
        receipt,
        isPending,
        isConfirming,
        isConfirmed,
        error: friendlyErrorOpt(simError ?? writeError ?? receiptError),
    };
}
