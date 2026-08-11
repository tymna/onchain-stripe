// Shared placeholder for the read components' non-data states (no wallet /
// loading / error). A dashed slot — reads as "a line waiting to be printed",
// so every branch ends in the same quiet, intentional shape.

type EmptyProps = {
    children: React.ReactNode;
    tone?: 'error';
};

export function Empty({ children, tone }: EmptyProps) {
    return (
        <p
            className={`w-full border border-dashed px-4 py-4 text-center font-mono text-xs ${
                tone === 'error' ? 'border-red-400/25 text-red-400' : 'border-ink-800 text-faint'
            }`}
        >
            {children}
        </p>
    );
}
