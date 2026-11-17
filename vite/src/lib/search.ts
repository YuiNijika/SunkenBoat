const SEARCH_EVENT = 'ttdf:search';

/**
 * The header owns the search dialog; other surfaces (the action rail) only
 * ask for it to open so the form state stays in one place.
 */
export function openSearch(): void {
    window.dispatchEvent(new Event(SEARCH_EVENT));
}

export function onSearchOpen(handler: () => void): () => void {
    window.addEventListener(SEARCH_EVENT, handler);

    return () => window.removeEventListener(SEARCH_EVENT, handler);
}
