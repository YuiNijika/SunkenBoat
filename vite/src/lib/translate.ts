import type { SiteInfo } from '../types';

interface TranslateApi {
    language: {
        setLocal: (language: string) => void;
    };
    selectLanguageTag?: {
        show?: boolean;
    };
    service: {
        use: (service: string) => void;
    };
    listener: {
        start: () => void;
    };
    execute: () => void;
    changeLanguage: (language: string) => void;
}

declare global {
    interface Window {
        translate?: TranslateApi;
    }
}

let loading: Promise<TranslateApi | null> | null = null;

function loadScript(source: string): Promise<TranslateApi | null> {
    if (window.translate) {
        return Promise.resolve(window.translate);
    }
    if (loading) {
        return loading;
    }

    loading = new Promise((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-ttdf-translate]');
        const script = existing ?? document.createElement('script');
        const done = () => resolve(window.translate ?? null);
        const failed = () => resolve(null);

        script.addEventListener('load', done, { once: true });
        script.addEventListener('error', failed, { once: true });

        if (!existing) {
            script.src = source;
            script.async = true;
            script.dataset.ttdfTranslate = 'true';
            document.head.appendChild(script);
        }
    });

    return loading;
}

export async function prepareTranslation(config: SiteInfo['translate']): Promise<TranslateApi | null> {
    if (!config.enabled) {
        return null;
    }

    const api = await loadScript(config.script);
    if (!api) {
        return null;
    }

    if (api.selectLanguageTag) {
        api.selectLanguageTag.show = false;
    }

    api.language.setLocal(config.local);
    api.service.use(config.service);
    api.listener.start();
    api.execute();
    document.getElementById('translateSelectLanguage')?.remove();

    return api;
}

export function changeTranslation(language: string): void {
    window.translate?.changeLanguage(language);
}
