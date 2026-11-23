import type { UserApiEndpoints, UserProfile } from '../types';
import { errorMessage, profileFrom, readPayload } from './user';

export type SessionResult =
    | { status: 'guest'; profile: null; message: '' }
    | { status: 'ready'; profile: UserProfile; message: '' }
    | { status: 'error'; profile: null; message: string };

let activeEndpoint = '';
let activeRequest: Promise<SessionResult> | null = null;
let cachedResult: SessionResult | null = null;
let cachedAt = 0;

if (typeof window !== 'undefined') {
    window.addEventListener('ttdf:auth-changed', () => {
        activeEndpoint = '';
        activeRequest = null;
        cachedResult = null;
        cachedAt = 0;
    });
}

/**
 * The server already knows whether Typecho has a login cookie. Anonymous
 * pages therefore never call the session endpoint, while signed-in pages
 * share one request across the header, sidebar, account page and editor.
 */
export async function loadSession(
    api: UserApiEndpoints,
    force = false
): Promise<SessionResult> {
    if (!api.session || (!api.authenticated && !force)) {
        return { status: 'guest', profile: null, message: '' };
    }

    const endpoint = api.session;
    const now = Date.now();
    if (
        !force
        && cachedResult
        && activeEndpoint === endpoint
        && now - cachedAt < 15_000
    ) {
        return cachedResult;
    }

    if (activeRequest && activeEndpoint === endpoint) {
        return activeRequest;
    }

    activeEndpoint = endpoint;
    activeRequest = (async (): Promise<SessionResult> => {
        try {
            const response = await fetch(endpoint, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });

            if (response.status === 401) {
                return { status: 'guest', profile: null, message: '' };
            }

            const payload = await readPayload(response);
            if (!response.ok) {
                return {
                    status: 'error',
                    profile: null,
                    message: errorMessage(payload, '读取登录状态失败'),
                };
            }

            const sessionProfile = profileFrom(payload);
            if (!sessionProfile) {
                return {
                    status: 'error',
                    profile: null,
                    message: '登录状态异常，请重新登录',
                };
            }

            const details = await Promise.all([
                fetch(api.me, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                }).catch(() => null),
                api.profile && api.profileNonce
                    ? fetch(api.profile, {
                          credentials: 'same-origin',
                          headers: {
                              Accept: 'application/json',
                              'X-Typecho-Token': api.profileNonce,
                          },
                      }).catch(() => null)
                    : Promise.resolve(null),
            ]);

            let profile = sessionProfile;
            for (const detail of details) {
                if (!detail?.ok) {
                    continue;
                }

                profile = profileFrom(await readPayload(detail)) ?? profile;
            }

            return { status: 'ready', profile, message: '' };
        } catch (reason) {
            return {
                status: 'error',
                profile: null,
                message: reason instanceof Error ? reason.message : '读取登录状态失败',
            };
        } finally {
            activeRequest = null;
        }
    })();

    cachedResult = await activeRequest;
    cachedAt = Date.now();

    return cachedResult;
}
