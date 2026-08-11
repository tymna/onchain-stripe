import { erc20Abi } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { usdcAddress } from '../lib/contract';
import { REFETCH_INTERVAL_MS } from '../lib/api';

// The connected wallet's USDC balance (base units, 6 decimals). Polled on the
// same cadence as the dashboard's API queries — so after a payment the header
// figure catches up within one poll. Callers format at the edge
// (lib/format usdc()); this returns the raw bigint.
export function useUsdcBalance() {
    const { address } = useAccount();
    return useReadContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address, refetchInterval: REFETCH_INTERVAL_MS },
    });
}
