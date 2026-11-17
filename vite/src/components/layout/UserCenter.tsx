import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, LogIn, LogOut, MessageSquare, Shield, UserRound } from 'lucide-react';
import { Button } from '../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { SiteInfo, UserApiEndpoints, WidgetStats } from '../../types';

interface UserProfile {
    uid: number;
    name: string;
    screenName: string;
    mail?: string;
    url?: string;
    group: string;
    created?: string;
}

interface ApiPayload {
    data?: unknown;
    message?: string;
}

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

function profileFrom(payload: ApiPayload | null): UserProfile | null {
    const data = payload?.data;
    if (!data || typeof data !== 'object') {
        return null;
    }

    const candidate = (data as { user?: unknown }).user ?? data;
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }

    const profile = candidate as Partial<UserProfile>;
    if (typeof profile.uid !== 'number' || profile.uid <= 0) {
        return null;
    }

    return {
        uid: profile.uid,
        name: String(profile.name ?? ''),
        screenName: String(profile.screenName ?? ''),
        mail: String(profile.mail ?? ''),
        url: String(profile.url ?? ''),
        group: String(profile.group ?? ''),
        created: String(profile.created ?? ''),
    };
}

async function readPayload(response: Response): Promise<ApiPayload | null> {
    try {
        return (await response.json()) as ApiPayload;
    } catch {
        return null;
    }
}

function sitePath(site: SiteInfo, path: string): string {
    const base = site.url.replace(/\/+$/, '');
    return base + '/' + path.replace(/^\/+/, '');
}

interface Props {
    api?: UserApiEndpoints;
    show: boolean;
    site: SiteInfo;
    stats: WidgetStats;
}

export default function UserCenter({ api, show, site, stats }: Props) {
    const [open, setOpen] = useState(false);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [checking, setChecking] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const closeTimer = useRef<number | null>(null);

    const clearCloseTimer = () => {
        if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
        }
    };

    const openMenu = () => {
        clearCloseTimer();
        setOpen(true);
    };

    const scheduleClose = () => {
        clearCloseTimer();
        closeTimer.current = window.setTimeout(() => {
            setOpen(false);
        }, 140);
    };

    useEffect(() => () => clearCloseTimer(), []);

    useEffect(() => {
        if (!open || !api?.enabled) {
            return;
        }

        const controller = new AbortController();
        let active = true;
        setChecking(true);
        setError('');

        void fetch(api.session, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (response.status === 401) {
                    return null;
                }

                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(payload?.message || '读取登录状态失败');
                }

                return profileFrom(payload);
            })
            .then(async (profile) => {
                if (!profile || !api.me) {
                    return profile;
                }

                try {
                    const response = await fetch(api.me, {
                        credentials: 'same-origin',
                        headers: { Accept: 'application/json' },
                        signal: controller.signal,
                    });
                    if (!response.ok) {
                        return profile;
                    }

                    return profileFrom(await readPayload(response)) ?? profile;
                } catch {
                    return profile;
                }
            })
            .then((profile) => {
                if (active) {
                    setUser(profile);
                }
            })
            .catch((reason: unknown) => {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }
                if (active) {
                    setError(reason instanceof Error ? reason.message : '读取登录状态失败');
                }
            })
            .finally(() => {
                if (active) {
                    setChecking(false);
                }
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [open, api?.enabled, api?.me, api?.session]);

    if (!show || !api?.enabled) {
        return null;
    }

    const login = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitting(true);
        setError('');

        try {
            const response = await fetch(api.login, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: name.trim(), password }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(payload?.message || '用户名或密码无效');
            }

            const profile = profileFrom(payload);
            if (!profile) {
                throw new Error('登录接口未返回用户信息');
            }

            setUser(profile);
            setPassword('');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '登录失败');
        } finally {
            setSubmitting(false);
        }
    };

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
                throw new Error(payload?.message || '退出登录失败');
            }

            setUser(null);
            setOpen(false);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '退出登录失败');
        } finally {
            setSubmitting(false);
        }
    };

    const profileUrl = sitePath(site, 'admin/profile.php');
    const adminUrl = sitePath(site, 'admin/');
    const postsUrl = sitePath(site, 'admin/manage-posts.php');
    const commentsUrl = sitePath(site, 'admin/manage-comments.php');

    return (
        <div
            className="relative"
            onPointerEnter={openMenu}
            onPointerLeave={scheduleClose}
        >
            <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-[4px] text-ink-mute hover:bg-[rgba(136,136,136,0.1)] hover:text-ink-soft"
                        aria-label="用户中心"
                        title="用户中心"
                    >
                        <UserRound strokeWidth={1.8} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    sideOffset={8}
                    className="w-[300px] border-line bg-surface p-2"
                    onPointerEnter={clearCloseTimer}
                    onPointerLeave={scheduleClose}
                >
                    {checking ? (
                        <div className="grid gap-2 p-1" aria-busy="true" aria-label="正在读取登录状态">
                            <div className="h-9 animate-pulse rounded-[5px] bg-surface-2" />
                            <div className="h-9 animate-pulse rounded-[5px] bg-surface-2" />
                        </div>
                    ) : user ? (
                        <>
                            <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[14px] font-medium text-brand">
                                    {(user.screenName || user.name || '用').slice(0, 1)}
                                </span>
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
                            {user.group === 'administrator' ? (
                                <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                    <a href={adminUrl}>
                                        <Shield strokeWidth={1.8} />
                                        进入后台
                                    </a>
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                <a href={postsUrl}>
                                    <FileText strokeWidth={1.8} />
                                    文章数
                                    <span className="ml-auto text-[11px] text-ink-faint">{stats.posts}</span>
                                </a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer px-2 py-2">
                                <a href={commentsUrl}>
                                    <MessageSquare strokeWidth={1.8} />
                                    评论数
                                    <span className="ml-auto text-[11px] text-ink-faint">{stats.comments}</span>
                                </a>
                            </DropdownMenuItem>
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
                        </>
                    ) : (
                        <form className="grid gap-3 p-1" onSubmit={(event) => void login(event)}>
                            <div className="grid gap-1.5">
                                <Label htmlFor="ttdf-user-name" className="text-[12px] text-ink-soft">
                                    用户名或邮箱
                                </Label>
                                <Input
                                    id="ttdf-user-name"
                                    className="h-9"
                                    value={name}
                                    onChange={(event) => setName(event.target.value)}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="ttdf-user-password" className="text-[12px] text-ink-soft">
                                    密码
                                </Label>
                                <Input
                                    id="ttdf-user-password"
                                    className="h-9"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    autoComplete="current-password"
                                    required
                                />
                            </div>
                            {error ? (
                                <p className="rounded-[4px] bg-destructive/10 px-3 py-2 text-[12px] text-destructive" role="alert">
                                    {error}
                                </p>
                            ) : null}
                            <Button type="submit" size="sm" disabled={submitting} className="h-9">
                                <LogIn className="size-4" strokeWidth={1.8} aria-hidden="true" />
                                {submitting ? '登录中…' : '登录'}
                            </Button>
                        </form>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
