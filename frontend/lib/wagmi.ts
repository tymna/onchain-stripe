import { createConfig } from '@privy-io/wagmi'; // NOT 'wagmi'
import { baseSepolia } from 'viem/chains';
import { http } from 'wagmi';

// Every read (simulate, getPlan, balance polls) goes through this transport.
// http(undefined) falls back to the chain's default public RPC, so a missing
// env var still works — just rate-limited and shared. The Alchemy URL must be
// NEXT_PUBLIC_* to reach the browser bundle; restrict the key by domain in the
// Alchemy dashboard, since anything NEXT_PUBLIC_ is visible to visitors.
export const wagmiConfig = createConfig({
    chains: [baseSepolia],
    transports: {
        [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
    },
});
