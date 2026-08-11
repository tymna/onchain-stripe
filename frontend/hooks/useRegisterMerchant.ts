// Wraps SubscriptionManager.registerMerchant() — pays merchantFee, sets isMerchant.
// Two txs in one click: approve the fee (shared USDC mechanics in useUsdcApproval),
// then register. Writes go through useSendTx: embedded wallet → Privy sponsored
// (EIP-7702 + paymaster, a 0-ETH wallet can pay); external wallet → wagmi, own gas.
import { useState } from 'react';
import { useReadContract, useConfig } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { useSendTx } from './useSendTx';
import { useUsdcApproval } from './useUsdcApproval';
import { encodeFunctionData } from 'viem';
import type { Hash } from 'viem';
import { baseSepolia } from 'viem/chains';
import { subscriptionManager } from '../lib/contract';
import { friendlyError } from '../lib/errors';

export function useRegisterMerchant() {
    const config = useConfig();
    const { sendTx } = useSendTx();
    const { approve: approveUsdc } = useUsdcApproval();
    const { data: merchantFee } = useReadContract({
        ...subscriptionManager,
        functionName: 'getMerchantFee',
    });
    const [hash, setHash] = useState<Hash>();
    const [isPending, setPending] = useState(false);
    const [isSuccess, setSuccess] = useState(false);
    const [error, setError] = useState<Error>();

    const registerMerchant = async () => {
        if (merchantFee === undefined) return;

        setPending(true);
        setError(undefined);
        setSuccess(false);
        try {
            await approveUsdc(merchantFee);

            const h = await sendTx({
                to: subscriptionManager.address,
                data: encodeFunctionData({
                    abi: subscriptionManager.abi,
                    functionName: 'registerMerchant',
                    args: [],
                }),
                chainId: baseSepolia.id,
            });
            setHash(h);
            const receipt = await waitForTransactionReceipt(config, { hash: h });
            if (receipt.status !== 'success') throw new Error('registerMerchant reverted');
            setSuccess(true);
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setPending(false);
        }
    };

    return { registerMerchant, hash, isPending, isSuccess, error };
}
