import type { Metadata } from 'next';
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import Providers from './provider';

// Three faces, three jobs: display carries the wordmark and titles, body does
// the reading, mono does every number/label/address (receipt-style, self-aligning).
const display = Bricolage_Grotesque({
    variable: '--font-bricolage',
    subsets: ['latin'],
});

const body = Instrument_Sans({
    variable: '--font-body',
    subsets: ['latin'],
});

// IBM Plex Mono isn't variable — weights must be listed explicitly.
const mono = IBM_Plex_Mono({
    variable: '--font-plex-mono',
    subsets: ['latin'],
    weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
    title: 'onchain-stripe',
    description: 'Stripe for Base',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${display.variable} ${body.variable} ${mono.variable} font-sans antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
