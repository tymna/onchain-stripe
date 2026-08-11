// One door for every contract write. Privy's useSendTransaction serves ONLY the
// embedded wallet — called while connected with an external wallet (MetaMask,
// Rabby…) it throws "No embedded or connected wallet found for address". So
// dispatch on what the active wallet actually is:
//   embedded (walletClientType === 'privy') → Privy sendTransaction { sponsor: true }
//     — EIP-7702 + paymaster, a fresh wallet with 0 ETH can pay
//   external                                → wagmi sendTransaction, user pays own gas
//     — sponsorship can't wrap an external signer; its owner funds gas anyway
// Same request shape ({ to, data, chainId }) in and the tx hash out on both paths,
// so write hooks call sendTx() without caring which wallet is connected.
import { useSendTransaction as usePrivySendTransaction, useWallets } from '@privy-io/react-auth';
import { useAccount, useSendTransaction as useWagmiSendTransaction } from 'wagmi';
import type { Hash, Hex } from 'viem';

type TxRequest = { to: `0x${string}`; data: Hex; chainId: number };

export function useSendTx() {
    const { address } = useAccount();
    const { wallets } = useWallets();
    const { sendTransaction: privySend } = usePrivySendTransaction();
    const { sendTransactionAsync: wagmiSend } = useWagmiSendTransaction();

    const sendTx = async (req: TxRequest): Promise<Hash> => {
        // Match on address, not wallets[0] — Privy lists every linked wallet and
        // the ACTIVE one (wagmi's address) is what must sign.
        const active = wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase());
        if (active?.walletClientType === 'privy') {
            const { hash } = await privySend(req, { sponsor: true });
            return hash;
        }
        return wagmiSend(req);
    };

    return { sendTx };
}
