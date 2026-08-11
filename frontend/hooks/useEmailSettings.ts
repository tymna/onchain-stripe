import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';

const BASE = process.env.NEXT_PUBLIC_API_URL;

// Both halves talk to /settings/email with the Privy access token as the "who" —
// the API derives the wallet address from it server-side, so requests never
// carry an address the user could fake.

export type EmailStatus = { email: string; confirmed: boolean } | null;

async function authFetch(path: string, token: string, init?: RequestInit) {
    if (!BASE) throw new Error('NEXT_PUBLIC_API_URL is not set');
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res;
}

// Read half: null = never signed up, confirmed:false = link sent but not yet
// clicked. Confirmation happens out-of-band (a click in the user's inbox), so
// we lean on React Query's refetch-on-window-focus: tabbing back from the
// mailbox refreshes the stamp without any manual wiring.
export function useEmailStatus() {
    const { getAccessToken, authenticated } = usePrivy();

    return useQuery({
        queryKey: ['emailStatus'],
        enabled: authenticated, // no token to send while logged out
        queryFn: async (): Promise<EmailStatus> => {
            const token = await getAccessToken();
            if (!token) return null;
            const res = await authFetch('/settings/email', token);
            return res.json();
        },
    });
}

// Write half: POST the email; the API stores it unconfirmed and sends the
// confirmation link. On success refetch the status so the UI flips to
// "confirm link sent" immediately.
export function useEmailSettings() {
    const { getAccessToken } = usePrivy();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (email: string) => {
            // Fresh token per call — Privy rotates them; a stale one would 401.
            const token = await getAccessToken();
            if (!token) throw new Error('Log in first');
            await authFetch('/settings/email', token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['emailStatus'] });
        },
    });
}
