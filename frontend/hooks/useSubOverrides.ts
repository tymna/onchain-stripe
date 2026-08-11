import { useSyncExternalStore } from 'react';
import { subscribeSubOverrides, getSubOverridesVersion } from '../lib/subOverrides';

// Re-renders the calling component the moment any session-local sub override is
// written (a cancel/renew just confirmed). Call it in every component that reads
// getSubOverride — without it, React has no idea the Map changed. The returned
// version number itself is meaningless; only its changing matters.
export function useSubOverrides() {
    return useSyncExternalStore(
        subscribeSubOverrides,
        getSubOverridesVersion,
        getSubOverridesVersion, // server snapshot: same counter, SSR renders 0 overrides
    );
}
