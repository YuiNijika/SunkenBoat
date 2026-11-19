import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { readInitialPayload, ThemeRouter } from './lib/router';
import 'nprogress/nprogress.css';
import './styles/app.css';

/**
 * The PHP layer renders the document shell and one JSON payload; everything
 * visible from here on is composed by React.
 */
const mount = document.getElementById('ttdf-app');
const initial = readInitialPayload();

if (mount && initial) {
    // Server-rendered fallback stays in the HTML for crawlers; once the React
    // tree is ready it is replaced instead of appended to.
    mount.replaceChildren();

    createRoot(mount).render(
        <StrictMode>
            <ThemeRouter initial={initial} />
        </StrictMode>
    );
} else {
    // Without a mount point or payload React cannot take over; reveal the
    // server-rendered fallback instead of leaving the boot screen up.
    document.documentElement.dataset.ttdfApp = 'ready';
}
