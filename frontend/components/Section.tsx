// One ledger row: a role label on the left, its actions on the right,
// divided by a perforated tear-line — like a section of a billing statement.

type SectionProps = {
    title: string;
    // Optional fine print under the title — e.g. Protocol's "current:", labelling
    // the row of live values that sits under the setter buttons across the gap.
    note?: string;
    children: React.ReactNode;
};

export function Section({ title, note, children }: SectionProps) {
    return (
        <section className="tear grid grid-cols-1 gap-4 py-7 sm:grid-cols-[140px_1fr] sm:gap-8">
            <div className="pt-1.5">
                <h2 className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-faint">
                    {title}
                </h2>
                {/* mt-5 drops the note to roughly the caption line under the
                    buttons (button ≈36px + gap) so the two read as one row. */}
                {note && (
                    <p className="mt-5 font-mono text-[0.65rem] tracking-wide text-faint">{note}</p>
                )}
            </div>
            <div className="flex flex-wrap gap-2">{children}</div>
        </section>
    );
}
