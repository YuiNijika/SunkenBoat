import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
    Ban,
    BarChart3,
    BadgeCheck,
    CalendarCheck,
    Check,
    CircleAlert,
    Coins,
    ExternalLink,
    FileText,
    LoaderCircle,
    MessageSquare,
    MoreHorizontal,
    Pencil,
    Pin,
    RefreshCw,
    RotateCcw,
    Search,
    ShieldCheck,
    Sparkles,
    Star,
    Trash2,
    UserRound,
    Users,
    X,
} from 'lucide-react';
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Line,
    XAxis,
    YAxis,
} from 'recharts';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '../ui/chart';
import type { ChartConfig } from '../ui/chart';
import { navigateApp } from '../../lib/appNavigation';
import { contentListFrom, formatDate } from '../../lib/content';
import type { ContentItem } from '../../lib/content';
import { notifyError, notifySuccess } from '../../lib/notify';
import { errorMessage, profileFrom, readPayload } from '../../lib/user';
import type { ApiPayload } from '../../lib/user';
import type {
    ForumTopic,
    UserCertification,
    UserApiEndpoints,
    UserEconomyLevel,
    UserEconomyStatus,
    UserProfile,
} from '../../types';
import LevelBadge from '../content/LevelBadge';
import TabsNav from './TabsNav';

type Tab = 'overview' | 'moderation' | 'articles' | 'certification' | 'users';
type TopicFilter = 'all' | 'waiting' | 'rejected' | 'deleted' | 'pinned' | 'featured';
type ArticleFilter = 'all' | 'publish' | 'draft' | 'waiting';

interface Overview {
    users: number;
    banned: number;
    topics: number;
    balance: string;
    points: number;
    todayCheckin: number;
    economyEnabled: boolean;
    financial: boolean;
    trend: Array<{
        date: string;
        label: string;
        users: number;
        topics: number;
        checkins: number;
    }>;
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

interface ConfirmAction {
    op: 'delete' | 'purge';
    ids: number[];
    label: string;
}

interface CertificationQueueItem {
    uid: number;
    name: string;
    screenName: string;
    avatar: string;
    certification: UserCertification;
}

interface CertificationReview {
    item: CertificationQueueItem;
    action: 'approve' | 'reject';
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

const STATUS_LABELS: Record<string, string> = {
    publish: '已发布',
    draft: '草稿',
    private: '私密',
    hidden: '隐藏',
    waiting: '待审核',
    rejected: '已驳回',
    deleted: '回收站',
};

const TOPIC_FILTERS: Array<{ id: TopicFilter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'waiting', label: '待审核' },
    { id: 'rejected', label: '已驳回' },
    { id: 'deleted', label: '回收站' },
    { id: 'pinned', label: '置顶' },
    { id: 'featured', label: '精华' },
];

const ARTICLE_FILTERS: Array<{ id: ArticleFilter; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'publish', label: '已发布' },
    { id: 'draft', label: '草稿' },
    { id: 'waiting', label: '待审核' },
];

const overviewChartConfig: ChartConfig = {
    topics: {
        label: '新帖子',
        color: 'var(--accent)',
    },
    users: {
        label: '新用户',
        color: '#7c8cf8',
    },
    checkins: {
        label: '签到',
        color: '#e08a3c',
    },
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

function requestModeration(
    endpoint: string,
    nonce: string,
    body: Record<string, unknown>
): Promise<Response> {
    return fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Typecho-Token': nonce,
        },
        body: JSON.stringify(body),
    });
}

function moderationTopicsFrom(payload: ApiPayload | null): ForumTopic[] | null {
    const data = payload?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return null;
    }
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? (items as ForumTopic[]) : null;
}

function payloadMessage(payload: ApiPayload | null, fallback: string): string {
    const data = payload?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        const message = (data as { message?: unknown }).message;
        if (typeof message === 'string' && message.trim() !== '') {
            return message;
        }
    }
    return fallback;
}

function Metric({
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
        <div className="ops-metric">
            <span>
                {icon}
                {label}
            </span>
            <strong>{value}</strong>
            {hint ? <small>{hint}</small> : null}
        </div>
    );
}

export default function OperationsCenter({ api, enabled }: Props) {
    const operations = api?.operations;
    const forum = api?.forum;
    const [tab, setTab] = useState<Tab>('overview');
    const [refreshKey, setRefreshKey] = useState(0);
    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [overview, setOverview] = useState<Overview | null>(null);
    const [overviewError, setOverviewError] = useState('');

    const [topics, setTopics] = useState<ForumTopic[]>([]);
    const [topicsLoading, setTopicsLoading] = useState(false);
    const [topicsError, setTopicsError] = useState('');
    const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
    const [topicQuery, setTopicQuery] = useState('');
    const [topicSelected, setTopicSelected] = useState<number[]>([]);
    const [topicBusy, setTopicBusy] = useState('');
    const [topicViews, setTopicViews] = useState('');
    const [topicKind, setTopicKind] = useState('');
    const [confirm, setConfirm] = useState<ConfirmAction | null>(null);

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

    const [articles, setArticles] = useState<ContentItem[]>([]);
    const [articleTotal, setArticleTotal] = useState(0);
    const [articlePage, setArticlePage] = useState(1);
    const [articleLastPage, setArticleLastPage] = useState(1);
    const [articleFilter, setArticleFilter] = useState<ArticleFilter>('all');
    const [articleQuery, setArticleQuery] = useState('');
    const [articleSearchInput, setArticleSearchInput] = useState('');
    const [articleLoading, setArticleLoading] = useState(false);
    const [articleError, setArticleError] = useState('');
    const [articleSelected, setArticleSelected] = useState<number[]>([]);
    const [articleBusy, setArticleBusy] = useState(false);
    const [articleDelete, setArticleDelete] = useState<ContentItem | null>(null);
    const [batchViews, setBatchViews] = useState('');
    const [batchLikes, setBatchLikes] = useState('');
    const [batchLayout, setBatchLayout] = useState('');

    const [certifications, setCertifications] = useState<CertificationQueueItem[]>([]);
    const [certificationLoading, setCertificationLoading] = useState(false);
    const [certificationError, setCertificationError] = useState('');
    const [certificationReview, setCertificationReview] =
        useState<CertificationReview | null>(null);
    const [certificationReason, setCertificationReason] = useState('');
    const [certificationBusy, setCertificationBusy] = useState(false);

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
    }, [operations?.enabled, operations?.overview, operations?.nonce, refreshKey]);

    useEffect(() => {
        if (!operations?.enabled || !forum?.enabled || !forum.canModerate || !forum.moderation) {
            return;
        }
        let active = true;
        setTopicsLoading(true);
        setTopicsError('');
        void requestModeration(forum.moderation, forum.nonce, { op: 'list' })
            .then(async (response) => {
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取审核队列失败'));
                }
                if (active) {
                    setTopics(moderationTopicsFrom(payload) ?? []);
                }
            })
            .catch((reason: unknown) => {
                if (active) {
                    setTopicsError(
                        reason instanceof Error ? reason.message : '读取审核队列失败'
                    );
                }
            })
            .finally(() => {
                if (active) {
                    setTopicsLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [
        operations?.enabled,
        forum?.enabled,
        forum?.canModerate,
        forum?.moderation,
        forum?.nonce,
        refreshKey,
    ]);

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
    }, [
        tab,
        operations?.admin,
        operations?.users,
        operations?.nonce,
        page,
        search,
        refreshKey,
    ]);

    useEffect(() => {
        if (tab !== 'articles' || !operations?.admin || !api?.content.contents) {
            return;
        }
        const controller = new AbortController();
        let active = true;
        setArticleLoading(true);
        setArticleError('');

        void (async () => {
            try {
                const endpoint = new URL(api.content.contents, window.location.href);
                endpoint.searchParams.set('type', 'post');
                endpoint.searchParams.set('page', String(articlePage));
                endpoint.searchParams.set('pageSize', '20');
                if (articleQuery !== '') {
                    endpoint.searchParams.set('search', articleQuery);
                }
                if (articleFilter !== 'all') {
                    endpoint.searchParams.set('status', articleFilter);
                }

                const response = await fetch(endpoint.toString(), {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '文章列表加载失败'));
                }
                if (active) {
                    setArticles(contentListFrom(payload));
                    setArticleTotal(Number(payload?.meta?.total) || 0);
                    setArticleLastPage(Math.max(1, Number(payload?.meta?.lastPage) || 1));
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }
                if (active) {
                    setArticleError(
                        reason instanceof Error ? reason.message : '文章列表加载失败'
                    );
                }
            } finally {
                if (active) {
                    setArticleLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        tab,
        operations?.admin,
        api?.content.contents,
        articlePage,
        articleQuery,
        articleFilter,
        refreshKey,
    ]);

    useEffect(() => {
        if (
            tab !== 'certification'
            || !operations?.admin
            || !api?.certificationEnabled
            || !api.certification
        ) {
            return;
        }
        let active = true;
        setCertificationLoading(true);
        setCertificationError('');
        void requestOperations(api.certification, api.certificationNonce, {
            query: { pending: '1' },
        })
            .then(async (response) => {
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '认证队列加载失败'));
                }
                const data = payload?.data;
                const items =
                    data && typeof data === 'object'
                        ? (data as { items?: unknown }).items
                        : null;
                if (active) {
                    setCertifications(
                        Array.isArray(items)
                            ? (items as CertificationQueueItem[])
                            : []
                    );
                }
            })
            .catch((reason: unknown) => {
                if (active) {
                    setCertificationError(
                        reason instanceof Error ? reason.message : '认证队列加载失败'
                    );
                }
            })
            .finally(() => {
                if (active) {
                    setCertificationLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [
        tab,
        operations?.admin,
        api?.certification,
        api?.certificationEnabled,
        api?.certificationNonce,
        refreshKey,
    ]);

    useEffect(() => {
        setTopicSelected([]);
        setTopicQuery('');
        setTopicFilter('all');
    }, [tab]);

    useEffect(() => {
        setTopicSelected([]);
    }, [topicFilter, topicQuery]);

    useEffect(() => {
        setArticleSelected([]);
    }, [articleFilter, articleQuery, articlePage]);

    useEffect(() => {
        setArticleSelected((current) => {
            const valid = new Set(articles.map((article) => article.cid));
            const next = current.filter((cid) => valid.has(cid));
            return next.length === current.length ? current : next;
        });
    }, [articles]);

    useEffect(() => {
        setTopicSelected((current) => {
            const valid = new Set(topics.map((topic) => topic.id));
            const next = current.filter((id) => valid.has(id));
            return next.length === current.length ? current : next;
        });
    }, [topics]);

    const topicCounts = useMemo<Record<TopicFilter, number>>(() => {
        return {
            all: topics.length,
            waiting: topics.filter((topic) => topic.status === 'waiting').length,
            rejected: topics.filter((topic) => topic.status === 'rejected').length,
            deleted: topics.filter((topic) => topic.status === 'deleted').length,
            pinned: topics.filter((topic) => topic.pinned).length,
            featured: topics.filter((topic) => topic.featured).length,
        };
    }, [topics]);

    const filteredTopics = useMemo(() => {
        const keyword = topicQuery.trim().toLowerCase();

        return topics.filter((topic) => {
            if (topicFilter === 'pinned' && !topic.pinned) {
                return false;
            }
            if (topicFilter === 'featured' && !topic.featured) {
                return false;
            }
            if (
                topicFilter !== 'all'
                && topicFilter !== 'pinned'
                && topicFilter !== 'featured'
                && topic.status !== topicFilter
            ) {
                return false;
            }
            if (keyword === '') {
                return true;
            }

            return [
                topic.title,
                topic.excerpt,
                topic.kindLabel,
                topic.author.screenName,
                topic.author.name,
                topic.circle?.name ?? '',
                topic.tags.join(' '),
            ]
                .join(' ')
                .toLowerCase()
                .includes(keyword);
        });
    }, [topics, topicFilter, topicQuery]);

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

    const openEditor = (cid = 0) => {
        navigateApp(cid > 0 ? `${api!.pages.editor}?cid=${cid}` : api!.pages.editor);
    };

    const openTopicEditor = (topicId = 0) => {
        if (!forum?.editor) {
            return;
        }
        const url = new URL(forum.editor, window.location.href);
        url.searchParams.set('type', 'forum-topic');
        if (topicId > 0) {
            url.searchParams.set('id', String(topicId));
        }
        navigateApp(url.toString());
    };

    const openTopic = (topic: ForumTopic) => {
        window.open(topic.url, '_blank', 'noopener,noreferrer');
    };

    const toggleTopic = (id: number, checked: boolean) => {
        setTopicSelected((current) => {
            if (checked) {
                return current.includes(id) ? current : [...current, id];
            }
            return current.filter((value) => value !== id);
        });
    };

    const runTopicAction = async (
        op: string,
        ids: number[],
        extra: Record<string, unknown> = {}
    ) => {
        if (!forum?.moderation || topicBusy !== '' || ids.length === 0) {
            if (ids.length === 0) {
                notifyError('请先选择要处理的帖子。');
            }
            return;
        }

        setTopicBusy(op);
        try {
            const response = await requestModeration(forum.moderation, forum.nonce, {
                op,
                ids,
                ...extra,
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '处理帖子失败'));
            }
            const next = moderationTopicsFrom(payload);
            if (next) {
                setTopics(next);
            }
            setTopicSelected([]);
            setRefreshKey((value) => value + 1);
            notifySuccess(payloadMessage(payload, '帖子已更新。'));
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '处理帖子失败');
        } finally {
            setTopicBusy('');
        }
    };

    const askConfirm = (op: 'delete' | 'purge', ids: number[], label: string) => {
        if (ids.length === 0) {
            notifyError('请先选择要处理的帖子。');
            return;
        }
        setConfirm({ op, ids, label });
    };

    const confirmAction = () => {
        if (!confirm) {
            return;
        }
        const action = confirm;
        setConfirm(null);
        void runTopicAction(action.op, action.ids);
    };

    const applyViews = () => {
        if (topicViews.trim() === '') {
            notifyError('请输入要设置的阅读量。');
            return;
        }
        const views = Number(topicViews);
        if (!Number.isInteger(views) || views < 0 || views > 1000000000) {
            notifyError('请输入有效的阅读量。');
            return;
        }
        void runTopicAction('views', topicSelected, { views }).then(() => {
            setTopicViews('');
        });
    };

    const applyKind = () => {
        if (topicKind === '') {
            notifyError('请选择帖子类型。');
            return;
        }
        void runTopicAction('kind', topicSelected, { kind: topicKind }).then(() => {
            setTopicKind('');
        });
    };

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
                        item.uid === banning.uid ? { ...item, status } : item
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
                        item.uid === user.uid ? { ...item, status } : item
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

    const toggleArticle = (cid: number, checked: boolean) => {
        setArticleSelected((current) => {
            if (checked) {
                return current.includes(cid) ? current : [...current, cid];
            }
            return current.filter((value) => value !== cid);
        });
    };

    const updateArticles = async () => {
        if (!api?.content.batch || articleBusy) {
            return;
        }
        if (articleSelected.length === 0) {
            notifyError('请先选择要更新的文章。');
            return;
        }

        const body: Record<string, unknown> = { ids: articleSelected };
        if (batchViews.trim() !== '') {
            const views = Number(batchViews);
            if (!Number.isInteger(views) || views < 0 || views > 1000000000) {
                notifyError('请输入有效的阅读量。');
                return;
            }
            body.views = views;
        }
        if (batchLikes.trim() !== '') {
            const likes = Number(batchLikes);
            if (!Number.isInteger(likes) || likes < 0 || likes > 1000000000) {
                notifyError('请输入有效的点赞数。');
                return;
            }
            body.likes = likes;
        }
        if (batchLayout !== '') {
            body.layout = batchLayout;
        }
        if (!('views' in body) && !('likes' in body) && !('layout' in body)) {
            notifyError('请至少填写一项要更新的内容。');
            return;
        }

        setArticleBusy(true);
        try {
            const response = await fetch(api.content.batch, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.profileNonce,
                },
                body: JSON.stringify(body),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '批量更新文章失败'));
            }
            const updated = Number(
                (payload?.data as { updated?: unknown } | undefined)?.updated
            );
            setArticleSelected([]);
            setBatchViews('');
            setBatchLikes('');
            setBatchLayout('');
            setRefreshKey((value) => value + 1);
            notifySuccess(
                `已更新 ${Number.isFinite(updated) ? updated : articleSelected.length} 篇文章。`
            );
        } catch (reason) {
            notifyError(
                reason instanceof Error ? reason.message : '批量更新文章失败'
            );
        } finally {
            setArticleBusy(false);
        }
    };

    const removeArticle = async () => {
        if (!articleDelete || !api?.content.posts || articleBusy) {
            return;
        }
        const target = articleDelete;
        setArticleBusy(true);
        try {
            const response = await fetch(`${api.content.posts}/${target.cid}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Typecho-Token': api.profileNonce,
                },
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '删除文章失败'));
            }
            setArticles((current) => current.filter((item) => item.cid !== target.cid));
            setArticleTotal((current) => Math.max(0, current - 1));
            setArticleDelete(null);
            setArticleSelected((current) => current.filter((cid) => cid !== target.cid));
            notifySuccess(`《${target.title}》已删除。`);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '删除文章失败');
        } finally {
            setArticleBusy(false);
        }
    };

    const reviewCertification = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (
            !certificationReview
            || !api?.certification
            || certificationBusy
        ) {
            return;
        }
        const target = certificationReview;
        if (target.action === 'reject' && certificationReason.trim() === '') {
            notifyError('驳回认证时请填写审核备注。');
            return;
        }

        setCertificationBusy(true);
        try {
            const response = await requestOperations(
                api.certification,
                api.certificationNonce,
                {
                    method: 'POST',
                    body: {
                        op: target.action,
                        uid: target.item.uid,
                        reason: certificationReason.trim(),
                    },
                }
            );
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '认证审核失败'));
            }
            setCertifications((current) =>
                current.filter((item) => item.uid !== target.item.uid)
            );
            setCertificationReview(null);
            setCertificationReason('');
            setRefreshKey((value) => value + 1);
            notifySuccess(
                target.action === 'approve' ? '认证已通过。' : '认证已驳回。'
            );
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '认证审核失败');
        } finally {
            setCertificationBusy(false);
        }
    };

    const tabs: Array<{ id: Tab; label: string; icon: ReactNode }> = [
        {
            id: 'overview',
            label: '概览',
            icon: <BarChart3 className="size-4" aria-hidden="true" />,
        },
    ];
    if (forum?.enabled && forum.canModerate) {
        tabs.push({
            id: 'moderation',
            label: '帖子审核',
            icon: <ShieldCheck className="size-4" aria-hidden="true" />,
        });
    }
    if (operations.admin) {
        if (api?.apiReady) {
            tabs.push({
                id: 'articles',
                label: '文章管理',
                icon: <FileText className="size-4" aria-hidden="true" />,
            });
        }
        if (api?.certificationEnabled) {
            tabs.push({
                id: 'certification',
                label: '认证审核',
                icon: <BadgeCheck className="size-4" aria-hidden="true" />,
            });
        }
        tabs.push({
            id: 'users',
            label: '用户管理',
            icon: <Users className="size-4" aria-hidden="true" />,
        });
    }

    const pendingTopics = topics.filter((topic) => topic.status === 'waiting').slice(0, 6);
    const profilePath = api!.pages.profile;
    const siteBase = /\/user\/profile\/?$/.test(profilePath)
        ? profilePath.replace(/\/user\/profile\/?$/, '')
        : operations.home.replace(/\/operations\/?$/, '');
    const adminUrl = `${siteBase}/admin/`;
    const canModerate = forum?.enabled === true && forum.canModerate === true;
    const currentUid = profile?.uid ?? 0;

    return (
        <div className="ops-shell">
            <section className="surface-card card-pad">
                <div className="ops-header">
                    <div>
                        <p className="section-label">Operations console</p>
                        <h1 className="mt-1.5 text-[22px] font-semibold">
                            <ShieldCheck className="size-5" aria-hidden="true" />
                            运营工作台
                        </h1>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            站点治理、内容审核与账号状态管理。个人文章与帖子请前往内容管理。
                        </p>
                    </div>
                    <Badge variant="secondary">
                        {GROUP_LABELS[profile?.group ?? ''] ?? profile?.group ?? '运营成员'}
                    </Badge>
                </div>
                <TabsNav
                    variant="nav"
                    className="account-tabs mt-4"
                    ariaLabel="运营工作台"
                    items={tabs}
                    active={tab}
                    onChange={(id) => setTab(id as Tab)}
                />
            </section>

            {tab === 'overview' ? (
                <>
                    {overviewError ? (
                        <p className="text-sm text-danger" role="alert">
                            {overviewError}
                        </p>
                    ) : null}
                    <div className="ops-metrics">
                        <Metric
                            icon={<Users className="size-3.5" aria-hidden="true" />}
                            label="注册用户"
                            value={overview?.users ?? '—'}
                        />
                        <Metric
                            icon={<ShieldCheck className="size-3.5" aria-hidden="true" />}
                            label="待审核帖子"
                            value={canModerate ? topicCounts.waiting : '—'}
                            hint={canModerate ? undefined : '论坛审核未启用'}
                        />
                        <Metric
                            icon={<Ban className="size-3.5" aria-hidden="true" />}
                            label="封禁账号"
                            value={overview?.banned ?? '—'}
                        />
                        <Metric
                            icon={<MessageSquare className="size-3.5" aria-hidden="true" />}
                            label="论坛帖子"
                            value={overview?.topics ?? '—'}
                        />
                        {overview?.financial !== false ? (
                            <Metric
                                icon={<Coins className="size-3.5" aria-hidden="true" />}
                                label={operations.labels.balance}
                                value={overview ? `¥${overview.balance}` : '—'}
                            />
                        ) : null}
                        {overview?.financial !== false ? (
                            <Metric
                                icon={<Sparkles className="size-3.5" aria-hidden="true" />}
                                label={operations.labels.points}
                                value={overview?.points ?? '—'}
                            />
                        ) : null}
                        <Metric
                            icon={<CalendarCheck className="size-3.5" aria-hidden="true" />}
                            label="今日签到"
                            value={overview?.todayCheckin ?? '—'}
                            hint={
                                overview?.economyEnabled === false
                                    ? '经济系统未开启'
                                    : undefined
                            }
                        />
                        <Metric
                            icon={<Star className="size-3.5" aria-hidden="true" />}
                            label="精华帖子"
                            value={canModerate ? topicCounts.featured : '—'}
                        />
                    </div>

                    <section className="ops-panel ops-trend-panel" aria-label="近 7 日运营趋势">
                        <div className="ops-panel-head">
                            <div>
                                <h3>近 7 日运营趋势</h3>
                                <p>新注册、新帖子与签到数据按自然日聚合。</p>
                            </div>
                            <div className="ops-chart-legend" aria-hidden="true">
                                <span><i className="is-topics" />新帖子</span>
                                <span><i className="is-users" />新用户</span>
                                <span><i className="is-checkins" />签到</span>
                            </div>
                        </div>
                        {overview && overview.trend.length > 0 ? (
                            <ChartContainer
                                config={overviewChartConfig}
                                className="ops-trend-chart"
                            >
                                <ComposedChart
                                    data={overview.trend}
                                    margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                                    accessibilityLayer
                                >
                                    <CartesianGrid
                                        vertical={false}
                                        stroke="var(--line)"
                                        strokeDasharray="3 4"
                                    />
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10 }}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10 }}
                                    />
                                    <ChartTooltip
                                        cursor={{ fill: 'var(--surface-2)' }}
                                        content={<ChartTooltipContent />}
                                    />
                                    <Bar
                                        dataKey="topics"
                                        fill="var(--color-topics)"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={20}
                                    />
                                    <Bar
                                        dataKey="users"
                                        fill="var(--color-users)"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={20}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="checkins"
                                        stroke="var(--color-checkins)"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </ComposedChart>
                            </ChartContainer>
                        ) : (
                            <p className="ops-empty">
                                暂无趋势数据，产生注册、发帖或签到后会在这里显示。
                            </p>
                        )}
                    </section>

                    <div className="ops-columns">
                        <section className="ops-panel" aria-label="待审核队列">
                            <div className="ops-panel-head">
                                <div>
                                    <h3>待审核队列</h3>
                                    <p>优先处理等待中的论坛帖子，通过后立即公开。</p>
                                </div>
                                {canModerate ? (
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="outline"
                                        onClick={() => setTab('moderation')}
                                    >
                                        查看全部
                                    </Button>
                                ) : null}
                            </div>

                            {topicsError ? (
                                <p className="text-[12px] text-danger" role="alert">
                                    {topicsError}
                                </p>
                            ) : !canModerate ? (
                                <p className="rounded-[7px] border border-dashed border-line bg-surface-2 px-4 py-8 text-center text-[12px] text-ink-faint">
                                    站点未开启论坛，或当前账号没有审核权限。
                                </p>
                            ) : topicsLoading && topics.length === 0 ? (
                                <div className="grid gap-2" aria-busy="true">
                                    <span className="h-12 animate-pulse rounded-[7px] bg-surface-2" />
                                    <span className="h-12 animate-pulse rounded-[7px] bg-surface-2" />
                                    <span className="h-12 animate-pulse rounded-[7px] bg-surface-2" />
                                </div>
                            ) : pendingTopics.length === 0 ? (
                                <p className="rounded-[7px] border border-dashed border-line bg-surface-2 px-4 py-8 text-center text-[12px] text-ink-faint">
                                    审核队列已清空，没有等待处理的帖子。
                                </p>
                            ) : (
                                <ul className="ops-queue">
                                    {pendingTopics.map((topic) => (
                                        <li key={topic.id} className="ops-queue-item">
                                            <div className="ops-queue-main">
                                                <strong>{topic.title}</strong>
                                                <small>
                                                    {topic.author.screenName || topic.author.name}
                                                    {' · '}
                                                    {topic.circle?.name ?? '论坛'}
                                                    {' · '}
                                                    {topic.createdText}
                                                </small>
                                            </div>
                                            <div className="ops-queue-actions">
                                                <Button
                                                    type="button"
                                                    size="xs"
                                                    variant="outline"
                                                    disabled={topicBusy !== ''}
                                                    onClick={() =>
                                                        void runTopicAction('reject', [topic.id])
                                                    }
                                                >
                                                    驳回
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="xs"
                                                    disabled={topicBusy !== ''}
                                                    onClick={() =>
                                                        void runTopicAction('approve', [topic.id])
                                                    }
                                                >
                                                    <Check aria-hidden="true" />
                                                    通过
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className="ops-panel" aria-label="运营入口">
                            <div className="ops-panel-head">
                                <div>
                                    <h3>运营入口</h3>
                                    <p>常用站点位置与当前账号能力。</p>
                                </div>
                            </div>
                            <div className="ops-link-grid">
                                <a className="ops-link" href={api!.pages.content}>
                                    <FileText aria-hidden="true" />
                                    <span>
                                        <strong>内容管理</strong>
                                        <small>文章、帖子与评论</small>
                                    </span>
                                </a>
                                <a className="ops-link" href={api!.pages.profile}>
                                    <UserRound aria-hidden="true" />
                                    <span>
                                        <strong>个人资料</strong>
                                        <small>账号与安全设置</small>
                                    </span>
                                </a>
                                {forum?.enabled ? (
                                    <a className="ops-link" href={forum.home}>
                                        <MessageSquare aria-hidden="true" />
                                        <span>
                                            <strong>{forum.title || '论坛首页'}</strong>
                                            <small>{forum.label || '圈子'}与讨论</small>
                                        </span>
                                    </a>
                                ) : null}
                                {operations.admin ? (
                                    <a className="ops-link" href={adminUrl}>
                                        <ExternalLink aria-hidden="true" />
                                        <span>
                                            <strong>站点后台</strong>
                                            <small>Typecho 管理</small>
                                        </span>
                                    </a>
                                ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[11px] text-ink-faint">
                                <span>当前账号</span>
                                <Badge variant="outline">
                                    {GROUP_LABELS[profile?.group ?? ''] ?? profile?.group ?? '—'}
                                </Badge>
                                {api?.apiReady ? (
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => void openEditor()}
                                    >
                                        <Pencil aria-hidden="true" />
                                        写文章
                                    </Button>
                                ) : null}
                            </div>
                        </section>
                    </div>
                </>
            ) : null}

            {tab === 'moderation' ? (
                <section className="ops-panel">
                    <div className="ops-panel-head">
                        <div>
                            <h3>帖子审核与治理</h3>
                            <p>
                                审核、置顶、加精与回收站操作集中在这里；个人发布的帖子请前往内容管理。
                            </p>
                        </div>
                        <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={topicsLoading}
                            onClick={() => setRefreshKey((value) => value + 1)}
                        >
                            <RefreshCw
                                className={topicsLoading ? 'animate-spin' : ''}
                                aria-hidden="true"
                            />
                            刷新
                        </Button>
                    </div>

                    <div className="ops-toolbar">
                        <div className="ops-filter-chips" role="tablist" aria-label="审核状态筛选">
                            {TOPIC_FILTERS.map((entry) => (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={topicFilter === entry.id}
                                    className={topicFilter === entry.id ? 'is-active' : ''}
                                    onClick={() => setTopicFilter(entry.id)}
                                >
                                    {entry.label}
                                    <small>{topicCounts[entry.id]}</small>
                                </button>
                            ))}
                        </div>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <Input
                                className="h-9 w-full min-w-40 sm:max-w-72"
                                value={topicQuery}
                                onChange={(event) => setTopicQuery(event.target.value)}
                                placeholder="搜索标题、作者、圈子或话题"
                                aria-label="搜索论坛帖子"
                            />
                            <span className="shrink-0 text-[10.5px] text-ink-faint">
                                {filteredTopics.length} / {topics.length}
                            </span>
                        </div>
                    </div>

                    {topicsError ? (
                        <p className="text-sm text-danger" role="alert">
                            {topicsError}
                        </p>
                    ) : null}

                    {filteredTopics.length > 0 ? (
                        <div className="ops-bulk">
                            <div className="ops-bulk-actions">
                                <label className="inline-flex h-8 items-center gap-2 pr-2 text-[12px] text-ink-mute">
                                    <Checkbox
                                        checked={
                                            filteredTopics.length > 0
                                            && filteredTopics.every((topic) =>
                                                topicSelected.includes(topic.id)
                                            )
                                        }
                                        onCheckedChange={(checked) =>
                                            setTopicSelected(
                                                checked === true
                                                    ? filteredTopics.map((topic) => topic.id)
                                                    : []
                                            )
                                        }
                                        aria-label="选择当前筛选结果中的全部帖子"
                                    />
                                    全选
                                </label>
                                <span className="text-[10.5px] text-ink-faint">
                                    已选 {topicSelected.length} 项
                                </span>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() => void runTopicAction('approve', topicSelected)}
                                >
                                    <Check aria-hidden="true" />
                                    通过
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() => void runTopicAction('reject', topicSelected)}
                                >
                                    <Ban aria-hidden="true" />
                                    驳回
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() => void runTopicAction('pin', topicSelected)}
                                >
                                    <Pin aria-hidden="true" />
                                    置顶
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() => void runTopicAction('unpin', topicSelected)}
                                >
                                    取消置顶
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() => void runTopicAction('feature', topicSelected)}
                                >
                                    <Star aria-hidden="true" />
                                    精华
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() => void runTopicAction('unfeature', topicSelected)}
                                >
                                    取消精华
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    disabled={topicBusy !== '' || topicSelected.length === 0}
                                    onClick={() =>
                                        askConfirm(
                                            'delete',
                                            topicSelected,
                                            `将 ${topicSelected.length} 篇帖子移入回收站`
                                        )
                                    }
                                >
                                    <Trash2 aria-hidden="true" />
                                    移入回收站
                                </Button>
                                {topicSelected.length > 0 ? (
                                    <Button
                                        type="button"
                                        size="xs"
                                        variant="ghost"
                                        className="ml-auto"
                                        disabled={topicBusy !== ''}
                                        onClick={() => setTopicSelected([])}
                                    >
                                        清空选择
                                    </Button>
                                ) : null}
                            </div>
                            <div className="ops-bulk-fields">
                                <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                    阅读量
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1000000000}
                                        className="h-8 w-28"
                                        value={topicViews}
                                        onChange={(event) => setTopicViews(event.target.value)}
                                        placeholder="设置值"
                                    />
                                </label>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                        topicBusy !== ''
                                        || topicSelected.length === 0
                                        || topicViews === ''
                                    }
                                    onClick={() => void applyViews()}
                                >
                                    应用阅读量
                                </Button>
                                <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                    帖子类型
                                    <select
                                        className="h-8 min-w-32 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                        value={topicKind}
                                        onChange={(event) => setTopicKind(event.target.value)}
                                    >
                                        <option value="">选择类型</option>
                                        {forum?.kinds.map((kind) => (
                                            <option key={kind.value} value={kind.value}>
                                                {kind.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                        topicBusy !== ''
                                        || topicSelected.length === 0
                                        || topicKind === ''
                                    }
                                    onClick={() => void applyKind()}
                                >
                                    应用类型
                                </Button>
                                {topicBusy !== '' ? (
                                    <span className="inline-flex items-center gap-1.5 pb-1.5 text-[10.5px] text-ink-faint">
                                        <LoaderCircle
                                            className="size-3 animate-spin"
                                            aria-hidden="true"
                                        />
                                        正在处理…
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {topicsLoading && topics.length === 0 ? (
                        <div className="grid gap-2" aria-busy="true">
                            {[1, 2, 3, 4].map((item) => (
                                <span
                                    key={item}
                                    className="h-16 animate-pulse rounded-[8px] bg-surface-2"
                                />
                            ))}
                        </div>
                    ) : filteredTopics.length === 0 ? (
                        <div className="rounded-[8px] border border-dashed border-line bg-surface-2 px-5 py-10 text-center">
                            <ShieldCheck
                                className="mx-auto size-7 text-ink-faint"
                                strokeWidth={1.5}
                                aria-hidden="true"
                            />
                            <p className="mt-3 text-[13px] font-medium">没有匹配的帖子</p>
                            <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                调整审核状态或搜索条件后再试。
                            </p>
                        </div>
                    ) : (
                        <ul className="ops-topic-list">
                            {filteredTopics.map((topic) => (
                                <li key={topic.id} className="ops-topic-row">
                                    <Checkbox
                                        checked={topicSelected.includes(topic.id)}
                                        onCheckedChange={(checked) =>
                                            toggleTopic(topic.id, checked === true)
                                        }
                                        aria-label={`选择 ${topic.title}`}
                                    />
                                    <div className="ops-topic-main">
                                        <div className="ops-topic-title">
                                            <strong>{topic.title}</strong>
                                            <Badge
                                                variant={
                                                    topic.status === 'publish'
                                                        ? 'secondary'
                                                        : 'outline'
                                                }
                                            >
                                                {STATUS_LABELS[topic.status] ?? topic.status}
                                            </Badge>
                                            <Badge variant="outline">{topic.kindLabel}</Badge>
                                            {topic.pinned ? (
                                                <Badge variant="outline">
                                                    <Pin aria-hidden="true" />
                                                    置顶
                                                </Badge>
                                            ) : null}
                                            {topic.featured ? (
                                                <Badge variant="outline">
                                                    <Star aria-hidden="true" />
                                                    精华
                                                </Badge>
                                            ) : null}
                                        </div>
                                        <p className="ops-topic-meta">
                                            {topic.circle ? <span>{topic.circle.name}</span> : null}
                                            <span>
                                                {topic.author.screenName || topic.author.name}
                                            </span>
                                            <span>{topic.createdText}</span>
                                            <span>{topic.views} 阅读</span>
                                            <span>{topic.comments} 回复</span>
                                        </p>
                                        {topic.excerpt !== '' ? (
                                            <p className="ops-topic-excerpt">{topic.excerpt}</p>
                                        ) : null}
                                    </div>
                                    <div className="ops-topic-actions">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`查看 ${topic.title}`}
                                            onClick={() => openTopic(topic)}
                                        >
                                            <ExternalLink aria-hidden="true" />
                                        </Button>
                                        {topic.status !== 'deleted' ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`编辑 ${topic.title}`}
                                                onClick={() => openTopicEditor(topic.id)}
                                            >
                                                <Pencil aria-hidden="true" />
                                            </Button>
                                        ) : null}
                                        <DropdownMenu modal={false}>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    disabled={topicBusy !== ''}
                                                    aria-label={`管理 ${topic.title}`}
                                                >
                                                    <MoreHorizontal aria-hidden="true" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-44">
                                                {topic.status === 'deleted' ? (
                                                    <>
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void runTopicAction('restore', [
                                                                    topic.id,
                                                                ])
                                                            }
                                                        >
                                                            <RotateCcw aria-hidden="true" />
                                                            恢复帖子
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onSelect={() =>
                                                                askConfirm(
                                                                    'purge',
                                                                    [topic.id],
                                                                    `彻底删除《${topic.title}》`
                                                                )
                                                            }
                                                        >
                                                            <Trash2 aria-hidden="true" />
                                                            彻底删除
                                                        </DropdownMenuItem>
                                                    </>
                                                ) : (
                                                    <>
                                                        {topic.status !== 'publish' ? (
                                                            <DropdownMenuItem
                                                                onSelect={() =>
                                                                    void runTopicAction(
                                                                        'approve',
                                                                        [topic.id]
                                                                    )
                                                                }
                                                            >
                                                                <Check aria-hidden="true" />
                                                                通过审核
                                                            </DropdownMenuItem>
                                                        ) : null}
                                                        {topic.status !== 'rejected' ? (
                                                            <DropdownMenuItem
                                                                onSelect={() =>
                                                                    void runTopicAction(
                                                                        'reject',
                                                                        [topic.id]
                                                                    )
                                                                }
                                                            >
                                                                <Ban aria-hidden="true" />
                                                                驳回
                                                            </DropdownMenuItem>
                                                        ) : null}
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void runTopicAction(
                                                                    topic.pinned
                                                                        ? 'unpin'
                                                                        : 'pin',
                                                                    [topic.id]
                                                                )
                                                            }
                                                        >
                                                            <Pin aria-hidden="true" />
                                                            {topic.pinned ? '取消置顶' : '置顶'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void runTopicAction(
                                                                    topic.featured
                                                                        ? 'unfeature'
                                                                        : 'feature',
                                                                    [topic.id]
                                                                )
                                                            }
                                                        >
                                                            <Star aria-hidden="true" />
                                                            {topic.featured ? '取消精华' : '设为精华'}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                openTopicEditor(topic.id)
                                                            }
                                                        >
                                                            <Pencil aria-hidden="true" />
                                                            编辑帖子
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            variant="destructive"
                                                            onSelect={() =>
                                                                askConfirm(
                                                                    'delete',
                                                                    [topic.id],
                                                                    `将《${topic.title}》移入回收站`
                                                                )
                                                            }
                                                        >
                                                            <Trash2 aria-hidden="true" />
                                                            移入回收站
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ) : null}

            {tab === 'articles' ? (
                <section className="surface-card card-pad">
                    <div className="ops-panel-head">
                        <div>
                            <h2 className="text-base font-semibold">文章管理</h2>
                            <p>
                                共 {articleTotal} 篇文章；可搜索、筛选、编辑、删除并批量调整阅读量、点赞数与正文布局。
                            </p>
                        </div>
                        <form
                            className="flex items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setArticlePage(1);
                                setArticleQuery(articleSearchInput.trim());
                            }}
                        >
                            <Input
                                value={articleSearchInput}
                                onChange={(event) =>
                                    setArticleSearchInput(event.target.value)
                                }
                                placeholder="搜索标题、正文或别名"
                                aria-label="搜索文章"
                                className="h-9 w-56"
                            />
                            <Button type="submit" size="sm" variant="outline">
                                <Search aria-hidden="true" />
                                搜索
                            </Button>
                        </form>
                    </div>

                    <div className="ops-toolbar">
                        <div className="ops-filter-chips" aria-label="文章状态筛选">
                            {ARTICLE_FILTERS.map((filter) => (
                                <button
                                    key={filter.id}
                                    type="button"
                                    className={articleFilter === filter.id ? 'is-active' : ''}
                                    aria-pressed={articleFilter === filter.id}
                                    onClick={() => {
                                        setArticleFilter(filter.id);
                                        setArticlePage(1);
                                    }}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                        {articleQuery !== '' ? (
                            <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                onClick={() => {
                                    setArticleQuery('');
                                    setArticleSearchInput('');
                                    setArticlePage(1);
                                }}
                            >
                                清除搜索
                            </Button>
                        ) : null}
                    </div>

                    {articleSelected.length > 0 ? (
                        <div className="ops-bulk" aria-label="批量编辑文章">
                            <div className="ops-bulk-actions">
                                <strong className="text-[12px]">
                                    已选择 {articleSelected.length} 篇文章
                                </strong>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => setArticleSelected([])}
                                >
                                    清空选择
                                </Button>
                            </div>
                            <div className="ops-bulk-fields">
                                <label className="grid gap-1">
                                    <span className="text-[11px] text-ink-faint">阅读量</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1000000000}
                                        className="h-8 w-28"
                                        value={batchViews}
                                        onChange={(event) =>
                                            setBatchViews(event.target.value)
                                        }
                                        placeholder="不修改"
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-[11px] text-ink-faint">点赞数</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={1000000000}
                                        className="h-8 w-28"
                                        value={batchLikes}
                                        onChange={(event) =>
                                            setBatchLikes(event.target.value)
                                        }
                                        placeholder="不修改"
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-[11px] text-ink-faint">正文布局</span>
                                    <select
                                        className="h-8 min-w-28 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                        value={batchLayout}
                                        onChange={(event) =>
                                            setBatchLayout(event.target.value)
                                        }
                                    >
                                        <option value="">不修改</option>
                                        <option value="default">标准</option>
                                        <option value="wide">宽屏</option>
                                        <option value="narrow">窄屏</option>
                                    </select>
                                </label>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={articleBusy}
                                    onClick={() => void updateArticles()}
                                >
                                    {articleBusy ? (
                                        <>
                                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                                            更新中…
                                        </>
                                    ) : (
                                        '批量更新'
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    {articleError ? (
                        <p className="text-[12px] text-danger" role="alert">
                            {articleError}
                        </p>
                    ) : null}

                    {articleLoading && articles.length === 0 ? (
                        <div className="grid gap-2" aria-busy="true">
                            <span className="h-14 animate-pulse rounded-[7px] bg-surface-2" />
                            <span className="h-14 animate-pulse rounded-[7px] bg-surface-2" />
                            <span className="h-14 animate-pulse rounded-[7px] bg-surface-2" />
                        </div>
                    ) : articles.length === 0 ? (
                        <p className="ops-empty">没有匹配的文章。</p>
                    ) : (
                        <ul className="ops-topic-list">
                            <li className="ops-bulk-actions">
                                <Checkbox
                                    checked={
                                        articles.length > 0
                                        && articles.every((article) =>
                                            articleSelected.includes(article.cid)
                                        )
                                    }
                                    onCheckedChange={(checked) =>
                                        setArticleSelected(
                                            checked === true
                                                ? articles.map((article) => article.cid)
                                                : []
                                        )
                                    }
                                    aria-label="选择当前页全部文章"
                                />
                                <span className="text-[11px] text-ink-faint">
                                    选择当前页
                                </span>
                            </li>
                            {articles.map((article) => (
                                <li key={article.cid} className="ops-topic-row">
                                    <Checkbox
                                        checked={articleSelected.includes(article.cid)}
                                        onCheckedChange={(checked) =>
                                            toggleArticle(article.cid, checked === true)
                                        }
                                        aria-label={`选择 ${article.title}`}
                                    />
                                    <div className="ops-topic-main">
                                        <div className="ops-topic-title">
                                            <strong>{article.title || '未命名文章'}</strong>
                                            <Badge
                                                variant={
                                                    article.status === 'publish'
                                                        ? 'default'
                                                        : 'secondary'
                                                }
                                            >
                                                {STATUS_LABELS[article.status]
                                                    ?? article.status
                                                    ?? '草稿'}
                                            </Badge>
                                        </div>
                                        <p className="ops-topic-meta">
                                            <span>{formatDate(article.created)}</span>
                                            <span>{article.commentsNum} 条评论</span>
                                            {article.categories.length > 0 ? (
                                                <span>
                                                    {article.categories
                                                        .map((category) => category.name)
                                                        .join(' / ')}
                                                </span>
                                            ) : null}
                                        </p>
                                        {article.text ? (
                                            <p className="ops-topic-excerpt">{article.text}</p>
                                        ) : null}
                                    </div>
                                    <div className="ops-topic-actions">
                                        {article.permalink !== ''
                                            && article.status === 'publish' ? (
                                            <Button
                                                asChild
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label="查看文章"
                                            >
                                                <a
                                                    href={article.permalink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <ExternalLink aria-hidden="true" />
                                                </a>
                                            </Button>
                                        ) : null}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`编辑 ${article.title}`}
                                            onClick={() => openEditor(article.cid)}
                                        >
                                            <Pencil aria-hidden="true" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`删除 ${article.title}`}
                                            disabled={articleBusy}
                                            onClick={() => setArticleDelete(article)}
                                        >
                                            <Trash2 aria-hidden="true" />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="ops-pagination">
                        <span>
                            第 {articlePage} / {articleLastPage} 页
                        </span>
                        <div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={articleLoading || articlePage <= 1}
                                onClick={() =>
                                    setArticlePage((current) => Math.max(1, current - 1))
                                }
                            >
                                上一页
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={articleLoading || articlePage >= articleLastPage}
                                onClick={() =>
                                    setArticlePage((current) =>
                                        Math.min(articleLastPage, current + 1)
                                    )
                                }
                            >
                                下一页
                            </Button>
                        </div>
                    </div>
                </section>
            ) : null}

            {tab === 'certification' ? (
                <section className="surface-card card-pad">
                    <div className="ops-panel-head">
                        <div>
                            <h2 className="text-base font-semibold">认证审核</h2>
                            <p>
                                审核用户提交的个人或组织认证；通过后会展示认证名称与详情。
                            </p>
                        </div>
                        <Badge variant="secondary">
                            待审核 {certifications.length}
                        </Badge>
                    </div>

                    {certificationError ? (
                        <p className="text-[12px] text-danger" role="alert">
                            {certificationError}
                        </p>
                    ) : null}

                    {certificationLoading && certifications.length === 0 ? (
                        <div className="grid gap-2" aria-busy="true">
                            <span className="h-20 animate-pulse rounded-[7px] bg-surface-2" />
                            <span className="h-20 animate-pulse rounded-[7px] bg-surface-2" />
                        </div>
                    ) : certifications.length === 0 ? (
                        <p className="ops-empty">当前没有等待审核的认证申请。</p>
                    ) : (
                        <ul className="ops-cert-list">
                            {certifications.map((item) => (
                                <li key={item.uid} className="ops-cert-item">
                                    <img
                                        className="ops-cert-avatar"
                                        src={item.avatar}
                                        alt=""
                                        loading="lazy"
                                    />
                                    <div className="ops-cert-main">
                                        <div className="ops-topic-title">
                                            <strong>
                                                {item.screenName || item.name}
                                            </strong>
                                            <Badge variant="outline">
                                                {item.certification.type === 'organization'
                                                    ? '组织认证'
                                                    : '个人认证'}
                                            </Badge>
                                        </div>
                                        <p className="ops-topic-meta">
                                            <span>UID {item.uid}</span>
                                            <span>
                                                {item.certification.name || '未填写认证名称'}
                                            </span>
                                        </p>
                                        <p className="ops-cert-note">
                                            {item.certification.note || '未填写认证说明'}
                                        </p>
                                    </div>
                                    <div className="ops-cert-actions">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => {
                                                setCertificationReview({
                                                    item,
                                                    action: 'approve',
                                                });
                                                setCertificationReason('');
                                            }}
                                        >
                                            <Check aria-hidden="true" />
                                            通过
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                setCertificationReview({
                                                    item,
                                                    action: 'reject',
                                                });
                                                setCertificationReason('');
                                            }}
                                        >
                                            <X aria-hidden="true" />
                                            驳回
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
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
                                                {user.level ? (
                                                    <LevelBadge
                                                        level={user.level}
                                                        iconClassName="h-4 w-auto"
                                                        showTitle={false}
                                                    />
                                                ) : (
                                                    '—'
                                                )}
                                                <span className="tabular-nums text-ink-faint">
                                                    {user.experience}
                                                </span>
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
                                                {user.group === 'administrator'
                                                    || user.uid === currentUid ? (
                                                    <span className="text-[11px] text-ink-faint">
                                                        受保护账号
                                                    </span>
                                                ) : (
                                                    <>
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
                                                    </>
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

            <AlertDialog
                open={articleDelete !== null}
                onOpenChange={(open) => !open && !articleBusy && setArticleDelete(null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除这篇文章？</AlertDialogTitle>
                        <AlertDialogDescription>
                            《{articleDelete?.title || '未命名文章'}》删除后将不再出现在前台，
                            该操作不能在当前页面撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={articleBusy}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={articleBusy}
                            onClick={(event) => {
                                event.preventDefault();
                                void removeArticle();
                            }}
                        >
                            {articleBusy ? '删除中…' : '确认删除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog
                open={certificationReview !== null}
                onOpenChange={(open) => {
                    if (!open && !certificationBusy) {
                        setCertificationReview(null);
                        setCertificationReason('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {certificationReview?.action === 'approve'
                                ? '通过认证申请'
                                : '驳回认证申请'}
                        </DialogTitle>
                        <DialogDescription>
                            {certificationReview
                                ? `${certificationReview.item.screenName
                                    || certificationReview.item.name
                                } · ${certificationReview.item.certification.name
                                    || '未填写认证名称'}`
                                : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        className="grid gap-3"
                        onSubmit={(event) => void reviewCertification(event)}
                    >
                        <div className="rounded-[6px] border border-line bg-surface-2 px-3.5 py-3 text-[12px] leading-6 text-ink-soft">
                            <p className="font-medium text-ink">认证说明</p>
                            <p className="mt-1 whitespace-pre-wrap break-words">
                                {certificationReview?.item.certification.note
                                    || '用户未填写认证说明。'}
                            </p>
                        </div>
                        <label className="grid gap-1.5">
                            <span className="text-[12px] font-medium text-ink-soft">
                                审核备注
                                {certificationReview?.action === 'reject'
                                    ? '（必填）'
                                    : '（可选）'}
                            </span>
                            <textarea
                                className="min-h-[88px] rounded-[4px] border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                                value={certificationReason}
                                onChange={(event) =>
                                    setCertificationReason(event.target.value)
                                }
                                maxLength={200}
                                placeholder={
                                    certificationReview?.action === 'reject'
                                        ? '说明驳回原因，用户可在个人资料中查看'
                                        : '可补充审核备注'
                                }
                            />
                        </label>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={certificationBusy}
                                onClick={() => {
                                    setCertificationReview(null);
                                    setCertificationReason('');
                                }}
                            >
                                取消
                            </Button>
                            <Button type="submit" disabled={certificationBusy}>
                                {certificationBusy ? (
                                    <>
                                        <LoaderCircle className="animate-spin" aria-hidden="true" />
                                        提交中…
                                    </>
                                ) : certificationReview?.action === 'approve' ? (
                                    '确认通过'
                                ) : (
                                    '确认驳回'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

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

            <AlertDialog
                open={confirm !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setConfirm(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirm?.op === 'purge' ? '彻底删除帖子？' : '移入回收站？'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirm?.op === 'purge'
                                ? `${confirm.label}。彻底删除后无法恢复，相关回复、评分与收藏也会一并移除。`
                                : `${confirm?.label ?? '所选帖子'}。普通用户仍能看到标题与时间，管理员可以恢复或彻底删除。`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={topicBusy !== ''}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={topicBusy !== ''}
                            onClick={(event) => {
                                event.preventDefault();
                                confirmAction();
                            }}
                        >
                            {topicBusy !== ''
                                ? '处理中…'
                                : confirm?.op === 'purge'
                                    ? '确认彻底删除'
                                    : '确认移入回收站'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
