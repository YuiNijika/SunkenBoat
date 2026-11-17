import { useEffect, useState } from 'react';
import type { ThemeName } from '../types';

export type { ThemeName };

const STORAGE_KEY = 'ttdf-theme';

export function storedTheme(): ThemeName | null {
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        return value === 'light' || value === 'dark' ? value : null;
    } catch {
        return null;
    }
}

export function currentTheme(): ThemeName {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: ThemeName): void {
    const root = document.documentElement;
    root.dataset.theme = theme;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const color = theme === 'dark' ? root.dataset.themeColorDark : root.dataset.themeColorLight;
    if (meta && color) {
        meta.setAttribute('content', color);
    }

    window.dispatchEvent(new CustomEvent<ThemeName>('ttdf:themechange', { detail: theme }));
}

export function setTheme(theme: ThemeName): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // Storage can be blocked; the current page still switches.
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transitionDocument = document as Document & {
        startViewTransition?: (callback: () => void) => {
            ready: Promise<void>;
        };
    };

    if (reduceMotion || typeof transitionDocument.startViewTransition !== 'function') {
        applyTheme(theme);
        return;
    }

    const transition = transitionDocument.startViewTransition(() => applyTheme(theme));
    void transition.ready
        .then(() => {
            document.documentElement.animate(
                [
                    { clipPath: 'circle(0% at 50% 0%)' },
                    { clipPath: 'circle(150% at 50% 0%)' },
                ],
                {
                    duration: 420,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    pseudoElement: '::view-transition-new(root)',
                }
            );
        })
        .catch(() => {
            // The theme is already applied; a cancelled transition is harmless.
        });
}

/**
 * Reactive view of the document theme.
 *
 * The initial value is painted by the inline script in the PHP head, so this
 * hook only mirrors `data-theme` and keeps the system preference in sync when
 * the site is configured to follow it.
 */
export function useTheme(colorMode: string): {
    theme: ThemeName;
    toggle: () => void;
} {
    const [theme, setThemeState] = useState<ThemeName>(() => currentTheme());

    useEffect(() => {
        const onChange = (event: Event) => {
            const detail = (event as CustomEvent<ThemeName>).detail;
            setThemeState(detail === 'dark' ? 'dark' : 'light');
        };

        window.addEventListener('ttdf:themechange', onChange);
        return () => window.removeEventListener('ttdf:themechange', onChange);
    }, []);

    useEffect(() => {
        if (colorMode !== 'auto') {
            return;
        }

        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const sync = () => {
            if (storedTheme() !== null) {
                return;
            }

            applyTheme(query.matches ? 'dark' : 'light');
        };

        sync();
        query.addEventListener('change', sync);
        return () => query.removeEventListener('change', sync);
    }, [colorMode]);

    return {
        theme,
        toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    };
}
