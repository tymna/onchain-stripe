'use client';

import { WagmiProvider } from '@privy-io/wagmi'; // NOT 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '../lib/wagmi';

import { PrivyProvider } from '@privy-io/react-auth';
import { baseSepolia } from 'viem/chains';
import { Toaster } from 'sonner';

const queryClient = new QueryClient();

export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <PrivyProvider
            // Public identifiers (they ship in the JS bundle either way), but env
            // vars let dev/prod point at different Privy apps without a code edit.
            // The ! tells TypeScript "trust me, it's set" — if it isn't, Privy
            // throws its own clear error on startup.
            appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
            clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID}
            config={{
                // ----
                loginMethods: ['wallet', 'google', 'twitter', 'email', 'passkey'],
                appearance: {
                    // for built-in UI
                    theme: 'dark',
                    accentColor: '#CCFFE5',
                    walletList: ['metamask', 'rabby_wallet', 'phantom'],
                },
                embeddedWallets: {
                    ethereum: {
                        createOnLogin: 'users-without-wallets',
                    },
                },

                // ----
                defaultChain: baseSepolia,
                supportedChains: [baseSepolia],
            }}
        >
            <QueryClientProvider client={queryClient}>
                <WagmiProvider config={wagmiConfig}>
                    {children}
                    {/* One Toaster for the whole app — every tx-success toast routes here. */}
                    <Toaster position="bottom-right" theme="dark" richColors closeButton />
                </WagmiProvider>
            </QueryClientProvider>
        </PrivyProvider>
    );
}
