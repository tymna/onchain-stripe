'use client';

// ---- Fee setters (onlyOwner) ---- //
// The three protocol knobs — one shared KnobSetter (button + live caption +
// modal form), three small configs. What differs per knob is exactly what the
// config carries: how to parse the input into a contract arg (its own use*Write
// hook over the generic useContractWrite), which getter feeds the caption, and
// the words. Each button carries the knob's CURRENT on-chain value as a
// caption — a setter without its dial is unreadable — and refreshes it when
// its set confirms.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useReadContract } from 'wagmi';
import { isAddress, parseUnits, zeroAddress, type Address } from 'viem';
import { useContractWrite } from '../hooks/useContractWrite';
import { useCanceledToast } from '../hooks/useCanceledToast';
import { isCanceled } from '../lib/errors';
import { subscriptionManager } from '../lib/contract';
import { usdc, addr } from '../lib/format';
import { ActionButton } from './ActionButton';
import { Modal } from './Modal';
import { field, primaryBtn } from './ui';

const captionCls = 'font-mono text-[0.65rem] tracking-wide text-faint';

// What every knob's write hook must hand the shared form: validity of the raw
// input, the parsed contract arg (so the caption cache can be patched with the
// exact value that was set), plus the generic write pipeline. While invalid,
// each hook feeds the contract a harmless placeholder and the form keeps
// submit disabled — the placeholder never actually runs.
type KnobWrite = ReturnType<typeof useContractWrite> & {
    valid: boolean;
    arg: bigint | Address;
};

// Basis points: 100 = 1%, so 250 = 2.5%. The contract's own ceiling (FeeTooHigh)
// is the real cap — here we only reject non-integers / negatives.
function useFeeRateWrite(raw: string): KnobWrite {
    const n = Number(raw);
    const valid = raw.trim() !== '' && Number.isInteger(n) && n >= 0;
    const arg = valid ? BigInt(n) : BigInt(0);
    return { valid, arg, ...useContractWrite('setFeeRate', [arg]) };
}

// Simulate needs a well-formed address, so while the input isn't one we feed
// the zero-address placeholder.
function useFeeRecipientWrite(raw: string): KnobWrite {
    const valid = isAddress(raw);
    const arg = valid ? (raw as Address) : zeroAddress;
    return { valid, arg, ...useContractWrite('setFeeRecipient', [arg]) };
}

// USDC amount (6 decimals): the owner types dollars, parseUnits → base units.
// 0 is a valid fee (free registration); a typo throws in parseUnits → invalid.
function useMerchantFeeWrite(raw: string): KnobWrite {
    let arg = BigInt(0);
    let valid = false;
    try {
        if (raw.trim() !== '') {
            arg = parseUnits(raw, 6);
            valid = true;
        }
    } catch {
        valid = false;
    }
    return { valid, arg, ...useContractWrite('setMerchantFee', [arg]) };
}

type Knob = {
    button: string; // button label + modal title
    inputLabel: string;
    placeholder: string;
    inputMode?: 'numeric' | 'decimal';
    useWrite: (raw: string) => KnobWrite;
    readFn: 'getFeeRate' | 'getFeeRecipient' | 'getMerchantFee'; // feeds the caption
    format: (v: bigint | string) => string; // on-chain value → caption text
    toast: string;
};

// onDone carries the confirmed value when there is one (set confirmed → patch
// the caption cache); a wallet rejection closes with no value, no patch.
function KnobForm({ knob, onDone }: { knob: Knob; onDone: (newValue?: bigint | Address) => void }) {
    const [value, setValue] = useState('');
    const [tried, setTried] = useState(false);

    const { valid, arg, write, canSubmit, isPending, isConfirming, isConfirmed, error } =
        knob.useWrite(value);
    const busy = isPending || isConfirming;
    // Rejected signature = changed mind → toast + close (real failures stay inline).
    useCanceledToast(error, onDone);

    useEffect(() => {
        if (isConfirmed) {
            toast.success(knob.toast);
            onDone(arg);
        }
    }, [isConfirmed, onDone, knob.toast, arg]);

    return (
        <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-fog">
                {knob.inputLabel}
                <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode={knob.inputMode}
                    placeholder={knob.placeholder}
                    className={field}
                />
            </label>
            <button
                onClick={() => {
                    setTried(true);
                    write();
                }}
                disabled={!valid || !canSubmit || busy}
                className={primaryBtn}
            >
                {busy ? 'Saving…' : 'Confirm'}
            </button>
            {tried && error && !isCanceled(error) && (
                <p className="text-xs text-red-400">{error.message}</p>
            )}
        </div>
    );
}

function KnobSetter({ knob }: { knob: Knob }) {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();
    const { data, queryKey } = useReadContract({
        ...subscriptionManager,
        functionName: knob.readFn,
    });
    return (
        <div className="flex flex-col items-center gap-1">
            <ActionButton label={knob.button} onClick={() => setOpen(true)} />
            {data !== undefined && <p className={captionCls}>{knob.format(data)}</p>}
            <Modal open={open} onClose={() => setOpen(false)} title={knob.button}>
                {/* mount the form only while open, so its hook + input reset each time */}
                {open && (
                    <KnobForm
                        knob={knob}
                        onDone={(newValue) => {
                            setOpen(false);
                            // Patch the caption's cache with the value the confirmed
                            // tx just set — on-chain truth, not a guess. Deliberately
                            // NOT invalidate: a refetch can hit a lagging RPC node,
                            // come back stale, and clobber the fresh value (these
                            // reads don't poll, so the stale answer would stick).
                            if (newValue !== undefined) {
                                queryClient.setQueryData(queryKey, newValue);
                            }
                        }}
                    />
                )}
            </Modal>
        </div>
    );
}

// ---- THE THREE KNOBS ---- //

const protocolFee: Knob = {
    button: 'Set protocol fee',
    inputLabel: 'Fee — basis points (100 = 1%)',
    placeholder: '250',
    inputMode: 'numeric',
    useWrite: useFeeRateWrite,
    readFn: 'getFeeRate',
    // bps → percent: 250 bps = 2.5% (100 bps = 1%).
    format: (v) => `${Number(v) / 100}% per payment`,
    toast: 'Protocol fee updated',
};

const feeRecipient: Knob = {
    button: 'Set fee recipient',
    inputLabel: 'New recipient address',
    placeholder: '0x…',
    useWrite: useFeeRecipientWrite,
    readFn: 'getFeeRecipient',
    format: (v) => addr(String(v)),
    toast: 'Fee recipient updated',
};

const merchantFee: Knob = {
    button: 'Set merchant fee',
    inputLabel: 'Fee (USDC)',
    placeholder: '5',
    inputMode: 'decimal',
    useWrite: useMerchantFeeWrite,
    readFn: 'getMerchantFee',
    format: (v) => `${usdc(String(v))} to register`,
    toast: 'Merchant fee updated',
};

export const SetProtocolFee = () => <KnobSetter knob={protocolFee} />;
export const SetFeeRecipient = () => <KnobSetter knob={feeRecipient} />;
export const SetMerchantFee = () => <KnobSetter knob={merchantFee} />;
