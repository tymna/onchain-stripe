import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

// Turns a raw viem/wallet error into something a user can act on. Wallets bury
// reverts under junk like "exceeds max transaction gas limit" (they can't
// estimate gas for a tx that reverts); simulateContract throws the decoded
// custom error instead, and this maps its name to a plain sentence.

// One entry per contract error a USER can actually trigger from the UI.
// Anything unmapped falls through with its decoded name, so a new contract
// error is still identifiable — just not yet translated.
const MESSAGES: Record<string, string> = {
    PlanInactive:
        'This plan was disabled by its merchant — subscribing and renewing are paused until it is re-enabled.',
    PlanNotFound: 'This plan does not exist on-chain.',
    SubscriptionExists:
        'You already have a subscription to this plan — renew it from “Your subs” instead.',
    SubscriptionNotActive: 'This subscription is not active.',
    NotSubscriptionOwner: 'Only the wallet that owns this subscription can do that.',
    NotPlanOwner: 'Only the merchant who owns this plan can do that.',
    NotMerchant: 'This wallet is not registered as a merchant.',
    AlreadyMerchant: 'This wallet is already registered as a merchant.',
    ZeroPeriods: 'Periods must be at least 1.',
};

export function friendlyError(e: unknown): Error {
    // Declining in the wallet isn't a failure — one calm line, never the raw
    // request dump. Three detections, because every wallet stack words it
    // differently: viem's typed error (wagmi path), the EIP-1193 code 4001
    // (ethers uses ACTION_REJECTED), and a message match wide enough for
    // Privy's embedded wallet and MetaMask's smart-account flow.
    const message = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: number | string } | null)?.code;
    if (
        (e instanceof BaseError && e.walk((err) => err instanceof UserRejectedRequestError)) ||
        code === 4001 ||
        code === 'ACTION_REJECTED' ||
        /user rejected|user denied|user declined|user canceled|user cancelled|rejected the request|rejected by user|denied transaction|declined transaction/i.test(
            message,
        )
    ) {
        return new Error(CANCELED_MESSAGE);
    }

    if (e instanceof BaseError) {
        const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
        if (revert instanceof ContractFunctionRevertedError) {
            const name = revert.data?.errorName;
            if (name && MESSAGES[name]) return new Error(MESSAGES[name]);
            if (name) return new Error(`Transaction would revert: ${name}`);
            // string revert (e.g. an ERC-20's "transfer amount exceeds balance")
            if (revert.reason) return new Error(revert.reason);
        }
        // viem's one-line summary beats the multi-paragraph raw dump
        return new Error(e.shortMessage);
    }
    return e instanceof Error ? e : new Error(String(e));
}

// Same, but lets "no error yet" through untouched — for hooks whose `error`
// is a ?? chain over sources that are usually all undefined.
export function friendlyErrorOpt(e: unknown): Error | undefined {
    return e == null ? undefined : friendlyError(e);
}

// A wallet rejection is a change of mind, not a failure state — components
// route it to a toast instead of parking it in the form (see useCanceledToast).
export const CANCELED_MESSAGE = 'You canceled the request in your wallet.';
export function isCanceled(e?: Error | null): boolean {
    return e?.message === CANCELED_MESSAGE;
}
