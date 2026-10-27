// Testnet faucet — MockUSDC.mint(to, amount) is open to anyone, so a fresh
// wallet can fund itself and run the whole flow. Same write path as every
// other button (useSendTx: embedded wallet → sponsored, so 0 ETH is fine).
// On confirm, refetch the balance so the header figure updates right away
// instead of waiting for the next 30s poll.
import { useState } from 'react';
import { useAccount, useConfig } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { encodeFunctionData, parseAbi, parseUnits } from 'viem';
import { baseSepolia } from 'viem/chains';
import { useSendTx } from './useSendTx';
import { useUsdcBalance } from './useUsdcBalance';
import { usdcAddress } from '../lib/contract';
import { friendlyError } from '../lib/errors';

const mockUsdcAbi = parseAbi(['function mint(address to, uint256 amount)']);

export const FAUCET_AMOUNT = parseUnits('100', 6);

export function useMintUsdc() {
    const config = useConfig();
    const { address } = useAccount();
    const { sendTx } = useSendTx();
    const { refetch: refetchBalance } = useUsdcBalance();
    const [isPending, setPending] = useState(false);
    const [error, setError] = useState<Error>();
    const [isSuccess, setSuccess] = useState(false);

    const mint = async () => {
        if (!address) return;
        setPending(true);
        setError(undefined);
        setSuccess(false);
        try {
            const h = await sendTx({
                to: usdcAddress,
                data: encodeFunctionData({
                    abi: mockUsdcAbi,
                    functionName: 'mint',
                    args: [address, FAUCET_AMOUNT],
                }),
                chainId: baseSepolia.id,
            });
            const receipt = await waitForTransactionReceipt(config, { hash: h });
            if (receipt.status !== 'success') throw new Error('mint reverted');
            await refetchBalance();
            setSuccess(true);
        } catch (e) {
            setError(friendlyError(e));
        } finally {
            setPending(false);
        }
    };

    return { mint, isPending, isSuccess, error };
}
