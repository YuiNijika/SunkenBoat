const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const UNSAFE_CHARS = /["'\\<>`]/;
const ALLOWED_URL = /^(?:https?:\/\/|\/(?!\/))/i;
const PARENT_SEGMENT = /(?:^|\/)\.\.(?:\/|$)/;
const MAX_URL_LENGTH = 2048;

/**
 * Normalise an image URL before it is interpolated into a CSS value.
 *
 * Most values are already validated by the PHP side, but page data can be
 * cached or edited by hand. Keeping the frontend check in one place prevents
 * quotes, backslashes and control characters from breaking out of `url(...)`.
 */
export function safeCssUrl(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }

    const url = value.trim();
    if (
        url === ''
        || url.length > MAX_URL_LENGTH
        || CONTROL_CHARS.test(url)
        || UNSAFE_CHARS.test(url)
        || !ALLOWED_URL.test(url)
        || PARENT_SEGMENT.test(url)
    ) {
        return null;
    }

    return url;
}

/**
 * Build a CSS `url()` token, or `none` when the value is not acceptable.
 * `none` is a valid image layer, so gradients in front of it still render.
 */
export function cssUrl(value: unknown): string {
    const url = safeCssUrl(value);
    return url === null ? 'none' : `url(${JSON.stringify(url)})`;
}
