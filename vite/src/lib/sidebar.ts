import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { PageData, SiteInfo, WidgetsData } from '../types';

const EMPTY_WIDGETS: WidgetsData = {
    recent: [],
    categories: [],
    tags: [],
    stats: { posts: 0, comments: 0, categories: 0, tags: 0 },
};

interface SidebarResponse {
    site?: Partial<SiteInfo>;
    widgets?: WidgetsData;
}

function isWidgets(value: unknown): value is WidgetsData {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<WidgetsData>;

    return (
        Array.isArray(candidate.recent) &&
        Array.isArray(candidate.categories) &&
        Array.isArray(candidate.tags) &&
        !!candidate.stats
    );
}

export function useSidebarData(data: PageData): {
    site: SiteInfo;
    widgets: WidgetsData;
    loading: boolean;
} {
    const location = useLocation();
    const [remoteSite, setRemoteSite] = useState<Partial<SiteInfo> | null>(null);
    const [remoteWidgets, setRemoteWidgets] = useState<WidgetsData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const endpoint = data.api;
        if (!endpoint?.enabled || !endpoint.sidebar) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        let active = true;
        setLoading(true);

        void fetch(endpoint.sidebar, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('sidebar request failed');
                }

                const payload = (await response.json()) as { data?: SidebarResponse };
                return payload.data ?? null;
            })
            .then((result) => {
                if (!active || !result) {
                    return;
                }

                if (result.widgets && isWidgets(result.widgets)) {
                    setRemoteWidgets(result.widgets);
                }

                if (result.site && typeof result.site === 'object') {
                    const card: Partial<SiteInfo> = { ...result.site };
                    delete card.nav;
                    setRemoteSite(card);
                }
            })
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    return;
                }
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [data.api, location.pathname, location.search]);

    const site = useMemo(
        () => ({ ...data.site, ...(remoteSite ?? {}) }),
        [data.site, remoteSite]
    );

    return {
        site,
        widgets: remoteWidgets ?? data.widgets ?? EMPTY_WIDGETS,
        loading,
    };
}
