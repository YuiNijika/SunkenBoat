import type { SearchScope } from '../types';

const SEARCH_EVENT = 'ttdf:search';

/**
 * The header owns the search dialog; other surfaces (the action rail) only
 * ask for it to open so the form state stays in one place.
 */
export function openSearch(scope: SearchScope | null = null): void {
    window.dispatchEvent(new CustomEvent<SearchScope | null>(SEARCH_EVENT, { detail: scope }));
}

export function onSearchOpen(handler: (scope: SearchScope | null) => void): () => void {
    const listener = (event: Event) => {
        handler(event instanceof CustomEvent ? (event.detail as SearchScope | null) : null);
    };
    window.addEventListener(SEARCH_EVENT, listener);

    return () => window.removeEventListener(SEARCH_EVENT, listener);
}
