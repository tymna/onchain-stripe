// Shared class strings for the pieces every modal form repeats (input, submit,
// per-row control). One source of truth — CreatePlan, SubscribeButton, RenewButton,
// FeeSetters, MerchantPlans and Subscriptions all import from here, so the forms
// can never drift apart visually.

export const field =
    'border border-ink-800 bg-ink-950/60 px-3 py-2 text-sm text-paper outline-none ' +
    'transition-[border-color,box-shadow] duration-200 placeholder:text-faint ' +
    'focus:border-brand/50 focus:ring-2 focus:ring-brand/20';

export const primaryBtn =
    'mt-1 bg-brand px-3.5 py-2 text-sm font-medium text-ink-950 ' +
    'transition-all duration-200 hover:bg-brand-bright active:scale-[0.98] ' +
    'shadow-[0_8px_24px_-12px_rgba(204,255,229,0.5)] ' +
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brand';

export const rowBtn =
    'border border-ink-800 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-fog ' +
    'transition-colors duration-200 hover:border-ink-700 hover:bg-white/[0.05] hover:text-paper ' +
    'disabled:cursor-not-allowed disabled:opacity-40';

// List shell + row hover shared by the three ledger lists (Plans, Subscriptions,
// MerchantPlans): square-cut card with a hairline top-light, rows tint on hover.
export const listShell =
    'w-full divide-y divide-ink-800/60 overflow-hidden border border-ink-800 ' +
    'bg-ink-900/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]';

export const rowHover = 'transition-colors duration-200 hover:bg-white/[0.02]';

// Status stamp — ink on the statement line, never a box. Boxes mean "press me"
// (buttons); states are just printed. Color carries the state (mint = live,
// amber = lapsed, fog = cancelled, faint = fine print); the word confirms it.
// 0.18em tracking matches listToggle — same receipt-fine-print voice.
export const stamp =
    'flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em]';

// Footer row of a list card: the "show/hide inactive" toggle. Styled like a
// receipt's fine print — full-width, mono, quiet until hovered.
export const listToggle =
    'w-full px-4 py-2.5 text-center font-mono text-[0.65rem] uppercase tracking-[0.18em] ' +
    'text-faint transition-colors duration-200 hover:bg-white/[0.02] hover:text-paper';
