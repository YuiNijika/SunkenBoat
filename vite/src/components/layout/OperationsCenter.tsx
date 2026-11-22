import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
    Ban,
    BarChart3,
    CalendarCheck,
    CircleAlert,
    Coins,
    FileText,
    LoaderCircle,
    MessageSquare,
    Search,
    ShieldCheck,
    Sparkles,
    Trophy,
    Users,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { errorMessage, profileFrom, readPayload } from '../../lib/user';
import { notifyError, notifySuccess } from '../../lib/notify';
import type {
    UserApiEndpoints,
    UserEconomyLevel,
    UserEconomyStatus,
    UserProfile,
} from '../../types';
import ContentManager from './ContentManager';

type Tab = 'overview' | 'content' | 'users';

interface Overview {
    users: number;
    banned: number;
    topics: number;
    balance: string;
    points: number;
    todayCheckin: number;
    economyEnabled: boolean;
    financial: boolean;
}

interface OperationsUser {
    uid: number;
    name: string;
    screenName: string;
    mail: string;
    group: string;
    created: number;
    balance: string;
    points: number;
    experience: number;
    level: UserEconomyLevel;
    status: UserEconomyStatus;
}

interface Props {
    api?: UserApiEndpoints;
    enabled: boolean;
}

const GROUP_LABELS: Record<string, string> = {
    administrator: '管理员',
    editor: '编辑',
    contributor: '贡献者',
    subscriber: '订阅者',
    visitor: '访客',
};

function requestOperations(
    endpoint: string,
    nonce: string,
    options: {
        method?: 'GET' | 'POST';
        body?: Record<string, unknown>;
        query?: Record<string, string>;
    } = {}
): Promise<Response> {
    const url = new URL(endpoint, window.location.href);
    if (options.query) {
        for (const [key, value] of Object.entries(options.query)) {
            url.searchParams.set(key, value);
        }
    }

    return fetch(url.toString(), {
        method: options.method ?? 'GET',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Typecho-Token': nonce,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
}

function StatCard({
    icon,
    label,
    value,
    hint,
}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    hint?: string;
}) {
    return (
        <div className="surface-card card-pad">
            <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                {icon}
                {label}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
            {hint ? <p className="mt-1 text-[11px] text-ink-faint">{hint}</p> : null}
        </div>
    );
}

export default function OperationsCenter({ api, enabled }: Props) {
    const operations = api?.operations;
    const [tab, setTab] = useState<Tab>('overview');
    const [overview, setOverview] = useState<Overview | null>(null);
    const [overviewError, setOverviewError] = useState('');
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [users, setUsers] = useState<OperationsUser[]>([]);
    const [userTotal, setUserTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [usersLoading, setUsersLoading] = useState(false);
    const [usersError, setUsersError] = useState('');
    const [editing, setEditing] = useState<OperationsUser | null>(null);
    const [banning, setBanning] = useState<OperationsUser | null>(null);
    const [balance, setBalance] = useState('');
    const [points, setPoints] = useState('');
    const [experience, setExperience] = useState('');
    const [banType, setBanType] = useState<'permanent' | 'temporary'>('permanent');
    const [banUntil, setBanUntil] = useState('');
    const [banReason, setBanReason] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!operations?.enabled || !api?.me) {
            return;
        }
        let active = true;
        void fetch(api.me, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        })
            .then((response) => readPayload(response))
            .then((payload) => {
                const next = profileFrom(payload);
                if (active && next) {
                    setProfile(next);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [api?.me, operations?.enabled]);

    useEffect(() => {
        if (!operations?.enabled || !operations.overview) {
            return;
        }
        let active = true;
        setOverviewError('');
        void requestOperations(operations.overview, operations.nonce)
            .then(async (response) => {
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '运营数据加载失败'));
                }
                const data = (payload?.data as { overview?: Overview } | undefined)?.overview;
                if (active && data) {
                    setOverview(data);
                }
            })
            .catch((reason: unknown) => {
                if (active) {
                    setOverviewError(
                        reason instanceof Error ? reason.message : '运营数据加载失败'
                    );
                }
            });

        return () => {
            active = false;
        };
    }, [operations?.enabled, operations?.overview, operations?.nonce]);

    useEffect(() => {
        if (tab !== 'users' || !operations?.admin || !operations.users) {
            return;
        }
        let active = true;
        setUsersLoading(true);
        setUsersError('');
        void requestOperations(operations.users, operations.nonce, {
            query: {
                page: String(page),
                ...(search !== '' ? { search } : {}),
            },
        })
            .then(async (response) => {
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '用户列表加载失败'));
                }
                const data = payload?.data;
                if (active && data && typeof data === 'object') {
                    const record = data as Record<string, unknown>;
                    setUsers(Array.isArray(record.items) ? (record.items as OperationsUser[]) : []);
                    setUserTotal(Number(record.total) || 0);
                    setLastPage(Math.max(1, Number(record.lastPage) || 1));
                }
            })
            .catch((reason: unknown) => {
                if (active) {
                    setUsersError(
                        reason instanceof Error ? reason.message : '用户列表加载失败'
                    );
                }
            })
            .finally(() => {
                if (active) {
                    setUsersLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [tab, operations?.admin, operations?.users, operations?.nonce, page, search]);

    if (!enabled || !operations?.enabled) {
        return (
            <section className="surface-card card-pad">
                <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 size-5 text-danger" aria-hidden="true" />
                    <div>
                        <h1 className="text-lg font-semibold">无权访问</h1>
                        <p className="mt-1 text-sm text-ink-mute">
                            运营中心仅对编辑与管理员开放。普通用户请前往用户中心的内容管理。
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    const openEdit = (user: OperationsUser) => {
        setEditing(user);
        setBalance(user.balance);
        setPoints(String(user.points));
        setExperience(String(user.experience));
    };

    const saveUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editing || !operations.userUpdate || busy) {
            return;
        }
        setBusy(true);
        try {
            const response = await requestOperations(
                operations.userUpdate,
                operations.nonce,
                {
                    method: 'POST',
                    body: {
                        uid: editing.uid,
                        balance,
                        points,
                        experience,
                    },
                }
            );
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '保存失败'));
            }
            const next = (payload?.data as { economy?: Partial<OperationsUser> } | undefined)
                ?.economy;
            if (next) {
                setUsers((current) =>
                    current.map((item) =>
                        item.uid === editing.uid
                            ? {
                                  ...item,
                                  balance: String(next.balance ?? item.balance),
                                  points: Number(next.points ?? item.points),
                                  experience: Number(next.experience ?? item.experience),
                                  level: (next.level as UserEconomyLevel | undefined) ?? item.level,
                                  status:
                                      (next.status as UserEconomyStatus | undefined) ?? item.status,
                              }
                            : item
                    )
                );
            }
            notifySuccess('用户数据已更新。');
            setEditing(null);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '保存失败');
        } finally {
            setBusy(false);
        }
    };

    const saveBan = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!banning || !operations.userStatus || busy) {
            return;
        }
        const until =
            banType === 'temporary' ? Math.floor(new Date(banUntil).getTime() / 1000) : 0;
        if (banType === 'temporary' && (!Number.isFinite(until) || until <= 0)) {
            notifyError('请选择有效的封禁到期时间。');
            return;
        }
        setBusy(true);
        try {
            const response = await requestOperations(
                operations.userStatus,
                operations.nonce,
                {
                    method: 'POST',
                    body: {
                        uid: banning.uid,
                        action: 'ban',
                        type: banType,
                        until,
                        reason: banReason,
                    },
                }
            );
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '封禁失败'));
            }
            const status = (payload?.data as { status?: UserEconomyStatus } | undefined)
                ?.status;
            if (status) {
                setUsers((current) =>
                    current.map((item) =>
                        item.uid === banning.uid
                            ? { ...item, status }
                            : item
                    )
                );
            }
            notifySuccess('账号状态已更新。');
            setBanning(null);
            setBanReason('');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '封禁失败');
        } finally {
            setBusy(false);
        }
    };

    const unban = async (user: OperationsUser) => {
        if (!operations.userStatus || busy) {
            return;
        }
        setBusy(true);
        try {
            const response = await requestOperations(
                operations.userStatus,
                operations.nonce,
                {
                    method: 'POST',
                    body: { uid: user.uid, action: 'unban' },
                }
            );
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '解除封禁失败'));
            }
            const status = (payload?.data as { status?: UserEconomyStatus } | undefined)
                ?.status;
            if (status) {
                setUsers((current) =>
                    current.map((item) =>
                        item.uid === user.uid
                            ? { ...item, status }
                            : item
                    )
                );
            }
            notifySuccess('已解除封禁。');
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '解除封禁失败');
        } finally {
            setBusy(false);
        }
    };

    const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
        {
            id: 'overview',
            label: '概览',
            icon: <BarChart3 className="size-4" aria-hidden="true" />,
        },
        {
            id: 'content',
            label: '内容与帖子',
            icon: <FileText className="size-4" aria-hidden="true" />,
        },
    ];
    if (operations.admin) {
        tabs.push({
            id: 'users',
            label: '用户管理',
            icon: <Users className="size-4" aria-hidden="true" />,
        });
    }

    return (
        <div className="grid gap-[15px]">
            <section className="surface-card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="section-label">Operations center</p>
                        <h1 className="mt-1.5 flex items-center gap-2 text-[22px] font-semibold">
                            <ShieldCheck className="size-5" aria-hidden="true" />
                            运营中心
                        </h1>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            管理站点内容、圈子帖子与用户状态。普通用户仍使用个人内容管理中心。
                        </p>
                    </div>
                    <Badge variant="secondary">
                        {GROUP_LABELS[profile?.group ?? ''] ?? profile?.group ?? '运营成员'}
                    </Badge>
                </div>
                <nav className="account-tabs mt-4" aria-label="运营中心">
                    {tabs.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={tab === item.id ? 'is-active' : ''}
                            aria-current={tab === item.id ? 'page' : undefined}
                            onClick={() => setTab(item.id)}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>
            </section>

            {tab === 'overview' ? (
                <>
                    {overviewError ? (
                        <p className="text-sm text-danger" role="alert">
                            {overviewError}
                        </p>
                    ) : null}
                    <div className="grid gap-[15px] sm:grid-cols-2 xl:grid-cols-3">
                        <StatCard
                            icon={<Users className="size-3.5" aria-hidden="true" />}
                            label="注册用户"
                            value={overview?.users ?? '—'}
                        />
                        <StatCard
                            icon={<Ban className="size-3.5" aria-hidden="true" />}
                            label="封禁账号"
                            value={overview?.banned ?? '—'}
                        />
                        <StatCard
                            icon={<MessageSquare className="size-3.5" aria-hidden="true" />}
                            label="论坛帖子"
                            value={overview?.topics ?? '—'}
                        />
                        {overview?.financial !== false ? (
                            <StatCard
                                icon={<Coins className="size-3.5" aria-hidden="true" />}
                                label={operations.labels.balance}
                                value={overview ? `¥${overview.balance}` : '—'}
                            />
                        ) : null}
                        {overview?.financial !== false ? (
                            <StatCard
                                icon={<Sparkles className="size-3.5" aria-hidden="true" />}
                                label={operations.labels.points}
                                value={overview?.points ?? '—'}
                            />
                        ) : null}
                        <StatCard
                            icon={<CalendarCheck className="size-3.5" aria-hidden="true" />}
                            label="今日签到"
                            value={overview?.todayCheckin ?? '—'}
                            hint={
                                overview?.economyEnabled === false
                                    ? '经济系统未开启'
                                    : undefined
                            }
                        />
                    </div>
                </>
            ) : null}

            {tab === 'content' ? (
                profile ? (
                    <ContentManager api={api!} profile={profile} allContent />
                ) : (
                    <section className="surface-card card-pad text-sm text-ink-mute">
                        <LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
                        正在加载内容数据…
                    </section>
                )
            ) : null}

            {tab === 'users' ? (
                <section className="surface-card card-pad">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold">用户管理</h2>
                            <p className="mt-1 text-[12px] text-ink-mute">
                                共 {userTotal} 位用户；余额、积分与经验只能由管理员调整。
                            </p>
                        </div>
                        <form
                            className="flex items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setPage(1);
                                setSearch(searchInput.trim());
                            }}
                        >
                            <Input
                                value={searchInput}
                                onChange={(event) => setSearchInput(event.target.value)}
                                placeholder="搜索用户名或 UID"
                                aria-label="搜索用户"
                                className="h-9 w-52"
                            />
                            <Button type="submit" size="sm" variant="outline">
                                <Search aria-hidden="true" />
                                搜索
                            </Button>
                        </form>
                    </div>

                    {usersError ? (
                        <p className="mt-4 text-sm text-danger" role="alert">
                            {usersError}
                        </p>
                    ) : null}

                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-[12px]">
                            <thead className="border-b border-line text-ink-faint">
                                <tr>
                                    <th className="px-2 py-2 font-medium">用户</th>
                                    <th className="px-2 py-2 font-medium">用户组</th>
                                    <th className="px-2 py-2 font-medium">
                                        {operations.labels.balance}
                                    </th>
                                    <th className="px-2 py-2 font-medium">
                                        {operations.labels.points}
                                    </th>
                                    <th className="px-2 py-2 font-medium">经验 / 等级</th>
                                    <th className="px-2 py-2 font-medium">状态</th>
                                    <th className="px-2 py-2 text-right font-medium">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr
                                        key={user.uid}
                                        className="border-b border-line/60 last:border-0"
                                    >
                                        <td className="px-2 py-2.5">
                                            <p className="font-medium text-ink">
                                                {user.screenName || user.name}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-ink-faint">
                                                UID {user.uid}
                                                {user.mail !== '' ? ` · ${user.mail}` : ''}
                                            </p>
                                        </td>
                                        <td className="px-2 py-2.5 text-ink-mute">
                                            {GROUP_LABELS[user.group] ?? user.group}
                                        </td>
                                        <td className="px-2 py-2.5 tabular-nums text-ink">
                                            ¥{user.balance}
                                        </td>
                                        <td className="px-2 py-2.5 tabular-nums text-ink">
                                            {user.points}
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <span className="inline-flex items-center gap-1.5">
                                                <Trophy
                                                    className="size-3.5"
                                                    style={{
                                                        color: user.level?.color ?? '#64748b',
                                                    }}
                                                    aria-hidden="true"
                                                />
                                                {user.experience} · {user.level?.title ?? '—'}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2.5">
                                            {user.status?.banned ? (
                                                <Badge variant="destructive">
                                                    {user.status.type === 'permanent'
                                                        ? '永久封禁'
                                                        : '限时封禁'}
                                                </Badge>
                                            ) : (
                                                <Badge variant="secondary">正常</Badge>
                                            )}
                                        </td>
                                        <td className="px-2 py-2.5">
                                            <div className="flex flex-wrap justify-end gap-1.5">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => openEdit(user)}
                                                >
                                                    编辑数据
                                                </Button>
                                                {user.status?.banned ? (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={busy}
                                                        onClick={() => void unban(user)}
                                                    >
                                                        解除封禁
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={() => {
                                                            setBanning(user);
                                                            setBanType('permanent');
                                                            setBanUntil('');
                                                            setBanReason('');
                                                        }}
                                                    >
                                                        <Ban aria-hidden="true" />
                                                        封禁
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {!usersLoading && users.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="px-2 py-8 text-center text-ink-faint"
                                        >
                                            没有匹配的用户。
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-ink-faint">
                            第 {page} / {lastPage} 页
                        </span>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={usersLoading || page <= 1}
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                            >
                                上一页
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={usersLoading || page >= lastPage}
                                onClick={() =>
                                    setPage((current) => Math.min(lastPage, current + 1))
                                }
                            >
                                下一页
                            </Button>
                        </div>
                    </div>
                </section>
            ) : null}

            <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>调整用户数据</DialogTitle>
                        <DialogDescription>
                            修改后立即生效，用户无法自行提交余额、积分或经验。
                        </DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-3" onSubmit={(event) => void saveUser(event)}>
                        <div className="grid gap-2">
                            <Label htmlFor="operations-balance">
                                {operations.labels.balance}（元）
                            </Label>
                            <Input
                                id="operations-balance"
                                value={balance}
                                inputMode="decimal"
                                onChange={(event) => setBalance(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="operations-points">
                                {operations.labels.points}
                            </Label>
                            <Input
                                id="operations-points"
                                value={points}
                                inputMode="numeric"
                                onChange={(event) => setPoints(event.target.value)}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="operations-experience">经验</Label>
                            <Input
                                id="operations-experience"
                                value={experience}
                                inputMode="numeric"
                                onChange={(event) => setExperience(event.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditing(null)}
                            >
                                取消
                            </Button>
                            <Button type="submit" disabled={busy}>
                                {busy ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : null}
                                保存
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={banning !== null} onOpenChange={(open) => !open && setBanning(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>封禁账号</DialogTitle>
                        <DialogDescription>
                            永久封禁只能由管理员手动解除；限时封禁会在到期后的下一次访问自动解除。
                        </DialogDescription>
                    </DialogHeader>
                    <form className="grid gap-3" onSubmit={(event) => void saveBan(event)}>
                        <div className="grid gap-2">
                            <Label htmlFor="operations-ban-type">封禁类型</Label>
                            <select
                                id="operations-ban-type"
                                className="h-9 rounded-md border border-line bg-surface px-2 text-sm"
                                value={banType}
                                onChange={(event) =>
                                    setBanType(
                                        event.target.value === 'temporary'
                                            ? 'temporary'
                                            : 'permanent'
                                    )
                                }
                            >
                                <option value="permanent">永久封禁</option>
                                <option value="temporary">限时封禁</option>
                            </select>
                        </div>
                        {banType === 'temporary' ? (
                            <div className="grid gap-2">
                                <Label htmlFor="operations-ban-until">到期时间</Label>
                                <Input
                                    id="operations-ban-until"
                                    type="datetime-local"
                                    value={banUntil}
                                    onChange={(event) => setBanUntil(event.target.value)}
                                />
                            </div>
                        ) : null}
                        <div className="grid gap-2">
                            <Label htmlFor="operations-ban-reason">封禁原因</Label>
                            <Input
                                id="operations-ban-reason"
                                value={banReason}
                                maxLength={120}
                                placeholder="仅用户与管理员可见"
                                onChange={(event) => setBanReason(event.target.value)}
                            />
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setBanning(null)}
                            >
                                取消
                            </Button>
                            <Button type="submit" variant="destructive" disabled={busy}>
                                {busy ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <Ban aria-hidden="true" />
                                )}
                                确认封禁
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
