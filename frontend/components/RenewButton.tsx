'use client';

// Per-subscription-row Renew — the way back from a lapse/cancel. Pure display: all
// the money logic (read the sub's plan → approve USDC → renew) lives in useRenew,
// and the periods/total form is the shared PaymentForm. This file only owns what's
// renew-SPECIFIC: the disabled-plan gate and the success toast + refresh.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { useRenew } from '../hooks/useRenew';
import { useCanceledToast } from '../hooks/useCanceledToast';
import { ActionButton } from './ActionButton';
import { Modal } from './Modal';
import { PaymentForm } from './PaymentForm';

// subId is ALREADY 0x-prefixed by the row (the indexer stores bare hex; viem needs a
// 0x bytes32) — never re-derive it here. planName is display-only (title + toast).
// action = the word the row wants: same modal + hook either way, but on an Active
// sub this reads "Extend" (pre-pay more time) and on Lapsed/Cancelled "Renew"
// (reactivate) — one contract call, two user intentions.
type RenewButtonProps = {
    subId: `0x${string}`;
    planName: string;
    action?: 'Renew' | 'Extend';
};

export function RenewButton({ subId, planName, action = 'Renew' }: RenewButtonProps) {
    const { address } = useAccount();
    const [open, setOpen] = useState(false);
    return (
        <>
            <ActionButton
                label={action}
                variant="primary"
                size="sm" // lives inside a list row — match the row's rhythm
                onClick={() => setOpen(true)}
                disabled={!address} // can't sign a tx without a connected wallet
            />
            <Modal open={open} onClose={() => setOpen(false)} title={`${action} · ${planName}`}>
                {/* Mount fresh each open so the hook + input reset every time. */}
                {open && (
                    <Body
                        subId={subId}
                        planName={planName}
                        action={action}
                        onClose={() => setOpen(false)}
                    />
                )}
            </Modal>
        </>
    );
}

function Body({
    subId,
    planName,
    action = 'Renew',
    onClose,
}: RenewButtonProps & { onClose: () => void }) {
    const queryClient = useQueryClient();
    const { phase, price, planActive, needsApproval, approve, renew, error } = useRenew(subId);

    // `done` fires exactly once, when the renew tx is confirmed → toast, refresh,
    // close. (The session-local override — new expiry, un-cancel — was already
    // stored by useRenew, read straight back from the contract.)
    useEffect(() => {
        if (phase !== 'done') return;
        toast.success(`${action === 'Extend' ? 'Extended' : 'Renewed'} ${planName}`);
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['metrics'] });
        onClose();
    }, [phase, planName, action, queryClient, onClose]);

    // A rejected signature = changed mind: toast it and close the modal; only
    // real failures stay rendered inline below the button.
    useCanceledToast(error, onClose);

    // Contract rule: an inactive plan blocks renew (disable-don't-delete). Known
    // before any click — the hook read the plan on-chain when the modal opened —
    // so say it plainly instead of offering a flow that ends in a revert.
    // (After all hooks: early returns must not change the hook order.)
    if (planActive === false) {
        return (
            <p className="text-xs text-fog">
                This plan was disabled by its merchant — renewals are paused until it’s re-enabled.
                Your subscription stays valid to its expiry.
            </p>
        );
    }

    return (
        <PaymentForm
            // map the hook's phase onto the form's generic one; 'done' unmounts anyway
            phase={phase === 'renewing' ? 'paying' : phase === 'done' ? 'idle' : phase}
            price={price}
            needsApproval={needsApproval}
            approve={approve}
            pay={renew}
            action={action}
            actionBusy={action === 'Extend' ? 'Extending…' : 'Renewing…'}
            error={error}
        />
    );
}
