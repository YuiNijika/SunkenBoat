import { useEffect, useState } from 'react';
import {
    BadgeCheck,
    CalendarCheck2,
    CircleDot,
    FileText,
    Home,
    LogIn,
    MessageSquare,
    PenLine,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import AuthDialog from './AuthDialog';
import UserAvatar from './UserAvatar';
import { cssUrl } from '../../lib/css';
import { loadSession } from '../../lib/session';
import { profileFrom, readPayload } from '../../lib/user';
import type { UserApiEndpoints, UserProfile } from '../../types';

interface Props {
    api?: UserApiEndpoints;
}

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

export default function SidebarUserCard({ api }: Props) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [checking, setChecking] = useState(api?.authenticated === true);
    const [authOpen, setAuthOpen] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        const refresh = () => setVersion((value) => value + 1);
        window.addEventListener('ttdf:auth-changed', refresh);

        return () => window.removeEventListener('ttdf:auth-changed', refresh);
    }, []);

    useEffect(() => {
        if (!api?.enabled) {
            setChecking(false);
            return;
        }

        let active = true;
        setChecking(api.authenticated || version > 0);

        void loadSession(api, version > 0).then((result) => {
            if (!active) {
                return;
            }

            setUser(result.status === 'ready' ? result.profile : null);
            setChecking(false);
        });

        return () => {
            active = false;
        };
    }, [
        api?.authenticated,
        api?.enabled,
        api?.me,
        api?.profile,
        api?.profileNonce,
        api?.session,
        version,
    ]);

    if (!api?.enabled) {
        return null;
    }

    const hydrate = async (profile: UserProfile) => {
        setUser(profile);
        window.dispatchEvent(new Event('ttdf:auth-changed'));

        if (!api.profile || !api.profileNonce) {
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
            // The login response is enough to render the account card.
        }
    };

    if (checking) {
        return (
            <Card className="surface-card gap-0 p-[15px]" aria-busy="true" aria-label="正在读取用户信息">
                <div className="flex items-center gap-3">
                    <span className="size-12 shrink-0 animate-pulse rounded-full bg-surface-2" />
                    <span className="grid flex-1 gap-2">
                        <span className="h-3.5 w-24 animate-pulse rounded bg-surface-2" />
                        <span className="h-3 w-36 animate-pulse rounded bg-surface-2" />
                    </span>
                </div>
            </Card>
        );
    }

    if (!user) {
        return (
            <>
                <Card className="surface-card sidebar-user-card gap-0 overflow-hidden p-0">
                    <div className="sidebar-user-cover h-[128px]" aria-hidden="true" />
                    <div className="-mt-7 flex flex-col items-center px-4 pb-5 text-center">
                        <span className="grid size-[60px] place-items-center rounded-full border-4 border-surface bg-surface-2 text-ink-mute shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                            <UserRound className="size-6" strokeWidth={1.6} aria-hidden="true" />
                        </span>
                        <h2 className="mt-3 text-[16px] font-semibold leading-6 text-ink">HI！请登录</h2>
                        <p className="mt-1 text-[11.5px] leading-5 text-ink-mute">
                            登录后参与讨论、发布内容并同步个人资料
                        </p>
                        <Button
                            type="button"
                            className="mt-4 h-10 w-[190px] rounded-[6px] bg-brand text-[13px] font-medium text-brand-contrast shadow-[0_6px_18px_-8px_var(--accent)] hover:bg-brand-strong"
                            onClick={() => setAuthOpen(true)}
                        >
                            <LogIn className="size-4" strokeWidth={1.8} aria-hidden="true" />
                            登录
                        </Button>
                        {!api.registerEnabled ? (
                            <p className="mt-2 text-center text-[11px] leading-4 text-ink-faint">
                                站点当前未开放自助注册。
                            </p>
                        ) : null}
                    </div>
                </Card>
                <AuthDialog
                    open={authOpen}
                    onOpenChange={setAuthOpen}
                    api={api}
                    checking={checking}
                    onAuthenticated={(profile) => {
                        void hydrate(profile);
                    }}
                />
            </>
        );
    }

    const name = user.screenName || user.name;
    const spaceUrl = `${api.pages.space.replace(/\/+$/, '')}/${user.uid}`;
    const counters = [
        { label: '文章', value: user.posts ?? 0 },
        { label: '评论', value: user.comments ?? 0 },
        { label: '圈子', value: user.circles ?? 0 },
    ];
    const coverStyle = user.background
        ? {
              backgroundImage:
                  'linear-gradient(180deg, rgba(8, 12, 18, 0.08), rgba(8, 12, 18, 0.36)), '
                  + cssUrl(user.background),
              backgroundSize: 'cover',
              backgroundPosition: 'center',
          }
        : undefined;

    return (
        <Card className="surface-card sidebar-user-card gap-0 overflow-hidden p-0">
            <div className="sidebar-user-cover relative h-[128px]" style={coverStyle}>
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-[5px] bg-gradient-to-r from-[#ff7a45] to-[#ffa63d] px-2 py-1 text-[10px] font-medium text-white shadow-[0_4px_12px_-6px_rgba(255,122,69,0.9)]">
                    <CalendarCheck2 className="size-3" strokeWidth={2} aria-hidden="true" />
                    已登录
                </span>
            </div>
            <div className="-mt-7 flex flex-col items-center px-4 pb-4 text-center">
                <div className="relative">
                    <UserAvatar
                        name={name}
                        avatar={user.avatar}
                        className="size-[60px] border-4 border-surface shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-[#7c5cff] text-white ring-2 ring-surface">
                        <ShieldCheck className="size-3" strokeWidth={2.2} aria-hidden="true" />
                    </span>
                </div>

                <h2 className="mt-2.5 flex max-w-full items-center gap-1.5 truncate text-[16px] font-semibold leading-6 text-ink">
                    <a className="truncate hover:text-brand" href={api.pages.profile}>
                        {name}
                    </a>
                    {user.group === 'administrator' || user.group === 'editor' ? (
                        <BadgeCheck
                            className="size-4 shrink-0 text-[#4da3ff]"
                            strokeWidth={2.1}
                            aria-label={GROUP_LABELS[user.group] ?? user.group}
                        />
                    ) : null}
                </h2>
                <span className="mt-1 rounded-full bg-[rgba(255,138,61,0.12)] px-2 py-0.5 text-[10px] font-medium leading-4 text-[#ff8a3d]">
                    {GROUP_LABELS[user.group] ?? user.group}
                </span>

                <dl className="mt-3 flex w-full items-center justify-center gap-6">
                    {counters.map((counter) => (
                        <div key={counter.label} className="flex min-w-0 items-center gap-1">
                            {counter.label === '文章' ? (
                                <FileText className="size-3.5 text-[#38bdf8]" strokeWidth={1.9} aria-hidden="true" />
                            ) : counter.label === '评论' ? (
                                <MessageSquare className="size-3.5 text-[#4ade80]" strokeWidth={1.9} aria-hidden="true" />
                            ) : (
                                <CircleDot className="size-3.5 text-[#fb923c]" strokeWidth={1.9} aria-hidden="true" />
                            )}
                            <dd className="text-[13px] font-semibold leading-5 text-ink">{counter.value}</dd>
                            <dt className="sr-only">{counter.label}</dt>
                        </div>
                    ))}
                </dl>

                <p className="mt-3 line-clamp-1 w-full text-[11.5px] leading-5 text-ink-faint">
                    {user.signature?.trim() || '这个人很懒，还没有填写个性签名'}
                </p>

                <div className="mt-4 grid w-full grid-cols-2 gap-2">
                    <a
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] bg-brand text-[12.5px] font-medium text-brand-contrast shadow-[0_6px_16px_-10px_var(--accent)] transition-colors hover:bg-brand-strong"
                        href={api.pages.editor}
                    >
                        <PenLine className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        写文章
                    </a>
                    <a
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-line bg-surface-2 text-[12.5px] font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
                        href={spaceUrl}
                    >
                        <Home className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        我的主页
                    </a>
                </div>
            </div>
        </Card>
    );
}
