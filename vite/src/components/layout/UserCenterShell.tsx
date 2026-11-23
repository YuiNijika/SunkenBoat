import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
    ArrowUpRight,
    CalendarCheck,
    Check,
    CircleAlert,
    ExternalLink,
    LoaderCircle,
    LogOut,
    PenLine,
    ShieldCheck,
    Sparkles,
    UserRound,
    Wallet,
} from 'lucide-react';
import { Button } from '../ui/button';
import LevelBadge from '../content/LevelBadge';
import UserAvatar from './UserAvatar';
import { cssUrl } from '../../lib/css';
import type { UserApiEndpoints, UserEconomySummary, UserProfile } from '../../types';

export type AccountSection = 'profile' | 'security' | 'social' | 'content' | 'downloads';

export interface AccountNavItem {
    id: AccountSection;
    href: string;
    label: string;
    description: string;
    icon: ReactNode;
    count?: number;
}

export interface AccountNavGroup {
    label: string;
    items: AccountNavItem[];
}

interface Props {
    active: AccountSection;
    api: UserApiEndpoints;
    children: ReactNode;
    coverUrl: string;
    economy: UserEconomySummary | null;
    loggingOut: boolean;
    navGroups: AccountNavGroup[];
    onCheckin: () => void;
    onCertificationClick: () => void;
    onLogout: () => void;
    pageDescription: string;
    pageTitle: string;
    profile: UserProfile;
    spaceUrl: string;
    checkinBusy: boolean;
}

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

function coverStyle(url: string) {
    if (url === '') {
        return undefined;
    }

    return {
        backgroundImage:
            'linear-gradient(180deg, rgba(8, 12, 18, 0.08), rgba(8, 12, 18, 0.46)), '
            + cssUrl(url),
        backgroundPosition: 'center',
        backgroundSize: 'cover',
    };
}

function NavLink({
    active,
    item,
}: {
    active: boolean;
    item: AccountNavItem;
}) {
    return (
        <a
            href={item.href}
            className={'user-center-nav-link' + (active ? ' is-active' : '')}
            aria-current={active ? 'page' : undefined}
        >
            <span className="user-center-nav-icon">{item.icon}</span>
            <span className="user-center-nav-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
            </span>
            {typeof item.count === 'number' ? (
                <span className="user-center-nav-count">{item.count}</span>
            ) : (
                <ArrowUpRight
                    className="user-center-nav-arrow"
                    strokeWidth={1.7}
                    aria-hidden="true"
                />
            )}
        </a>
    );
}

export default function UserCenterShell({
    active,
    api,
    children,
    coverUrl,
    economy,
    loggingOut,
    navGroups,
    onCheckin,
    onCertificationClick,
    onLogout,
    pageDescription,
    pageTitle,
    profile,
    spaceUrl,
    checkinBusy,
}: Props) {
    const mobileNavRef = useRef<HTMLElement>(null);
    const name = profile.screenName || profile.name;
    const role = GROUP_LABELS[profile.group] ?? profile.group;
    const allNavItems = navGroups.flatMap((group) => group.items);
    const certificationApproved = profile.certification?.status === 'approved';
    const canWrite = profile.canWrite || api.content.enabled;
    const checkinReady = economy?.enabled && economy.checkin.enabled;
    const checkinLabel = economy?.checkin.checkedIn
        ? '今日已签到'
        : checkinBusy
          ? '签到中…'
          : '今日签到';
    const adminUrl = (() => {
        try {
            const profileUrl = new URL(api.pages.profile, window.location.href);
            const marker = '/user/profile';
            return profileUrl.pathname.includes(marker)
                ? profileUrl.origin + profileUrl.pathname.slice(0, profileUrl.pathname.indexOf(marker)) + '/admin/'
                : '/admin/';
        } catch {
            return '/admin/';
        }
    })();

    useEffect(() => {
        const nav = mobileNavRef.current;
        if (!nav) {
            return;
        }

        const revealCurrent = () => {
            const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
            if (!current || nav.clientWidth === 0) {
                return;
            }

            const currentLeft = current.offsetLeft;
            const currentRight = currentLeft + current.offsetWidth;
            const viewportLeft = nav.scrollLeft;
            const viewportRight = viewportLeft + nav.clientWidth;
            let target = viewportLeft;

            if (currentLeft < viewportLeft) {
                target = Math.max(0, currentLeft - 8);
            } else if (currentRight > viewportRight) {
                target = Math.max(0, currentRight - nav.clientWidth + 8);
            }

            if (target !== viewportLeft) {
                const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                nav.scrollTo({
                    left: target,
                    behavior: reduceMotion ? 'auto' : 'smooth',
                });
            }
        };

        revealCurrent();
        const observer = new ResizeObserver(revealCurrent);
        observer.observe(nav);
        return () => observer.disconnect();
    }, [active]);

    const identity = (
        <section className="user-center-identity" aria-label="当前账号">
            <div className="user-center-identity-cover" style={coverStyle(coverUrl)}>
                <span className="user-center-session-chip">
                    <Check aria-hidden="true" />
                    已登录
                </span>
            </div>
            <div className="user-center-identity-body">
                <div className="user-center-identity-head">
                    <UserAvatar
                        name={name}
                        avatar={profile.avatar}
                        className="user-center-identity-avatar"
                    />
                    <div className="user-center-identity-copy">
                        <div className="user-center-identity-title">
                            <a href={api.pages.profile}>{name}</a>
                            <span className="user-center-role">{role}</span>
                        </div>
                        <span className="user-center-handle">@{profile.name} · UID {profile.uid}</span>
                        <div className="user-center-identity-badges">
                            {economy?.enabled ? (
                                <LevelBadge
                                    level={economy.level}
                                    iconClassName="h-5 w-auto"
                                    showTitle={false}
                                />
                            ) : null}
                            {certificationApproved ? (
                                <button
                                    type="button"
                                    className="user-center-certification"
                                    onClick={onCertificationClick}
                                    title="查看认证详情"
                                >
                                    <ShieldCheck aria-hidden="true" />
                                    {profile.certification?.name || '已认证'}
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>

                <p className={'user-center-signature' + (profile.signature ? '' : ' is-empty')}>
                    {profile.signature || '还没有填写个性签名。'}
                </p>

                <dl className="user-center-stats">
                    <div>
                        <dt>文章</dt>
                        <dd>{profile.posts ?? 0}</dd>
                    </div>
                    <div>
                        <dt>评论</dt>
                        <dd>{profile.comments ?? 0}</dd>
                    </div>
                    <div>
                        <dt>{api.forum?.label || '圈子'}</dt>
                        <dd>{profile.circles ?? 0}</dd>
                    </div>
                </dl>

                {economy?.enabled ? (
                    <div className="user-center-wallet">
                        <div>
                            <span>
                                <Wallet aria-hidden="true" />
                                {economy.labels.balance}
                            </span>
                            <strong>¥{economy.balance}</strong>
                        </div>
                        <div>
                            <span>
                                <Sparkles aria-hidden="true" />
                                {economy.labels.points}
                            </span>
                            <strong>{economy.points}</strong>
                        </div>
                        <div className="user-center-level-progress">
                            <div>
                                <span>{economy.level.title}</span>
                                <strong>{economy.level.progress}%</strong>
                            </div>
                            <span
                                className="user-center-progress-track"
                                role="progressbar"
                                aria-label="等级进度"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={economy.level.progress}
                            >
                                <span
                                    style={{
                                        width: `${economy.level.progress}%`,
                                        background: economy.level.color,
                                    }}
                                />
                            </span>
                            <small>
                                {economy.level.nextExperience > economy.experience
                                    ? `距下一等级还需 ${economy.level.nextExperience - economy.experience} 经验`
                                    : '已达到当前最高等级'}
                            </small>
                        </div>
                    </div>
                ) : null}

                {economy?.status.banned ? (
                    <p className="user-center-account-warning" role="alert">
                        <CircleAlert aria-hidden="true" />
                        <span>{economy.status.message}</span>
                    </p>
                ) : null}

                {checkinReady ? (
                    <button
                        type="button"
                        className={
                            'user-center-checkin'
                            + (economy.checkin.checkedIn ? ' is-done' : '')
                        }
                        disabled={checkinBusy || economy.checkin.checkedIn}
                        onClick={onCheckin}
                    >
                        <span>
                            {checkinBusy ? (
                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                            ) : (
                                <CalendarCheck aria-hidden="true" />
                            )}
                        </span>
                        <span className="user-center-checkin-copy">
                            <strong>{checkinLabel}</strong>
                            <small>
                                {economy.checkin.checkedIn
                                    ? `连续 ${economy.checkin.streak} 天 · 累计 ${economy.checkin.total} 天`
                                    : `经验 +${economy.checkin.rewards.experience} · ${economy.labels.points} +${economy.checkin.rewards.points}`}
                            </small>
                        </span>
                        <ArrowUpRight aria-hidden="true" />
                    </button>
                ) : null}

                <div className="user-center-identity-links">
                    {canWrite ? (
                        <a href={api.pages.editor}>
                            <PenLine aria-hidden="true" />
                            写内容
                        </a>
                    ) : null}
                    <a href={spaceUrl}>
                        <ExternalLink aria-hidden="true" />
                        公开主页
                    </a>
                    {api.operations?.enabled ? (
                        <a href={api.operations.home}>
                            <ShieldCheck aria-hidden="true" />
                            运营中心
                        </a>
                    ) : null}
                    {api.admin ? (
                        <a href={adminUrl}>
                            <ShieldCheck aria-hidden="true" />
                            管理后台
                        </a>
                    ) : null}
                </div>
            </div>
        </section>
    );

    return (
        <section className="user-center-shell" aria-labelledby="user-center-title">
            <header className="user-center-intro">
                <div>
                    <p className="section-label">Member workspace</p>
                    <h1 id="user-center-title">用户中心</h1>
                    <p>管理公开身份、登录安全、创作内容与账号资产。</p>
                </div>
                <a className="user-center-home-link" href={spaceUrl}>
                    <UserRound aria-hidden="true" />
                    查看公开主页
                    <ArrowUpRight aria-hidden="true" />
                </a>
            </header>

            <div className="user-center-mobile-identity">
                <div className="user-center-mobile-cover" style={coverStyle(coverUrl)}>
                    <UserAvatar
                        name={name}
                        avatar={profile.avatar}
                        className="user-center-mobile-avatar"
                    />
                    <div className="user-center-mobile-copy">
                        <strong>{name}</strong>
                        <span>
                            @{profile.name}
                            <i aria-hidden="true">·</i>
                            {role}
                        </span>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="user-center-mobile-logout"
                        aria-label={loggingOut ? '正在退出登录' : '退出登录'}
                        disabled={loggingOut}
                        onClick={onLogout}
                    >
                        {loggingOut ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : (
                            <LogOut aria-hidden="true" />
                        )}
                    </Button>
                </div>
                {checkinReady ? (
                    <button
                        type="button"
                        className="user-center-mobile-checkin"
                        disabled={checkinBusy || economy.checkin.checkedIn}
                        onClick={onCheckin}
                    >
                        <CalendarCheck aria-hidden="true" />
                        <span>{checkinLabel}</span>
                        {!economy.checkin.checkedIn ? (
                            <small>+{economy.checkin.rewards.points} {economy.labels.points}</small>
                        ) : null}
                    </button>
                ) : null}
            </div>

            <nav
                ref={mobileNavRef}
                className="user-center-mobile-nav"
                aria-label="用户中心页面"
            >
                {allNavItems.map((item) => (
                    <a
                        key={item.id}
                        href={item.href}
                        className={active === item.id ? 'is-active' : ''}
                        aria-current={active === item.id ? 'page' : undefined}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </a>
                ))}
            </nav>

            <div className="user-center-layout">
                <aside className="user-center-rail">
                    {identity}
                    <nav className="user-center-nav" aria-label="用户中心导航">
                        {navGroups.map((group) => (
                            <div key={group.label} className="user-center-nav-group">
                                <p>{group.label}</p>
                                {group.items.map((item) => (
                                    <NavLink
                                        key={item.id}
                                        active={active === item.id}
                                        item={item}
                                    />
                                ))}
                            </div>
                        ))}
                    </nav>
                    <Button
                        type="button"
                        variant="ghost"
                        className="user-center-logout"
                        disabled={loggingOut}
                        onClick={onLogout}
                    >
                        {loggingOut ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : (
                            <LogOut aria-hidden="true" />
                        )}
                        {loggingOut ? '正在退出…' : '退出登录'}
                    </Button>
                </aside>

                <div className="user-center-main">
                    <header className="user-center-section-heading">
                        <div>
                            <p className="section-label">Account settings</p>
                            <h2>{pageTitle}</h2>
                            <p>{pageDescription}</p>
                        </div>
                    </header>
                    <div className="user-center-section-body" tabIndex={-1}>
                        {children}
                    </div>
                </div>
            </div>

            <p className="sr-only" aria-live="polite">
                {active === 'profile'
                    ? '当前页面：个人资料'
                    : active === 'security'
                      ? '当前页面：登录与安全'
                      : active === 'social'
                        ? '当前页面：登录方式'
                        : active === 'content'
                          ? '当前页面：内容工作台'
                          : '当前页面：订单与下载'}
            </p>
        </section>
    );
}
