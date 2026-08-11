import { useEffect, useState } from 'react';
import { useAccount, useConfig } from 'wagmi';
import { readContract, waitForTransactionReceipt } from '@wagmi/core';
import { encodeFunctionData, erc20Abi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useSendTx } from './useSendTx';
import { subscriptionManager, usdcAddress } from '../lib/contract';

// The shared USDC pre-payment step for every flow that lets the manager pull
// tokens (subscribe, renew, registerMerchant). Reads the wallet's current
// allowance on mount; approve(amount) sends the approve tx, waits for its
// receipt, and tracks the new allowance locally so needsApproval-style checks
// flip without another RPC read.
//
// approve() THROWS on failure/rejection — the calling hook owns phase + error
// state, this only owns the ERC-20 mechanics.
export function useUsdcApproval() {
    const config = useConfig();
    const { address } = useAccount();
    const { sendTx } = useSendTx();

    // null = not read yet; callers treat that as "approval needed" so a button
    // can't jump the gun before the read lands.
    const [allowance, setAllowance] = useState<bigint | null>(null);

    useEffect(() => {
        if (!address) return;
        let stale = false;
        readContract(config, {
            address: usdcAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, subscriptionManager.address],
        })
            .then((current) => {
                if (!stale) setAllowance(current);
            })
            .catch(() => {
                // stay null → treated as "needs approval"; the approve tx itself
                // will surface any real problem
            });
        return () => {
            stale = true;
        };
    }, [address, config]);

    const approve = async (amount: bigint) => {
        const hash = await sendTx({
            to: usdcAddress,
            data: encodeFunctionData({
                abi: erc20Abi,
                functionName: 'approve',
                args: [subscriptionManager.address, amount],
            }),
            chainId: baseSepolia.id,
        });
        const receipt = await waitForTransactionReceipt(config, { hash });
        if (receipt.status !== 'success') throw new Error('approve reverted');
        setAllowance(amount);
    };

    return { allowance, approve };
}
