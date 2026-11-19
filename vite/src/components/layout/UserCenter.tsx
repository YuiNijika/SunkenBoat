import { useEffect, useState } from 'react';
import {
    CircleDot,
    ExternalLink,
    FileText,
    LogOut,
    MessageSquare,
    Shield,
    UserRound,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import AuthDialog from './AuthDialog';
import UserAvatar from './UserAvatar';
import { errorMessage, profileFrom, readPayload } from '../../lib/user';
import type { SiteInfo, UserApiEndpoints, UserProfile } from '../../types';

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

function sitePath(site: SiteInfo, path: string): string {
    const base = site.url.replace(/\/+$/, '');
    return base + '/' + path.replace(/^\/+/, '');
}

interface Props {
    api?: UserApiEndpoints;
    show: boolean;
    site: SiteInfo;
}

export default function UserCenter({ api, show, site }: Props) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [checking, setChecking] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!show || !api?.enabled) {
            return;
        }

        const openAuth = () => setAuthOpen(true);
        window.addEventListener('ttdf:open-auth', openAuth);

        return () => window.removeEventListener('ttdf:open-auth', openAuth);
    }, [show, api?.enabled]);

    useEffect(() => {
        if (!show || !api?.enabled) {
            setChecking(false);
            return;
        }

        const controller = new AbortController();
        let active = true;
        setChecking(true);

        void (async () => {
            try {
                const response = await fetch(api.session, {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });

                if (response.status === 401) {
                    if (active) {
                        setUser(null);
                    }
                    return;
                }

                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(payload?.message || '读取登录状态失败');
                }

                let profile = profileFrom(payload);
                if (profile && api.me) {
                    try {
                        const detail = await fetch(api.me, {
                            credentials: 'same-origin',
                            headers: { Accept: 'application/json' },
                            signal: controller.signal,
                        });
                        if (detail.ok) {
                            profile = profileFrom(await readPayload(detail)) ?? profile;
                        }
                    } catch {
                        // The session endpoint already told us who is logged in.
                    }
                }

                if (profile && api.profile && api.profileNonce) {
                    try {
                        const detail = await fetch(api.profile, {
                            credentials: 'same-origin',
                            headers: {
                                Accept: 'application/json',
                                'X-Typecho-Token': api.profileNonce,
                            },
                            signal: controller.signal,
                        });
                        if (detail.ok) {
                            profile = profileFrom(await readPayload(detail)) ?? profile;
                        }
                    } catch (reason) {
                        if (reason instanceof DOMException && reason.name === 'AbortError') {
                            throw reason;
                        }
                    }
                }

                if (active) {
                    setUser(profile);
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }
                if (active) {
                    setUser(null);
                }
            } finally {
                if (active) {
                    setChecking(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [show, api?.enabled, api?.me, api?.profile, api?.profileNonce, api?.session]);

    useEffect(() => {
        if (user && authOpen) {
            setAuthOpen(false);
        }
    }, [user, authOpen]);

    if (!show || !api?.enabled) {
        return null;
    }

    const logout = async () => {
        setSubmitting(true);
        setError('');

        try {
            const response = await fetch(api.logout, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ all: false }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '退出登录失败'));
            }

            setUser(null);
            setMenuOpen(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '退出登录失败');
        } finally {
            setSubmitting(false);
        }
    };

    const hydrateProfile = async (next: UserProfile) => {
        setUser(next);

        if (!api?.profile || !api.profileNonce) {
            return;
        }

        try {
            const response = await fetch(api.profile, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Typecho-Token': api.profileNonce,
                },
            });
            if (!response.ok) {
                return;
            }

            const detailed = profileFrom(await readPayload(response));
            if (detailed) {
                setUser((current) => ({
                    ...detailed,
                    avatar: detailed.avatar || current?.avatar || '',
                }));
            }
        } catch {
            // The login response is still enough to show the account menu.
        }
    };

    const profileUrl = api.pages.profile;
    const spaceUrl = `${api.pages.space.replace(/\/+$/, '')}/${user?.uid ?? 0}`;
    const contentUrl = api.pages.content;
    const adminUrl = sitePath(site, 'admin/');

    const trigger = (
        <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-[4px] text-ink-mute hover:bg-[rgba(136,136,136,0.1)] hover:text-ink-soft"
            aria-label="用户中心"
            title="用户中心"
            aria-haspopup={user ? 'menu' : 'dialog'}
            aria-expanded={user ? menuOpen : authOpen}
            onClick={user ? undefined : () => setAuthOpen(true)}
        >
            <UserRound strokeWidth={1.8} />
        </Button>
    );

    return (
        <>
            <div className="relative">
                {user ? (
                    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
                        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="end"
                            sideOffset={8}
                            className="user-menu-content w-[300px] border-line bg-surface p-2"
                        >
                            {error ? (
                                <p className="mb-1 rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] text-destructive" role="alert">
                                    {error}
                                </p>
                            ) : null}
                            <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
                                <UserAvatar
                                    name={user.screenName || user.name}
                                    avatar={user.avatar}
                                    className="size-9"
                                />
                                <span className="min-w-0">
                                    <span className="block truncate text-[13px] font-medium text-ink">
                                        {user.screenName || user.name}
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-ink-mute">
                                        {GROUP_LABELS[user.group] ?? user.group} · @{user.name}
                                    </span>
                                </span>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-line" />
                            <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                <a href={profileUrl}>
                                    <UserRound strokeWidth={1.8} />
                                    用户中心
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                <a href={spaceUrl}>
                                    <ExternalLink strokeWidth={1.8} />
                                    我的空间
                                </a>
                            </DropdownMenuItem>
                            {user.group === 'administrator' ? (
                                <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                    <a href={adminUrl}>
                                        <Shield strokeWidth={1.8} />
                                        进入后台
                                    </a>
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                <a href={contentUrl}>
                                    <FileText strokeWidth={1.8} />
                                    文章数
                                    <span className="ml-auto text-[11px] text-ink-faint">
                                        {user.posts ?? 0}
                                    </span>
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                <a href={contentUrl}>
                                    <MessageSquare strokeWidth={1.8} />
                                    评论数
                                    <span className="ml-auto text-[11px] text-ink-faint">
                                        {user.comments ?? 0}
                                    </span>
                                </a>
                            </DropdownMenuItem>
                            {typeof user.circles === 'number' ? (
                                <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                    <a href={sitePath(site, 'circles')}>
                                        <CircleDot strokeWidth={1.8} />
                                        圈子
                                        <span className="ml-auto text-[11px] text-ink-faint">
                                            加入 {user.joinedCircles ?? 0} · 创建 {user.createdCircles ?? 0}
                                        </span>
                                    </a>
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator className="bg-line" />
                            <DropdownMenuItem
                                variant="destructive"
                                className="cursor-pointer px-2 py-2"
                                disabled={submitting}
                                onSelect={(event) => {
                                    event.preventDefault();
                                    void logout();
                                }}
                            >
                                <LogOut strokeWidth={1.8} />
                                {submitting ? '退出中…' : '退出登录'}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    trigger
                )}
            </div>

            <AuthDialog
                open={authOpen}
                onOpenChange={setAuthOpen}
                api={api}
                checking={checking}
                onAuthenticated={(profile) => {
                    void hydrateProfile(profile);
                    setError('');
                }}
            />
        </>
    );
}
