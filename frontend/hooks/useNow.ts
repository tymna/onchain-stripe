import { useEffect, useState } from 'react';

// A lapse changes no data — expiresAt is fixed and no event fires — so polling
// the API can't surface it (the row comes back identical, so no re-render). This
// ticking clock forces a re-render on an interval, so derived status rechecks
// against the current time and an expired sub flips Active → Lapsed on its own.
// 30_000 ms = 30s: fine granularity for a badge; anything finer is pointless.
export function useNow(intervalMs = 30_000) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}
