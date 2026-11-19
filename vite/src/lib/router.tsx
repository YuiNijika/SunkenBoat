import { useEffect, useRef } from 'react';
import {
    createBrowserRouter,
    isRouteErrorResponse,
    redirect,
    RouterProvider,
    ScrollRestoration,
    useLoaderData,
    useLocation,
    useNavigate,
    useNavigation,
    useRouteError,
} from 'react-router-dom';
import type { LoaderFunctionArgs } from 'react-router-dom';
import NProgress from 'nprogress';
import App from '../App';
import { parsePageData } from '../types';
import type { PageData } from '../types';
import { Button } from '../components/ui/button';

NProgress.configure({ showSpinner: false, trickleSpeed: 120, minimum: 0.08 });

const CACHE_TTL = 30_000;

interface RouteMeta {
    title: string;
    description: string;
    robots: string;
    canonical: string;
    locale: string;
    image: string;
    ogTitle: string;
    ogDescription: string;
    ogUrl: string;
    ogType: string;
    siteName: string;
    articlePublishedTime: string;
    articleModifiedTime: string;
    twitterCard: string;
    twitterTitle: string;
    twitterDescription: string;
    twitterImage: string;
    jsonLd: string;
}

interface RoutePayload {
    data: PageData;
    meta: RouteMeta;
}

interface FetchResult {
    payload: RoutePayload;
    finalUrl: string;
    redirected: boolean;
}

interface CacheEntry {
    result: FetchResult;
    at: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<FetchResult | null>>();

function routeKey(url: URL): string {
    return url.pathname + url.search;
}

function metaContent(doc: Document, selector: string): string {
    return doc.querySelector(selector)?.getAttribute('content')?.trim() ?? '';
}

function linkHref(doc: Document, selector: string): string {
    return doc.querySelector(selector)?.getAttribute('href')?.trim() ?? '';
}

function readMeta(doc: Document, url: URL): RouteMeta {
    return {
        title: doc.title.trim(),
        description: metaContent(doc, 'meta[name="description"]'),
        robots: metaContent(doc, 'meta[name="robots"]'),
        canonical: linkHref(doc, 'link[rel="canonical"]') || url.toString(),
        locale: metaContent(doc, 'meta[property="og:locale"]'),
        image: metaContent(doc, 'meta[property="og:image"]'),
        ogTitle: metaContent(doc, 'meta[property="og:title"]'),
        ogDescription: metaContent(doc, 'meta[property="og:description"]'),
        ogUrl: metaContent(doc, 'meta[property="og:url"]'),
        ogType: metaContent(doc, 'meta[property="og:type"]'),
        siteName: metaContent(doc, 'meta[property="og:site_name"]'),
        articlePublishedTime: metaContent(doc, 'meta[property="article:published_time"]'),
        articleModifiedTime: metaContent(doc, 'meta[property="article:modified_time"]'),
        twitterCard: metaContent(doc, 'meta[name="twitter:card"]'),
        twitterTitle: metaContent(doc, 'meta[name="twitter:title"]'),
        twitterDescription: metaContent(doc, 'meta[name="twitter:description"]'),
        twitterImage: metaContent(doc, 'meta[name="twitter:image"]'),
        jsonLd: doc.querySelector('script[type="application/ld+json"]')?.textContent?.trim() ?? '',
    };
}

function setMeta(attribute: 'name' | 'property', key: string, value: string): void {
    const selector = `meta[${attribute}="${key}"]`;
    const existing = document.head.querySelector<HTMLMetaElement>(selector);

    if (value === '') {
        existing?.remove();
        return;
    }

    const meta = existing ?? document.createElement('meta');
    if (!existing) {
        meta.setAttribute(attribute, key);
        document.head.append(meta);
    }
    meta.setAttribute('content', value);
}

function applyMeta(meta: RouteMeta): void {
    if (meta.title !== '') {
        document.title = meta.title;
    }

    setMeta('name', 'description', meta.description);
    setMeta('name', 'robots', meta.robots);
    setMeta('property', 'og:locale', meta.locale);
    setMeta('property', 'og:title', meta.ogTitle || meta.title);
    setMeta('property', 'og:description', meta.ogDescription || meta.description);
    setMeta('property', 'og:url', meta.ogUrl || meta.canonical);
    setMeta('property', 'og:type', meta.ogType);
    setMeta('property', 'og:site_name', meta.siteName);
    setMeta('property', 'og:image', meta.image);
    setMeta('property', 'og:image:alt', meta.image ? meta.title : '');
    setMeta('property', 'article:published_time', meta.articlePublishedTime);
    setMeta('property', 'article:modified_time', meta.articleModifiedTime);
    setMeta('name', 'twitter:card', meta.twitterCard || (meta.image ? 'summary_large_image' : 'summary'));
    setMeta('name', 'twitter:title', meta.twitterTitle || meta.title);
    setMeta('name', 'twitter:description', meta.twitterDescription || meta.description);
    setMeta('name', 'twitter:image', meta.twitterImage || meta.image);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.append(canonical);
    }
    canonical.href = meta.canonical || window.location.href;

    const jsonLd = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    if (meta.jsonLd !== '') {
        const script = jsonLd ?? document.createElement('script');
        if (!jsonLd) {
            script.type = 'application/ld+json';
            document.head.append(script);
        }
        script.textContent = meta.jsonLd;
    } else {
        jsonLd?.remove();
    }
}

function syncDocument(payload: RoutePayload): void {
    applyMeta(payload.meta);

    const script = document.getElementById('ttdf-app-data');
    if (script) {
        script.textContent = JSON.stringify(payload.data);
    }
}

function readInitialPayload(): RoutePayload | null {
    const script = document.getElementById('ttdf-app-data');
    if (!script) {
        return null;
    }

    const data = parsePageData(script.textContent ?? '');
    if (!data) {
        return null;
    }

    return {
        data,
        meta: readMeta(document, new URL(window.location.href)),
    };
}

function canRoute(url: URL): boolean {
    const path = url.pathname.toLowerCase();

    if (url.origin !== window.location.origin) {
        return false;
    }

    if (path.startsWith('/ttdf/')) {
        return false;
    }

    if (/^\/(?:admin|action)(?:\/|$)/.test(path)) {
        return false;
    }

    if (
        path.startsWith('/index.php/action') ||
        path.startsWith('/index.php/admin') ||
        path.startsWith('/index.php/feed')
    ) {
        return false;
    }

    if (/^\/(?:feed|rss|atom)(?:\/|$)/.test(path)) {
        return false;
    }

    if (path.startsWith('/usr/uploads/')) {
        return false;
    }

    if (
        /\.(?:xml|rss|atom|json|txt|pdf|zip|rar|7z|gz|tar|mp3|mp4|webm|ogg|wav|jpg|jpeg|png|gif|webp|svg|ico|bmp|avif)$/i.test(
            path
        )
    ) {
        return false;
    }

    return true;
}

async function fetchRoute(url: URL, signal?: AbortSignal): Promise<FetchResult | null> {
    const response = await fetch(url.toString(), {
        headers: {
            Accept: 'text/html,application/xhtml+xml',
        },
        credentials: 'same-origin',
        signal,
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('text/html')) {
        return null;
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const script = doc.getElementById('ttdf-app-data');
    if (!script) {
        return null;
    }

    const data = parsePageData(script.textContent ?? '');
    if (!data) {
        return null;
    }

    const finalUrl = response.url || url.toString();
    return {
        payload: {
            data,
            meta: readMeta(doc, new URL(finalUrl)),
        },
        finalUrl,
        redirected: response.redirected,
    };
}

function cachedResult(url: URL): FetchResult | null {
    const key = routeKey(url);
    const entry = cache.get(key);
    if (!entry) {
        return null;
    }

    if (Date.now() - entry.at > CACHE_TTL) {
        cache.delete(key);
        return null;
    }

    return entry.result;
}

function rememberResult(url: URL, result: FetchResult): void {
    cache.set(routeKey(url), { result, at: Date.now() });
}

export function prefetchRoute(href: string): void {
    let url: URL;
    try {
        url = new URL(href, window.location.href);
    } catch {
        return;
    }

    if (!canRoute(url) || routeKey(url) === routeKey(new URL(window.location.href))) {
        return;
    }

    const key = routeKey(url);
    if (cache.has(key) || inflight.has(key)) {
        return;
    }

    const promise = fetchRoute(url)
        .then((result) => {
            if (result) {
                rememberResult(url, result);
            }
            return result;
        })
        .catch(() => null)
        .finally(() => {
            inflight.delete(key);
        });

    inflight.set(key, promise);
}

async function loadRoute({ request }: LoaderFunctionArgs): Promise<RoutePayload> {
    const url = new URL(request.url);

    if (url.origin !== window.location.origin) {
        throw redirect(url.toString());
    }

    const cached = cachedResult(url);
    if (cached) {
        if (cached.redirected) {
            const target = new URL(cached.finalUrl);
            if (routeKey(target) !== routeKey(url)) {
                throw redirect(target.pathname + target.search + target.hash);
            }
        }
        return cached.payload;
    }

    let result: FetchResult | null;
    try {
        const pending = inflight.get(routeKey(url));
        result = pending ? await pending : await fetchRoute(url, request.signal);
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw error;
        }
        throw new Response('页面加载失败，请检查网络连接。', { status: 503 });
    }

    if (!result) {
        window.location.assign(url.toString());
        return await new Promise<RoutePayload>(() => {});
    }

    rememberResult(url, result);

    if (result.redirected) {
        const target = new URL(result.finalUrl);
        if (routeKey(target) !== routeKey(url)) {
            throw redirect(target.pathname + target.search + target.hash);
        }
    }

    return result.payload;
}

function RouteProgress() {
    const navigation = useNavigation();
    const started = useRef(false);

    useEffect(() => {
        if (navigation.state === 'idle') {
            if (started.current) {
                NProgress.done();
                started.current = false;
            }
            return;
        }

        started.current = true;
        NProgress.start();
    }, [navigation.state]);

    useEffect(
        () => () => {
            if (started.current) {
                NProgress.done();
                started.current = false;
            }
        },
        []
    );

    return (
        <span className="sr-only" role="status" aria-live="polite">
            {navigation.state === 'idle' ? '' : '页面加载中…'}
        </span>
    );
}

function RouteLinkInterceptor() {
    const navigate = useNavigate();

    useEffect(() => {
        const resolveAnchor = (target: EventTarget | null): HTMLAnchorElement | null => {
            if (!(target instanceof Element)) {
                return null;
            }

            const anchor = target.closest('a[href]');
            return anchor instanceof HTMLAnchorElement ? anchor : null;
        };

        const onClick = (event: MouseEvent) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            const anchor = resolveAnchor(event.target);
            if (!anchor) {
                return;
            }

            if (anchor.target && anchor.target !== '_self') {
                return;
            }

            if (anchor.hasAttribute('download') || anchor.dataset.ttdfReload !== undefined) {
                return;
            }

            const url = new URL(anchor.href, window.location.href);
            if (!canRoute(url)) {
                return;
            }

            const current = new URL(window.location.href);
            const sameDocument = url.pathname === current.pathname && url.search === current.search;

            if (sameDocument && url.hash) {
                return;
            }

            event.preventDefault();

            if (sameDocument) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            navigate(url.pathname + url.search + url.hash, { viewTransition: true });
        };

        const onIntent = (event: Event) => {
            const anchor = resolveAnchor(event.target);
            if (!anchor) {
                return;
            }

            if (new URL(anchor.href, window.location.href).origin !== window.location.origin) {
                return;
            }

            prefetchRoute(anchor.href);
        };

        document.addEventListener('click', onClick);
        document.addEventListener('pointerover', onIntent, { passive: true });
        document.addEventListener('focusin', onIntent);

        return () => {
            document.removeEventListener('click', onClick);
            document.removeEventListener('pointerover', onIntent);
            document.removeEventListener('focusin', onIntent);
        };
    }, [navigate]);

    return null;
}

function RoutePage() {
    const payload = useLoaderData() as RoutePayload;
    const location = useLocation();

    useEffect(() => {
        syncDocument(payload);
    }, [payload]);

    useEffect(() => {
        if (location.hash === '') {
            return;
        }

        const id = decodeURIComponent(location.hash.slice(1));
        const target = document.getElementById(id);
        if (target) {
            window.requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
        }
    }, [location.hash, location.key]);

    useEffect(() => {
        if (location.key === 'default') {
            return;
        }

        const main = document.getElementById('main');
        if (main) {
            window.requestAnimationFrame(() => main.focus({ preventScroll: true }));
        }
    }, [location.key]);

    return (
        <>
            <App data={payload.data} />
            <ScrollRestoration />
        </>
    );
}

function RouteError() {
    const error = useRouteError();
    const message = isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText || '页面加载失败'}`
        : error instanceof Error
          ? error.message
          : '页面加载失败。';

    return (
        <div className="min-h-dvh bg-bg text-ink">
            <main className="container-page grid min-h-dvh place-items-center py-16">
                <div className="surface-card card-pad w-full max-w-lg text-center">
                    <p className="section-label">SunkenBoat</p>
                    <h1 className="mt-2 text-[24px] font-medium">页面加载失败</h1>
                    <p className="mt-3 text-sm leading-6 text-ink-mute">{message}</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-2">
                        <Button asChild>
                            <a href="/">返回首页</a>
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
                            重新加载
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    );
}

function RouteShell() {
    return (
        <>
            <RouteProgress />
            <RouteLinkInterceptor />
            <RoutePage />
        </>
    );
}

function dismissBootScreen(): void {
    const root = document.documentElement;
    const loader = document.getElementById('ttdf-loader');

    root.dataset.ttdfApp = 'ready';
    if (loader) {
        window.setTimeout(() => loader.remove(), 420);
    }
}

export function ThemeRouter({ initial }: { initial: RoutePayload }) {
    useEffect(() => {
        let frame = 0;
        frame = window.requestAnimationFrame(() => {
            frame = window.requestAnimationFrame(dismissBootScreen);
        });

        return () => window.cancelAnimationFrame(frame);
    }, []);

    const router = createBrowserRouter(
        [
            {
                id: 'root',
                path: '*',
                loader: loadRoute,
                element: <RouteShell />,
                errorElement: <RouteError />,
            },
        ],
        {
            hydrationData: {
                loaderData: {
                    root: initial,
                },
            },
        }
    );

    rememberResult(new URL(window.location.href), {
        payload: initial,
        finalUrl: window.location.href,
        redirected: false,
    });

    return <RouterProvider router={router} />;
}

export { readInitialPayload };
