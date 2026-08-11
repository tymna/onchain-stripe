import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { isCanceled } from '../lib/errors';

// Routes a wallet rejection out of the form: toast (auto-dismisses ~4s) and,
// for modal forms, close via onCanceled. Other errors are untouched — the
// caller keeps rendering those inline, filtered with !isCanceled(error).
//
// Refs, not effect deps: some hooks rebuild the error OBJECT every render
// (friendlyErrorOpt over a ?? chain), and callers pass onCanceled as an inline
// arrow — depending on either would re-fire the toast on unrelated renders.
// `handled` latches per error episode and resets when the error clears (every
// hook does setError(undefined) at the start of the next attempt).
export function useCanceledToast(error: Error | undefined, onCanceled?: () => void) {
    const handled = useRef(false);
    const close = useRef(onCanceled);
    // Refresh the ref in an effect, not during render (react-hooks/refs). This
    // one is declared first, so it runs before the toast effect below reads it.
    useEffect(() => {
        close.current = onCanceled;
    });

    useEffect(() => {
        if (!error) {
            handled.current = false;
            return;
        }
        if (!handled.current && isCanceled(error)) {
            handled.current = true;
            toast.error(error.message);
            close.current?.();
        }
    });
}
