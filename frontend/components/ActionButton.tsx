// Dumb, presentational button. Knows nothing about contracts —
// it just renders and fires whatever onClick the page hands it.
// `primary` is reserved for the one "money" action (Subscribe / Renew).
// `sm` is the row-scale size: inside a list row the button must match the
// row's rhythm (same height as the stamps beside it), so it drops the glow too.

type ActionButtonProps = {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
    size?: 'md' | 'sm';
};

export function ActionButton({
    label,
    onClick,
    disabled,
    variant = 'secondary',
    size = 'md',
}: ActionButtonProps) {
    const base =
        'font-medium transition-all duration-200 ' +
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950';

    const sizes = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm';

    const styles =
        variant === 'primary'
            ? 'bg-brand text-ink-950 hover:bg-brand-bright ' +
              'focus-visible:ring-brand/60 disabled:hover:bg-brand ' +
              (size === 'md' ? 'shadow-[0_8px_24px_-12px_rgba(204,255,229,0.5)] ' : '')
            : 'border border-ink-800 bg-white/[0.03] text-fog ' +
              'hover:border-ink-700 hover:bg-white/[0.05] hover:text-paper ' +
              'focus-visible:ring-ink-700';

    return (
        <button onClick={onClick} disabled={disabled} className={`${base} ${sizes} ${styles}`}>
            {label}
        </button>
    );
}
