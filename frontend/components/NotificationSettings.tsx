'use client';

// "Email reminders" — attach an email to the connected wallet; the cron then
// mails a heads-up 3 days before any subscription expires. Pure display: the
// authenticated calls live in useEmailSettings/useEmailStatus. Three states,
// mirroring the DB row: no row → the button; row unconfirmed → "confirm link
// sent" stamp; confirmed → "reminders on" stamp. Signing up succeeding IS the
// button turning into a stamp (same grammar as Register Merchant disappearing).

import { useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { useEmailSettings, useEmailStatus } from '../hooks/useEmailSettings';
import { ActionButton } from './ActionButton';
import { Modal } from './Modal';
import { field, primaryBtn, stamp } from './ui';

export function NotificationSettings() {
    const { address } = useAccount();
    const [open, setOpen] = useState(false);
    const { data: status } = useEmailStatus();

    return (
        // Hugs its content — it sits in the header's right-aligned account
        // cluster (UserPill, balance, this), not in a full-width section.
        <div className="flex items-center gap-3">
            {status ? (
                // Stamp, not a box: state is printed ink (mint = armed, amber =
                // waiting on the inbox); the small Change button stays the only
                // pressable thing. Email sits outside the stamp — uppercase
                // tracking would mangle an address people need to read.
                <>
                    <span
                        className={`${stamp} ${status.confirmed ? 'text-mint' : 'text-amber-300'}`}
                    >
                        {status.confirmed ? 'reminders on' : 'confirm link sent'}
                    </span>
                    <span className="font-mono text-xs text-faint">{status.email}</span>
                    <ActionButton
                        label={status.confirmed ? 'Change' : 'Resend'}
                        size="sm"
                        onClick={() => setOpen(true)}
                    />
                </>
            ) : (
                <ActionButton
                    label="Email reminders"
                    size="sm" // header-scale, quiet — not a money action
                    onClick={() => setOpen(true)}
                    disabled={!address} // the API binds the email to the connected wallet
                />
            )}
            <Modal open={open} onClose={() => setOpen(false)} title="Email reminders">
                {/* Mount fresh each open so the input + mutation state reset. */}
                {open && <Body onClose={() => setOpen(false)} />}
            </Modal>
        </div>
    );
}

function Body({ onClose }: { onClose: () => void }) {
    const [email, setEmail] = useState('');
    const { mutate, isPending, error } = useEmailSettings();
    // Light shape check to keep the button honest — zod on the API is the real
    // validator, and the confirmation link is the real proof the inbox exists.
    const valid = /\S+@\S+\.\S+/.test(email);

    const submit = () => {
        if (!valid) return;
        mutate(email, {
            onSuccess: () => {
                toast.success('Confirmation link sent — check your inbox');
                onClose();
            },
        });
    };

    return (
        <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-fog">
                Where to send expiry reminders
                <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    className={field}
                />
            </label>
            <p className="text-xs text-faint">
                One email, 3 days before a subscription expires. Re-submitting later replaces the
                address (and asks you to confirm again).
            </p>
            <button onClick={submit} disabled={!valid || isPending} className={primaryBtn}>
                {isPending ? 'Sending…' : 'Send confirmation link'}
            </button>
            {error && <p className="text-xs text-red-400">{error.message}</p>}
        </div>
    );
}
