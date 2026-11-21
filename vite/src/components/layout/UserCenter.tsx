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
import { refreshApp } from '../../lib/appNavigation';
import { notifyError, notifySuccess } from '../../lib/notify';
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
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!show || !api?.enabled) {
            return;
        }

        const openAuth = () => setAuthOpen(true);
        const refreshAuth = () => setRefreshKey((value) => value + 1);
        window.addEventListener('ttdf:open-auth', openAuth);
        window.addEventListener('ttdf:auth-changed', refreshAuth);

        return () => {
            window.removeEventListener('ttdf:open-auth', openAuth);
            window.removeEventListener('ttdf:auth-changed', refreshAuth);
        };
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
    }, [show, api?.enabled, api?.me, api?.profile, api?.profileNonce, api?.session, refreshKey]);

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
            window.dispatchEvent(new Event('ttdf:auth-changed'));
            refreshApp();
            notifySuccess('已退出登录。');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '退出登录失败');
        } finally {
            setSubmitting(false);
        }
    };

    const hydrateProfile = async (next: UserProfile) => {
        setUser(next);
        window.dispatchEvent(new Event('ttdf:auth-changed'));
        refreshApp();

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
    const forumLabel = api.forum?.label || '圈子';
    const canOpenContent =
        api.content.enabled || api.forum?.canPost === true || api.forum?.canCreateCircle === true;

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
                            className="user-menu-content w-[min(320px,calc(100vw-24px))] border-line bg-surface p-2"
                        >
                            <DropdownMenuLabel className="p-0 font-normal">
                                <div className="user-menu-profile">
                                    <UserAvatar
                                        name={user.screenName || user.name}
                                        avatar={user.avatar}
                                        className="user-menu-profile-avatar"
                                    />
                                    <div className="user-menu-profile-copy">
                                        <div className="user-menu-profile-title">
                                            <strong>{user.screenName || user.name}</strong>
                                            <span className="user-menu-role">
                                                {GROUP_LABELS[user.group] ?? user.group}
                                            </span>
                                        </div>
                                        <span className="user-menu-handle">@{user.name}</span>
                                    </div>
                                </div>
                                <div className="user-menu-stats">
                                    <DropdownMenuItem asChild className="user-menu-stat">
                                        <a
                                            href={contentUrl}
                                            title={`共 ${user.posts ?? 0} 篇文章`}
                                        >
                                            <span>
                                                <FileText aria-hidden="true" />
                                                文章
                                            </span>
                                            <strong>{user.posts ?? 0}</strong>
                                        </a>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="user-menu-stat">
                                        <a
                                            href={contentUrl}
                                            title={`共 ${user.comments ?? 0} 条评论`}
                                        >
                                            <span>
                                                <MessageSquare aria-hidden="true" />
                                                评论
                                            </span>
                                            <strong>{user.comments ?? 0}</strong>
                                        </a>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem asChild className="user-menu-stat">
                                        <a
                                            href={sitePath(site, 'circles')}
                                            title={`加入 ${user.joinedCircles ?? 0} · 创建 ${user.createdCircles ?? 0}`}
                                        >
                                            <span>
                                                <CircleDot aria-hidden="true" />
                                                {forumLabel}
                                            </span>
                                            <strong>{user.circles ?? 0}</strong>
                                        </a>
                                    </DropdownMenuItem>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-line" />
                            <DropdownMenuItem asChild className="user-menu-link">
                                <a href={profileUrl}>
                                    <UserRound strokeWidth={1.8} />
                                    <span>用户中心</span>
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="user-menu-link">
                                <a href={spaceUrl}>
                                    <ExternalLink strokeWidth={1.8} />
                                    <span>我的空间</span>
                                </a>
                            </DropdownMenuItem>
                            {canOpenContent ? (
                                <DropdownMenuItem asChild className="user-menu-link">
                                    <a href={contentUrl}>
                                        <FileText strokeWidth={1.8} />
                                        <span>内容管理</span>
                                    </a>
                                </DropdownMenuItem>
                            ) : null}
                            {user.group === 'administrator' ? (
                                <DropdownMenuItem asChild className="user-menu-link">
                                    <a href={adminUrl}>
                                        <Shield strokeWidth={1.8} />
                                        <span>进入后台</span>
                                    </a>
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator className="bg-line" />
                            <DropdownMenuItem
                                variant="destructive"
                                className="user-menu-link user-menu-logout"
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
                }}
            />
        </>
    );
}
