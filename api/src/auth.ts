import 'dotenv/config';
import { createMiddleware } from 'hono/factory';
import { PrivyClient } from '@privy-io/node';

const privy = new PrivyClient({
    appId: process.env.PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
});

// verifies the Privy access token and resolves the caller's wallet address —
// the address is trusted from the JWT, never from the request body
export const privyAuth = createMiddleware<{ Variables: { address: string } }>(async (c, next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return c.json({ error: 'missing token' }, 401);

    let address: string | undefined;
    try {
        const claims = await privy.utils().auth().verifyAccessToken(token);
        const user = await privy.users()._get(claims.user_id);
        const wallet = user.linked_accounts.find(
            (a) => a.type === 'wallet' && 'chain_type' in a && a.chain_type === 'ethereum',
        );
        if (wallet && 'address' in wallet) address = wallet.address.toLowerCase();
    } catch (err) {
        // 401 stays opaque to the caller; the real reason goes to the server log
        console.error('privyAuth:', err);
        return c.json({ error: 'invalid token' }, 401);
    }

    if (!address) return c.json({ error: 'no wallet linked' }, 401);
    c.set('address', address);
    await next();
});
