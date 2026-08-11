'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Reusable modal shell: dimmed overlay + centered card, closes on Esc or a click
// on the backdrop. Presentational — the caller owns open/close state and content.
// Mounts fresh each open, so the CSS entrance (backdrop fade, card pop) replays.
// Rendered via portal into <body>: position:fixed is relative to the nearest
// transformed ancestor, so left inline a section's entrance animation (or any
// future transform) would trap the overlay inside that section.
export function Modal({
    open,
    onClose,
    title,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-[fade_0.2s_ease-out]"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm border border-ink-700 bg-ink-900 p-5 shadow-2xl animate-[pop_0.25s_cubic-bezier(0.16,1,0.3,1)]"
            >
                <div className="mb-4 flex items-start justify-between gap-4">
                    <h2 className="font-display text-base font-semibold text-paper">{title}</h2>
                    {/* Visible escape hatch — Esc and backdrop-click already close,
                        but nothing on screen said so. × is text, not an icon lib. */}
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="-mr-1 -mt-1 px-1 text-lg leading-none text-fog transition-colors duration-200 hover:text-paper"
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body,
    );
}
