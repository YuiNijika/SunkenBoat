import { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    XAxis,
} from 'recharts';
import {
    CircleDot,
    Check,
    ExternalLink,
    FileText,
    MessageSquare,
    MessagesSquare,
    Pencil,
    PenLine,
    Pin,
    Plus,
    ShieldCheck,
    Star,
    Trash2,
    X,
} from 'lucide-react';
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
import { Input } from '../ui/input';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '../ui/chart';
import type { ChartConfig } from '../ui/chart';
import { errorMessage, readPayload } from '../../lib/user';
import type { ApiPayload } from '../../lib/user';
import {
    commentsFrom,
    contentListFrom,
    formatDate,
    formatDateTime,
} from '../../lib/content';
import type { CommentItem, ContentItem } from '../../lib/content';
import type {
    ForumCircle,
    ForumTopic,
    UserApiEndpoints,
    UserForumContent,
    UserProfile,
} from '../../types';

interface Props {
    api: UserApiEndpoints;
    profile: UserProfile;
}

type Feedback = { tone: 'success' | 'error'; text: string };
type Tab = 'posts' | 'topics' | 'circles' | 'comments' | 'moderation';

interface TabMeta {
    id: Tab;
    label: string;
    count: number;
    icon: typeof FileText;
}

interface ActivityPoint {
    label: string;
    count: number;
}

const STATUS_LABELS: Record<string, string> = {
    approved: '已通过',
    waiting: '待审核',
    spam: '垃圾评论',
};

const EMPTY_FORUM: UserForumContent = {
    topics: [],
    circles: { joined: [], created: [] },
    stats: {
        topics: 0,
        replies: 0,
        joinedCircles: 0,
        createdCircles: 0,
    },
};

function forumContentFrom(payload: ApiPayload | null): UserForumContent {
    const data = payload?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return EMPTY_FORUM;
    }

    const record = data as Partial<UserForumContent>;
    const circles =
        record.circles && typeof record.circles === 'object'
            ? record.circles
            : EMPTY_FORUM.circles;
    const stats =
        record.stats && typeof record.stats === 'object'
            ? record.stats
            : EMPTY_FORUM.stats;

    return {
        topics: Array.isArray(record.topics) ? (record.topics as ForumTopic[]) : [],
        circles: {
            joined: Array.isArray(circles.joined) ? (circles.joined as ForumCircle[]) : [],
            created: Array.isArray(circles.created) ? (circles.created as ForumCircle[]) : [],
        },
        stats: {
            topics: Number(stats.topics) || 0,
            replies: Number(stats.replies) || 0,
            joinedCircles: Number(stats.joinedCircles) || 0,
            createdCircles: Number(stats.createdCircles) || 0,
        },
    };
}

function moderationTopicsFrom(payload: ApiPayload | null): ForumTopic[] {
    const data = payload?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return [];
    }

    const items = (data as { items?: unknown }).items;

    return Array.isArray(items) ? (items as ForumTopic[]) : [];
}

function toDate(value: number | string): Date | null {
    if (typeof value === 'number') {
        const date = new Date(value * 1000);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function monthlyActivity(entries: Array<number | string>): ActivityPoint[] {
    const now = new Date();
    const points: ActivityPoint[] = [];
    const buckets = new Map<string, number>();

    for (let offset = 5; offset >= 0; offset -= 1) {
        const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        buckets.set(key, 0);
        points.push({ label: `${date.getMonth() + 1}月`, count: 0 });
    }

    entries.forEach((entry) => {
        const date = toDate(entry);
        if (!date) {
            return;
        }

        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (buckets.has(key)) {
            buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
    });

    let index = 0;
    buckets.forEach((count) => {
        if (points[index]) {
            points[index].count = count;
        }
        index += 1;
    });

    return points;
}

const chartConfig: ChartConfig = {
    count: {
        label: '内容',
        color: 'var(--accent)',
    },
};

export default function ContentManager({ api, profile }: Props) {
    const articleEnabled = profile.canWrite === true && api.content.enabled;
    const canManageArticles = articleEnabled && profile.group === 'administrator';
    const forumEnabled = api.forum?.enabled === true;
    const initialTab: Tab = articleEnabled
        ? 'posts'
        : forumEnabled
          ? 'topics'
          : 'comments';

    const [tab, setTab] = useState<Tab>(initialTab);
    const [items, setItems] = useState<ContentItem[]>([]);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [contentMap, setContentMap] = useState<Record<number, ContentItem>>({});
    const [forum, setForum] = useState<UserForumContent>(EMPTY_FORUM);
    const [postsLoaded, setPostsLoaded] = useState(false);
    const [forumLoaded, setForumLoaded] = useState(false);
    const [moderationTopics, setModerationTopics] = useState<ForumTopic[]>([]);
    const [moderationLoaded, setModerationLoaded] = useState(false);
    const [moderationLoading, setModerationLoading] = useState(false);
    const [moderationSelected, setModerationSelected] = useState<number[]>([]);
    const [moderating, setModerating] = useState('');
    const [moderationViews, setModerationViews] = useState('');
    const [moderationKind, setModerationKind] = useState('');
    const [commentsLoaded, setCommentsLoaded] = useState(false);
    const [loading, setLoading] = useState(articleEnabled);
    const [forumLoading, setForumLoading] = useState(forumEnabled);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ContentItem | null>(null);
    const [deleting, setDeleting] = useState(0);
    const [articleSelected, setArticleSelected] = useState<number[]>([]);
    const [batchViews, setBatchViews] = useState('');
    const [batchLikes, setBatchLikes] = useState('');
    const [batchLayout, setBatchLayout] = useState('');
    const [batchBusy, setBatchBusy] = useState(false);

    const editorUrl = api.pages.editor;

    useEffect(() => {
        if (!articleEnabled) {
            setLoading(false);
            setPostsLoaded(true);
            return;
        }

        const controller = new AbortController();
        let active = true;
        setLoading(true);

        void (async () => {
            try {
                const endpoint = new URL(api.content.contents, window.location.href);
                endpoint.searchParams.set('type', 'post');
                endpoint.searchParams.set('authorId', String(profile.uid));
                endpoint.searchParams.set('page', '1');
                endpoint.searchParams.set('pageSize', '50');

                const response = await fetch(endpoint.toString(), {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取文章列表失败'));
                }

                if (active) {
                    setItems(contentListFrom(payload));
                    setPostsLoaded(true);
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取文章列表失败',
                    });
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [articleEnabled, api.content.contents, profile.uid]);

    useEffect(() => {
        if (!forumEnabled || forumLoaded) {
            setForumLoading(false);
            return;
        }

        const controller = new AbortController();
        let active = true;
        setForumLoading(true);

        void (async () => {
            try {
                const response = await fetch(api.forum.content, {
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-Typecho-Token': api.forum.nonce,
                    },
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取论坛内容失败'));
                }

                if (active) {
                    setForum(forumContentFrom(payload));
                    setForumLoaded(true);
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取论坛内容失败',
                    });
                }
            } finally {
                if (active) {
                    setForumLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [forumEnabled, forumLoaded, api.forum.content, api.forum.nonce]);

    useEffect(() => {
        if (
            tab !== 'moderation'
            || !api.forum?.canModerate
            || moderationLoaded
        ) {
            return;
        }

        const controller = new AbortController();
        let active = true;
        setModerationLoading(true);

        void (async () => {
            try {
                const response = await fetch(api.forum.moderation, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-Typecho-Token': api.forum.nonce,
                    },
                    body: JSON.stringify({ op: 'list' }),
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取待审核帖子失败'));
                }

                if (active) {
                    setModerationTopics(moderationTopicsFrom(payload));
                    setModerationLoaded(true);
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }
                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取待审核帖子失败',
                    });
                }
            } finally {
                if (active) {
                    setModerationLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        tab,
        api.forum?.canModerate,
        api.forum?.moderation,
        api.forum?.nonce,
        moderationLoaded,
    ]);

    useEffect(() => {
        if (tab !== 'comments' || commentsLoaded) {
            return;
        }

        const controller = new AbortController();
        let active = true;
        setCommentsLoading(true);

        void (async () => {
            try {
                const endpoint = new URL(api.content.comments, window.location.href);
                endpoint.searchParams.set('page', '1');
                endpoint.searchParams.set('pageSize', '50');
                const response = await fetch(endpoint.toString(), {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取历史评论失败'));
                }

                const rows = commentsFrom(payload);
                const cids = [...new Set(rows.map((comment) => comment.cid).filter((cid) => cid > 0))];
                const entries = await Promise.all(
                    cids.map(async (cid) => {
                        try {
                            const detail = await fetch(`${api.content.item}/${cid}`, {
                                credentials: 'same-origin',
                                headers: { Accept: 'application/json' },
                                signal: controller.signal,
                            });
                            if (!detail.ok) {
                                return null;
                            }
                            const detailPayload = await readPayload(detail);
                            return detailPayload?.data && typeof detailPayload.data === 'object'
                                ? ([cid, detailPayload.data as ContentItem] as const)
                                : null;
                        } catch {
                            return null;
                        }
                    })
                );

                if (active) {
                    setComments(rows);
                    setContentMap(
                        Object.fromEntries(
                            entries.filter(
                                (entry): entry is readonly [number, ContentItem] =>
                                    entry !== null
                            )
                        )
                    );
                    setCommentsLoaded(true);
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取历史评论失败',
                    });
                }
            } finally {
                if (active) {
                    setCommentsLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        tab,
        commentsLoaded,
        api.content.comments,
        api.content.item,
    ]);

    const circleTotal = useMemo(
        () =>
            Math.max(
                forum.stats.joinedCircles + forum.stats.createdCircles,
                forum.circles.joined.length + forum.circles.created.length
            ),
        [forum]
    );

    const articleCount = postsLoaded ? items.length : profile.posts ?? 0;
    const topicCount = forum.stats.topics || forum.topics.length;
    const commentCount = commentsLoaded ? comments.length : profile.comments ?? 0;
    const circleCount = forumEnabled ? Math.max(circleTotal, profile.circles ?? 0) : 0;
    const interactionCount = (profile.comments ?? 0) + forum.stats.replies;

    const tabs = useMemo<TabMeta[]>(() => {
        const entries: TabMeta[] = [];

        if (articleEnabled) {
            entries.push({ id: 'posts', label: '文章', count: articleCount, icon: FileText });
        }
        if (forumEnabled) {
            entries.push({
                id: 'topics',
                label: '论坛帖子',
                count: topicCount,
                icon: MessagesSquare,
            });
            entries.push({
                id: 'circles',
                label: '圈子',
                count: circleCount,
                icon: CircleDot,
            });
            if (api.forum.canModerate) {
                entries.push({
                    id: 'moderation',
                    label: '帖子审核',
                    count: moderationTopics.length,
                    icon: ShieldCheck,
                });
            }
        }
        entries.push({
            id: 'comments',
            label: '历史评论',
            count: commentCount,
            icon: MessageSquare,
        });

        return entries;
    }, [
        articleEnabled,
        forumEnabled,
        api.forum?.canModerate,
        articleCount,
        topicCount,
        circleCount,
        commentCount,
        moderationTopics.length,
    ]);

    useEffect(() => {
        if (!tabs.some((entry) => entry.id === tab)) {
            setTab(tabs[0]?.id ?? 'comments');
        }
    }, [tab, tabs]);

    const activity = useMemo(() => {
        if (tab === 'topics' || tab === 'circles') {
            return monthlyActivity(forum.topics.map((topic) => topic.created));
        }

        return monthlyActivity(items.map((item) => item.created));
    }, [tab, forum.topics, items]);

    const openEditor = (cid = 0) => {
        window.location.assign(cid > 0 ? `${editorUrl}?cid=${cid}` : editorUrl);
    };

    const openTopicEditor = () => {
        const url = new URL(api.forum.editor, window.location.href);
        url.searchParams.set('type', 'forum-topic');
        window.location.assign(url.toString());
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
        if (batchBusy || articleSelected.length === 0) {
            if (articleSelected.length === 0) {
                setFeedback({ tone: 'error', text: '请先选择要更新的文章。' });
            }
            return;
        }

        const body: Record<string, unknown> = { ids: articleSelected };
        if (batchViews.trim() !== '') {
            const value = Number(batchViews);
            if (!Number.isInteger(value) || value < 0) {
                setFeedback({ tone: 'error', text: '请输入有效的阅读量。' });
                return;
            }
            body.views = value;
        }
        if (batchLikes.trim() !== '') {
            const value = Number(batchLikes);
            if (!Number.isInteger(value) || value < 0) {
                setFeedback({ tone: 'error', text: '请输入有效的点赞数。' });
                return;
            }
            body.likes = value;
        }
        if (batchLayout !== '') {
            body.layout = batchLayout;
        }
        if (!('views' in body) && !('likes' in body) && !('layout' in body)) {
            setFeedback({ tone: 'error', text: '请至少填写一项要更新的内容。' });
            return;
        }

        setBatchBusy(true);
        setFeedback(null);
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

            const updated =
                payload?.data
                && typeof payload.data === 'object'
                && !Array.isArray(payload.data)
                && Number.isFinite(Number((payload.data as { updated?: unknown }).updated))
                    ? Number((payload.data as { updated: number }).updated)
                    : articleSelected.length;
            setArticleSelected([]);
            setFeedback({ tone: 'success', text: `已更新 ${updated} 篇文章。` });
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '批量更新文章失败',
            });
        } finally {
            setBatchBusy(false);
        }
    };

    const toggleModerationTopic = (id: number, checked: boolean) => {
        setModerationSelected((current) => {
            if (checked) {
                return current.includes(id) ? current : [...current, id];
            }

            return current.filter((value) => value !== id);
        });
    };

    const toggleAllModerationTopics = (checked: boolean) => {
        setModerationSelected(
            checked ? moderationTopics.map((topic) => topic.id) : []
        );
    };

    const moderate = async (action: string) => {
        if (moderating !== '' || moderationSelected.length === 0) {
            if (moderationSelected.length === 0) {
                setFeedback({ tone: 'error', text: '请先选择要处理的帖子。' });
            }
            return;
        }

        setModerating(action);
        setFeedback(null);
        const body: Record<string, unknown> = {
            op: action,
            ids: moderationSelected,
        };
        if (action === 'views') {
            const views = Number(moderationViews);
            if (!Number.isInteger(views) || views < 0) {
                setFeedback({ tone: 'error', text: '请输入有效的阅读量。' });
                setModerating('');
                return;
            }
            body.views = views;
        }
        if (action === 'kind') {
            if (moderationKind === '') {
                setFeedback({ tone: 'error', text: '请选择帖子类型。' });
                setModerating('');
                return;
            }
            body.kind = moderationKind;
        }

        try {
            const response = await fetch(api.forum.moderation, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.forum.nonce,
                },
                body: JSON.stringify(body),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '处理帖子失败'));
            }

            const data = payload?.data;
            const message =
                data
                && typeof data === 'object'
                && !Array.isArray(data)
                && typeof (data as { message?: unknown }).message === 'string'
                    ? String((data as { message: string }).message)
                    : '帖子已更新';
            setModerationTopics(moderationTopicsFrom(payload));
            setModerationSelected([]);
            setForumLoaded(false);
            setFeedback({ tone: 'success', text: message });
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '处理帖子失败',
            });
        } finally {
            setModerating('');
        }
    };

    const remove = async () => {
        if (!pendingDelete || deleting > 0) {
            return;
        }

        const target = pendingDelete;
        setDeleting(target.cid);

        try {
            const response = await fetch(`${api.content.posts}/${target.cid}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '删除文章失败'));
            }

            setItems((current) => current.filter((item) => item.cid !== target.cid));
            setFeedback({ tone: 'success', text: `《${target.title}》已删除。` });
            setPendingDelete(null);
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '删除文章失败',
            });
        } finally {
            setDeleting(0);
        }
    };

    if (!articleEnabled && !forumEnabled) {
        return (
            <div className="content-empty">
                <p className="text-[14px] font-medium">当前账号没有内容管理权限</p>
                <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                    文章发布权限由站点设置决定；论坛内容需要站点开启论坛并允许当前用户组参与。
                </p>
            </div>
        );
    }

    const renderCircleGroup = (title: string, circles: ForumCircle[], kind: 'joined' | 'created') => {
        if (circles.length === 0) {
            return null;
        }

        return (
            <section className="content-circle-group" aria-label={title}>
                <div className="content-circle-group-head">
                    <h4>{title}</h4>
                    <span>{circles.length}</span>
                </div>
                <div className="content-circle-list">
                    {circles.map((circle) => (
                        <a key={circle.id} className="content-circle-item" href={circle.url}>
                            <span className="content-circle-icon">
                                {circle.icon !== '' ? (
                                    <img src={circle.icon} alt="" loading="lazy" />
                                ) : (
                                    <CircleDot aria-hidden="true" />
                                )}
                            </span>
                            <span className="content-circle-body">
                                <span className="content-circle-name">{circle.name}</span>
                                <span className="content-circle-meta">
                                    {circle.memberCount} 位圈友 · {circle.topicCount} 个帖子
                                </span>
                            </span>
                            <Badge variant="outline">
                                {kind === 'created' ? '我创建的' : '已加入'}
                            </Badge>
                            <ExternalLink aria-hidden="true" />
                        </a>
                    ))}
                </div>
            </section>
        );
    };

    return (
        <div className="content-manager">
            <div className="content-toolbar">
                <div className="content-tabs" role="tablist" aria-label="内容管理视图">
                    {tabs.map((entry) => {
                        const Icon = entry.icon;
                        return (
                            <button
                                key={entry.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === entry.id}
                                className={tab === entry.id ? 'is-active' : ''}
                                onClick={() => setTab(entry.id)}
                            >
                                <Icon aria-hidden="true" />
                                {entry.label}
                                <span>{entry.count}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="content-toolbar-actions">
                    {articleEnabled ? (
                        <Button type="button" size="sm" onClick={() => openEditor()}>
                            <Plus aria-hidden="true" />
                            写文章
                        </Button>
                    ) : null}
                    {forumEnabled && api.forum.canPost ? (
                        <Button type="button" size="sm" variant="outline" onClick={openTopicEditor}>
                            <PenLine aria-hidden="true" />
                            发帖子
                        </Button>
                    ) : null}
                    {forumEnabled ? (
                        <Button asChild type="button" size="sm" variant="ghost">
                            <a href={api.forum.home}>圈子广场</a>
                        </Button>
                    ) : null}
                </div>
            </div>

            <section className="content-overview" aria-label="内容概览">
                <div className="content-overview-metrics">
                    <div className="content-overview-metric">
                        <span>文章</span>
                        <strong>{articleCount}</strong>
                    </div>
                    <div className="content-overview-metric">
                        <span>论坛帖子</span>
                        <strong>{topicCount}</strong>
                    </div>
                    <div className="content-overview-metric">
                        <span>圈子</span>
                        <strong>{circleCount}</strong>
                    </div>
                    <div className="content-overview-metric">
                        <span>评论与回复</span>
                        <strong>{interactionCount}</strong>
                    </div>
                </div>
                <div className="content-overview-trend">
                    <div className="content-overview-trend-head">
                        <span>近 6 个月发布</span>
                        <small>文章与论坛帖子</small>
                    </div>
                    <ChartContainer config={chartConfig} className="content-overview-chart">
                        <BarChart data={activity} accessibilityLayer>
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 10 }}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent hideLabel />}
                            />
                            <Bar
                                dataKey="count"
                                fill="var(--color-count)"
                                radius={[4, 4, 0, 0]}
                            />
                        </BarChart>
                    </ChartContainer>
                </div>
            </section>

            {feedback ? (
                <p
                    className={
                        'content-feedback ' +
                        (feedback.tone === 'error'
                            ? 'content-feedback-error'
                            : 'content-feedback-success')
                    }
                    role={feedback.tone === 'error' ? 'alert' : 'status'}
                >
                    {feedback.text}
                </p>
            ) : null}

            {tab === 'posts' ? (
                <div className="grid gap-3">
                    {canManageArticles && items.length > 0 ? (
                        <div className="flex flex-wrap items-end gap-2 rounded-[6px] bg-surface-2 px-2.5 py-2">
                            <label className="inline-flex h-8 items-center gap-2 text-[12px] text-ink-mute">
                                <Checkbox
                                    checked={
                                        items.length > 0
                                        && articleSelected.length === items.length
                                    }
                                    onCheckedChange={(checked) =>
                                        setArticleSelected(
                                            checked === true
                                                ? items.map((item) => item.cid)
                                                : []
                                        )
                                    }
                                    aria-label="选择全部文章"
                                />
                                选择全部
                            </label>
                            <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                阅读量
                                <Input
                                    type="number"
                                    min={0}
                                    max={1000000000}
                                    className="h-8 w-24"
                                    value={batchViews}
                                    onChange={(event) => setBatchViews(event.target.value)}
                                    placeholder="不修改"
                                />
                            </label>
                            <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                点赞数
                                <Input
                                    type="number"
                                    min={0}
                                    max={1000000000}
                                    className="h-8 w-24"
                                    value={batchLikes}
                                    onChange={(event) => setBatchLikes(event.target.value)}
                                    placeholder="不修改"
                                />
                            </label>
                            <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                正文布局
                                <select
                                    className="h-8 min-w-28 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink outline-none"
                                    value={batchLayout}
                                    onChange={(event) => setBatchLayout(event.target.value)}
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
                                disabled={batchBusy || articleSelected.length === 0}
                                onClick={() => void updateArticles()}
                            >
                                {batchBusy ? '更新中…' : '批量更新'}
                            </Button>
                        </div>
                    ) : null}
                    {loading ? (
                    <div className="content-skeleton" aria-busy="true" aria-label="正在加载文章">
                        {[1, 2, 3].map((item) => (
                            <span key={item} className="content-skeleton-row" />
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="content-empty">
                        <FileText
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">还没有写过文章</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            点击“写文章”开始第一篇内容。
                        </p>
                    </div>
                ) : (
                    <ul className="content-list">
                        {items.map((item) => (
                            <li key={item.cid} className="content-list-item">
                                {canManageArticles ? (
                                    <Checkbox
                                        checked={articleSelected.includes(item.cid)}
                                        onCheckedChange={(checked) =>
                                            toggleArticle(item.cid, checked === true)
                                        }
                                        aria-label={`选择 ${item.title}`}
                                    />
                                ) : null}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium">
                                            {item.title || '未命名文章'}
                                        </p>
                                        <Badge
                                            variant={
                                                item.status === 'publish' ? 'default' : 'secondary'
                                            }
                                        >
                                            {item.status === 'publish' ? '已发布' : '草稿'}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                                        <span>{formatDate(item.created)}</span>
                                        <span>{item.commentsNum} 条评论</span>
                                        {item.categories.length > 0 ? (
                                            <span className="truncate">
                                                {item.categories
                                                    .map((category) => category.name)
                                                    .join(' / ')}
                                            </span>
                                        ) : null}
                                    </p>
                                </div>

                                <div className="content-list-actions">
                                    {item.permalink !== '' && item.status === 'publish' ? (
                                        <Button
                                            asChild
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="查看文章"
                                        >
                                            <a href={item.permalink} target="_blank" rel="noreferrer">
                                                <ExternalLink aria-hidden="true" />
                                            </a>
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`编辑 ${item.title}`}
                                        onClick={() => openEditor(item.cid)}
                                    >
                                        <Pencil aria-hidden="true" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`删除 ${item.title}`}
                                        onClick={() => setPendingDelete(item)}
                                    >
                                        <Trash2 aria-hidden="true" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    )}
                </div>
            ) : tab === 'topics' ? (
                forumLoading ? (
                    <div className="content-skeleton" aria-busy="true" aria-label="正在加载论坛帖子">
                        {[1, 2, 3].map((item) => (
                            <span key={item} className="content-skeleton-row" />
                        ))}
                    </div>
                ) : forum.topics.length === 0 ? (
                    <div className="content-empty">
                        <MessagesSquare
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">还没有发布论坛帖子</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            {api.forum.canPost
                                ? '点击“发帖子”参与圈子讨论。'
                                : '当前用户组没有发帖权限。'}
                        </p>
                        <Button asChild variant="outline" size="sm" className="mt-4">
                            <a href={api.forum.home}>去圈子看看</a>
                        </Button>
                    </div>
                ) : (
                    <ul className="content-list">
                        {forum.topics.map((topic) => (
                            <li key={topic.id} className="content-list-item content-topic-item">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium">
                                            {topic.title}
                                        </p>
                                        <Badge variant="secondary">{topic.kindLabel}</Badge>
                                        {topic.pinned ? (
                                            <Badge variant="outline">置顶</Badge>
                                        ) : null}
                                        {topic.featured ? (
                                            <Badge variant="outline">精华</Badge>
                                        ) : null}
                                    </div>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                                        {topic.circle ? (
                                            <a
                                                className="inline-flex items-center gap-1 hover:text-brand"
                                                href={topic.circle.url}
                                            >
                                                <CircleDot
                                                    className="size-3"
                                                    strokeWidth={1.8}
                                                    aria-hidden="true"
                                                />
                                                {topic.circle.name}
                                            </a>
                                        ) : null}
                                        <span>{topic.createdText}</span>
                                        <span>{topic.views} 浏览</span>
                                        <span>{topic.comments} 回复</span>
                                    </p>
                                    {topic.tags.length > 0 ? (
                                        <div className="content-topic-tags">
                                            {topic.tags.map((tag) => (
                                                <span key={tag}>#{tag}</span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>

                                <div className="content-list-actions">
                                    <Button
                                        asChild
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`查看 ${topic.title}`}
                                    >
                                        <a href={topic.url} target="_blank" rel="noreferrer">
                                            <ExternalLink aria-hidden="true" />
                                        </a>
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )
            ) : tab === 'circles' ? (
                forumLoading ? (
                    <div className="content-skeleton" aria-busy="true" aria-label="正在加载圈子">
                        {[1, 2, 3].map((item) => (
                            <span key={item} className="content-skeleton-row" />
                        ))}
                    </div>
                ) : forum.circles.joined.length === 0 && forum.circles.created.length === 0 ? (
                    <div className="content-empty">
                        <CircleDot
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">还没有加入圈子</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            在圈子广场发现感兴趣的话题，加入后会显示在这里。
                        </p>
                        <Button asChild variant="outline" size="sm" className="mt-4">
                            <a href={api.forum.home}>探索圈子</a>
                        </Button>
                    </div>
                ) : (
                    <div className="content-circle-groups">
                        {renderCircleGroup('我创建的圈子', forum.circles.created, 'created')}
                        {renderCircleGroup('已加入的圈子', forum.circles.joined, 'joined')}
                    </div>
                )
            ) : tab === 'moderation' ? (
                moderationLoading ? (
                    <div className="content-skeleton" aria-busy="true" aria-label="正在加载待审核帖子">
                        {[1, 2, 3].map((item) => (
                            <span key={item} className="content-skeleton-row" />
                        ))}
                    </div>
                ) : moderationTopics.length === 0 ? (
                    <div className="content-empty">
                        <ShieldCheck
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">没有待处理的帖子</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            待审核和被驳回的帖子会显示在这里。
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-[12px] text-ink-mute">
                                <Checkbox
                                    checked={
                                        moderationTopics.length > 0
                                        && moderationSelected.length === moderationTopics.length
                                    }
                                    onCheckedChange={(checked) =>
                                        toggleAllModerationTopics(checked === true)
                                    }
                                    aria-label="选择全部待审核帖子"
                                />
                                选择全部
                            </label>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={moderating !== '' || moderationSelected.length === 0}
                                    onClick={() => void moderate('approve')}
                                >
                                    <Check aria-hidden="true" />
                                    {moderating === 'approve' ? '处理中…' : '通过'}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={moderating !== '' || moderationSelected.length === 0}
                                    onClick={() => void moderate('reject')}
                                >
                                    <X aria-hidden="true" />
                                    {moderating === 'reject' ? '处理中…' : '驳回'}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={moderating !== '' || moderationSelected.length === 0}
                                    onClick={() => void moderate('pin')}
                                >
                                    <Pin aria-hidden="true" />
                                    置顶
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    disabled={moderating !== '' || moderationSelected.length === 0}
                                    onClick={() => void moderate('feature')}
                                >
                                    <Star aria-hidden="true" />
                                    精华
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-end gap-1.5 rounded-[6px] bg-surface-2 px-2.5 py-2">
                            <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                阅读量
                                <Input
                                    type="number"
                                    min={0}
                                    max={1000000000}
                                    className="h-8 w-28"
                                    value={moderationViews}
                                    onChange={(event) => setModerationViews(event.target.value)}
                                    placeholder="例如 1000"
                                />
                            </label>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={moderating !== '' || moderationSelected.length === 0}
                                onClick={() => void moderate('views')}
                            >
                                {moderating === 'views' ? '处理中…' : '设置阅读量'}
                            </Button>
                            <label className="grid gap-1 text-[10.5px] text-ink-faint">
                                帖子类型
                                <select
                                    className="h-8 min-w-32 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink outline-none"
                                    value={moderationKind}
                                    onChange={(event) => setModerationKind(event.target.value)}
                                >
                                    <option value="">选择类型</option>
                                    {api.forum.kinds.map((kind) => (
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
                                disabled={moderating !== '' || moderationSelected.length === 0}
                                onClick={() => void moderate('kind')}
                            >
                                {moderating === 'kind' ? '处理中…' : '修改类型'}
                            </Button>
                        </div>

                        <ul className="content-list">
                            {moderationTopics.map((topic) => (
                                <li key={topic.id} className="content-list-item content-topic-item">
                                    <Checkbox
                                        checked={moderationSelected.includes(topic.id)}
                                        onCheckedChange={(checked) =>
                                            toggleModerationTopic(topic.id, checked === true)
                                        }
                                        aria-label={`选择 ${topic.title}`}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-[13px] font-medium">
                                                {topic.title}
                                            </p>
                                            <Badge
                                                variant={
                                                    topic.status === 'waiting'
                                                        ? 'secondary'
                                                        : 'outline'
                                                }
                                            >
                                                {topic.status === 'waiting' ? '待审核' : '已驳回'}
                                            </Badge>
                                            <Badge variant="outline">{topic.kindLabel}</Badge>
                                        </div>
                                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                                            {topic.circle ? <span>{topic.circle.name}</span> : null}
                                            <span>{topic.author.screenName || topic.author.name}</span>
                                            <span>{topic.createdText}</span>
                                        </p>
                                        {topic.excerpt !== '' ? (
                                            <p className="mt-1 line-clamp-2 text-[11.5px] leading-5 text-ink-mute">
                                                {topic.excerpt}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className="content-list-actions">
                                        <Button
                                            asChild
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={`查看 ${topic.title}`}
                                        >
                                            <a href={topic.url} target="_blank" rel="noreferrer">
                                                <ExternalLink aria-hidden="true" />
                                            </a>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )
            ) : commentsLoading ? (
                <div className="content-skeleton" aria-busy="true" aria-label="正在加载历史评论">
                    {[1, 2, 3].map((item) => (
                        <span key={item} className="content-skeleton-row" />
                    ))}
                </div>
            ) : comments.length === 0 ? (
                <div className="content-empty">
                    <MessageSquare
                        className="mx-auto size-7 text-ink-faint"
                        strokeWidth={1.5}
                        aria-hidden="true"
                    />
                    <p className="mt-3 text-[13px] font-medium">还没有历史评论</p>
                    <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                        你参与过的评论会显示在这里。
                    </p>
                </div>
            ) : (
                <ul className="comment-history">
                    {comments.map((comment) => {
                        const content = contentMap[comment.cid];
                        return (
                            <li key={comment.coid} className="comment-history-item">
                                <div className="comment-history-head">
                                    <a
                                        href={content?.permalink || api.pages.content}
                                        className="comment-history-title"
                                    >
                                        {content?.title || `文章 #${comment.cid}`}
                                    </a>
                                    <Badge
                                        variant={
                                            comment.status === 'approved' ? 'secondary' : 'outline'
                                        }
                                    >
                                        {STATUS_LABELS[comment.status] ?? comment.status}
                                    </Badge>
                                    <time dateTime={comment.created}>
                                        {formatDateTime(comment.created)}
                                    </time>
                                </div>
                                <p className="comment-history-text">
                                    {comment.text.replace(/\s+/g, ' ').trim() || '（空评论）'}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <AlertDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingDelete(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除这篇文章？</AlertDialogTitle>
                        <AlertDialogDescription>
                            《{pendingDelete?.title ?? ''}》删除后无法恢复，相关评论也会一并移除。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting > 0}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleting > 0}
                            onClick={(event) => {
                                event.preventDefault();
                                void remove();
                            }}
                        >
                            {deleting > 0 ? '删除中…' : '确认删除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
