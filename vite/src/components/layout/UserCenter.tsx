import { useEffect, useState } from 'react';
import {
    CalendarCheck,
    CircleDot,
    Coins,
    ExternalLink,
    FileText,
    LogOut,
    MessageSquare,
    PenLine,
    Shield,
    ShieldCheck,
    UserRound,
    Wallet,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import AuthDialog from './AuthDialog';
import CaptchaDialog from './CaptchaDialog';
import type { CaptchaValue } from './CaptchaField';
import LevelBadge from '../content/LevelBadge';
import UserAvatar from './UserAvatar';
import { refreshApp } from '../../lib/appNavigation';
import { notifyError, notifySuccess } from '../../lib/notify';
import { errorMessage, profileFrom, readPayload } from '../../lib/user';
import type { SiteInfo, UserApiEndpoints, UserEconomySummary, UserProfile } from '../../types';

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
    const [economy, setEconomy] = useState<UserEconomySummary | null>(null);
    const [checkinBusy, setCheckinBusy] = useState(false);
    const [checkinCaptcha, setCheckinCaptcha] = useState<CaptchaValue | null>(null);
    const [checkinCaptchaOpen, setCheckinCaptchaOpen] = useState(false);

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

    useEffect(() => {
        if (!user || !api?.economy?.enabled || !api.economy.summary) {
            setEconomy(null);
            return;
        }

        const controller = new AbortController();
        let active = true;

        void fetch(api.economy.summary, {
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Typecho-Token': api.economy.nonce,
            },
            signal: controller.signal,
        })
            .then((response) => readPayload(response))
            .then((payload) => {
                const summary = (payload?.data as { economy?: UserEconomySummary } | undefined)
                    ?.economy;
                if (active && summary) {
                    setEconomy(summary);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        user?.uid,
        api?.economy?.enabled,
        api?.economy?.summary,
        api?.economy?.nonce,
        refreshKey,
    ]);

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

    const runCheckin = async (captchaValue: CaptchaValue | null) => {
        if (checkinBusy || !api.economy?.checkin) {
            return;
        }

        setCheckinBusy(true);
        try {
            const response = await fetch(api.economy.checkin, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.economy.nonce,
                },
                body: JSON.stringify(captchaValue ? { captcha: captchaValue } : {}),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '签到失败'));
            }

            const next = (payload?.data as { economy?: UserEconomySummary } | undefined)
                ?.economy;
            if (next) {
                setEconomy(next);
            }
            setCheckinCaptcha(null);
            setCheckinCaptchaOpen(false);
            notifySuccess('签到成功，奖励已到账。');
        } catch (reason) {
            setCheckinCaptcha(null);
            notifyError(reason instanceof Error ? reason.message : '签到失败');
        } finally {
            setCheckinBusy(false);
        }
    };

    const checkinCaptchaRequired = Boolean(
        api.captcha?.enabled && api.captcha.scenes.includes('checkin')
    );

    const checkin = () => {
        if (checkinBusy || !api.economy?.checkin) {
            return;
        }
        if (checkinCaptchaRequired && !checkinCaptcha) {
            setCheckinCaptchaOpen(true);
            return;
        }
        void runCheckin(checkinCaptcha);
    };

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
                            sideOffset={10}
                            className="user-menu-content w-[min(320px,calc(100vw-24px))] border-line bg-surface p-0"
                        >
                            <div className="user-menu-profile">
                                <UserAvatar
                                    name={user.screenName || user.name}
                                    avatar={user.avatar}
                                    className="user-menu-profile-avatar"
                                />
                                <div className="user-menu-profile-copy">
                                    <div className="user-menu-profile-title">
                                        <strong>{user.screenName || user.name}</strong>
                                        {economy?.enabled ? (
                                            <span className="user-menu-level">
                                                <LevelBadge
                                                    level={economy.level}
                                                    iconClassName="h-5 w-auto"
                                                    showTitle={false}
                                                />
                                            </span>
                                        ) : null}
                                        <span className="user-menu-role">
                                            {GROUP_LABELS[user.group] ?? user.group}
                                        </span>
                                    </div>
                                    <span className="user-menu-handle">@{user.name}</span>
                                    {user.signature ? (
                                        <p className="user-menu-signature">{user.signature}</p>
                                    ) : null}
                                </div>
                            </div>

                            {economy?.enabled ? (
                                <div className="user-menu-wallet">
                                    <div className="user-menu-wallet-item">
                                        <span>
                                            <Wallet aria-hidden="true" />
                                            {economy.labels.balance}
                                        </span>
                                        <strong>¥{economy.balance}</strong>
                                    </div>
                                    <div className="user-menu-wallet-item">
                                        <span>
                                            <Coins aria-hidden="true" />
                                            {economy.labels.points}
                                        </span>
                                        <strong>{economy.points}</strong>
                                    </div>
                                    <div className="user-menu-wallet-item is-level">
                                        <span>
                                            <LevelBadge
                                                level={economy.level}
                                                iconClassName="h-3.5 w-auto"
                                                showTitle={false}
                                            />
                                            等级
                                        </span>
                                        <strong>{economy.level.title}</strong>
                                    </div>
                                </div>
                            ) : null}

                            {economy?.enabled && economy.checkin.enabled ? (
                                <button
                                    type="button"
                                    onClick={checkin}
                                    disabled={checkinBusy || economy.checkin.checkedIn}
                                    className={
                                        'user-menu-checkin'
                                        + (economy.checkin.checkedIn ? ' is-done' : '')
                                    }
                                >
                                    <span className="user-menu-checkin-icon">
                                        <CalendarCheck aria-hidden="true" />
                                    </span>
                                    <span className="user-menu-checkin-copy">
                                        <strong>
                                            {economy.checkin.checkedIn
                                                ? '今日已签到'
                                                : '今日尚未签到'}
                                        </strong>
                                        <span>
                                            {economy.checkin.checkedIn
                                                ? `连续 ${economy.checkin.streak} 天 · 累计 ${economy.checkin.total} 天`
                                                : `可获经验 ${economy.checkin.rewards.experience} · ${economy.labels.points} ${economy.checkin.rewards.points}`}
                                        </span>
                                    </span>
                                    <span className="user-menu-checkin-action">
                                        {economy.checkin.checkedIn
                                            ? '已签到'
                                            : checkinBusy
                                              ? '签到中…'
                                              : '立即签到'}
                                    </span>
                                </button>
                            ) : null}

                            <div className="user-menu-stats">
                                <DropdownMenuItem asChild className="user-menu-stat">
                                    <a
                                        href={contentUrl}
                                        title={`共 ${user.posts ?? 0} 篇文章`}
                                    >
                                        <FileText aria-hidden="true" />
                                        <strong>{user.posts ?? 0}</strong>
                                        <span>文章</span>
                                    </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="user-menu-stat">
                                    <a
                                        href={contentUrl}
                                        title={`共 ${user.comments ?? 0} 条评论`}
                                    >
                                        <MessageSquare aria-hidden="true" />
                                        <strong>{user.comments ?? 0}</strong>
                                        <span>评论</span>
                                    </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="user-menu-stat">
                                    <a
                                        href={sitePath(site, 'circles')}
                                        title={`加入 ${user.joinedCircles ?? 0} · 创建 ${user.createdCircles ?? 0}`}
                                    >
                                        <CircleDot aria-hidden="true" />
                                        <strong>{user.circles ?? 0}</strong>
                                        <span>{forumLabel}</span>
                                    </a>
                                </DropdownMenuItem>
                            </div>

                            <div className="user-menu-actions">
                                <DropdownMenuItem asChild className="user-menu-action">
                                    <a href={profileUrl}>
                                        <span className="user-menu-action-icon">
                                            <UserRound strokeWidth={1.8} aria-hidden="true" />
                                        </span>
                                        <span>用户中心</span>
                                    </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild className="user-menu-action">
                                    <a href={spaceUrl}>
                                        <span className="user-menu-action-icon">
                                            <ExternalLink strokeWidth={1.8} aria-hidden="true" />
                                        </span>
                                        <span>我的空间</span>
                                    </a>
                                </DropdownMenuItem>
                                {canOpenContent ? (
                                    <DropdownMenuItem asChild className="user-menu-action">
                                        <a href={contentUrl}>
                                            <span className="user-menu-action-icon">
                                                <PenLine strokeWidth={1.8} aria-hidden="true" />
                                            </span>
                                            <span>发布内容</span>
                                        </a>
                                    </DropdownMenuItem>
                                ) : (
                                    <DropdownMenuItem asChild className="user-menu-action">
                                        <a href={sitePath(site, 'circles')}>
                                            <span className="user-menu-action-icon">
                                                <CircleDot strokeWidth={1.8} aria-hidden="true" />
                                            </span>
                                            <span>{forumLabel}</span>
                                        </a>
                                    </DropdownMenuItem>
                                )}
                                {api.operations?.enabled ? (
                                    <DropdownMenuItem asChild className="user-menu-action">
                                        <a href={api.operations.home}>
                                            <span className="user-menu-action-icon">
                                                <ShieldCheck strokeWidth={1.8} aria-hidden="true" />
                                            </span>
                                            <span>运营中心</span>
                                        </a>
                                    </DropdownMenuItem>
                                ) : null}
                                {user.group === 'administrator' ? (
                                    <DropdownMenuItem asChild className="user-menu-action">
                                        <a href={adminUrl}>
                                            <span className="user-menu-action-icon">
                                                <Shield strokeWidth={1.8} aria-hidden="true" />
                                            </span>
                                            <span>管理后台</span>
                                        </a>
                                    </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                    className="user-menu-action user-menu-action-logout"
                                    disabled={submitting}
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        void logout();
                                    }}
                                >
                                    <span className="user-menu-action-icon">
                                        <LogOut strokeWidth={1.8} aria-hidden="true" />
                                    </span>
                                    <span>{submitting ? '退出中…' : '退出登录'}</span>
                                </DropdownMenuItem>
                            </div>

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

            <CaptchaDialog
                open={checkinCaptchaOpen}
                onOpenChange={setCheckinCaptchaOpen}
                config={api.captcha}
                scene="checkin"
                title="完成验证后签到"
                description="按提示完成人机验证，验证通过后会自动签到并领取奖励。"
                onVerified={(value) => {
                    setCheckinCaptcha(value);
                    void runCheckin(value);
                }}
            />
        </>
    );
}
