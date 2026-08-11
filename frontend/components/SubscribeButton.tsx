'use client';

// Per-plan-row Subscribe. Pure display: all the money logic (read price → approve
// USDC → subscribe) lives in useSubscribe, and the periods/total form is the
// shared PaymentForm. This file only owns what's subscribe-SPECIFIC: the two
// gates read on-chain at open (slot already taken, plan just disabled) and the
// success toast + refresh.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscribe } from '../hooks/useSubscribe';
import { useCanceledToast } from '../hooks/useCanceledToast';
import { ActionButton } from './ActionButton';
import { Modal } from './Modal';
import { PaymentForm } from './PaymentForm';

// The row already carries these (from usePlans); the hook re-reads the real
// price on-chain when the modal opens.
type PlanRow = {
    planId: number;
    name: string;
};

export function SubscribeButton({ plan }: { plan: PlanRow }) {
    const { address } = useAccount();
    const [open, setOpen] = useState(false);
    return (
        <>
            <ActionButton
                label="Subscribe"
                variant="primary"
                size="sm" // lives inside a list row — match the row's rhythm
                onClick={() => setOpen(true)}
                disabled={!address} // can't sign a tx without a connected wallet
            />
            <Modal open={open} onClose={() => setOpen(false)} title={`Subscribe · ${plan.name}`}>
                {/* Mount fresh each open so the hook + input reset every time. */}
                {open && <Body plan={plan} onClose={() => setOpen(false)} />}
            </Modal>
        </>
    );
}

function Body({ plan, onClose }: { plan: PlanRow; onClose: () => void }) {
    const queryClient = useQueryClient();
    const {
        phase,
        price,
        planActive,
        alreadySubscribed,
        needsApproval,
        approve,
        subscribe,
        error,
    } = useSubscribe(BigInt(plan.planId));

    // `done` fires exactly once, when the subscribe tx is confirmed → toast, refresh, close.
    useEffect(() => {
        if (phase !== 'done') return;
        toast.success(`Subscribed to ${plan.name}`);
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['metrics'] });
        onClose();
    }, [phase, plan.name, queryClient, onClose]);

    // A rejected signature = changed mind: toast it and close the modal; only
    // real failures stay rendered inline below the button.
    useCanceledToast(error, onClose);

    // One sub per (wallet, plan) — the hook read MY slot on-chain when the modal
    // opened. Catching it here (not at the subscribe step) matters because step 1
    // is a plain USDC approve: the token can't know the subscribe after it would
    // revert, so without this the user pays for an approve that buys nothing.
    // (After all hooks: early returns must not change the hook order.)
    if (alreadySubscribed) {
        return (
            <p className="text-xs text-fog">
                You already have a subscription to this plan — one wallet holds one subscription per
                plan. Manage or renew it under “Your subs”.
            </p>
        );
    }

    // Contract rule: an inactive plan blocks new subscribes. The catalog filters on
    // the DB's active flag, but that mirror can lag a just-disabled plan — the hook
    // read the plan on-chain when the modal opened, so trust that and say it plainly.
    if (planActive === false) {
        return (
            <p className="text-xs text-fog">
                This plan was just disabled by its merchant — new subscriptions are paused until
                it’s re-enabled.
            </p>
        );
    }

    return (
        <PaymentForm
            // map the hook's phase onto the form's generic one; 'done' unmounts anyway
            phase={phase === 'subscribing' ? 'paying' : phase === 'done' ? 'idle' : phase}
            price={price}
            needsApproval={needsApproval}
            approve={approve}
            pay={subscribe}
            action="Subscribe"
            actionBusy="Subscribing…"
            error={error}
        />
    );
}
