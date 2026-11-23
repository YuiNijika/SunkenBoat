import { useEffect, useMemo, useState } from 'react';
import {
    Bar,
    BarChart,
    XAxis,
} from 'recharts';
import {
    CircleDot,
    ExternalLink,
    FileText,
    LayoutDashboard,
    MessageSquare,
    MessagesSquare,
    MoreHorizontal,
    Pencil,
    PenLine,
    Plus,
    Trash2,
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '../ui/chart';
import type { ChartConfig } from '../ui/chart';
import { errorMessage, readPayload } from '../../lib/user';
import type { ApiPayload } from '../../lib/user';
import { notifyError, notifySuccess } from '../../lib/notify';
import { navigateApp } from '../../lib/appNavigation';
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
import TabsNav from './TabsNav';

interface Props {
    api: UserApiEndpoints;
    profile: UserProfile;
}

type Tab = 'dashboard' | 'posts' | 'topics' | 'circles' | 'comments';
type TopicFilter = 'all' | 'publish' | 'waiting' | 'rejected' | 'deleted' | 'pinned' | 'featured';
type ArticleFilter = 'all' | 'publish' | 'draft';

interface TabMeta {
    id: Tab;
    label: string;
    count?: number;
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
    const forumEnabled = api.forum?.enabled === true;
    const forumLabel = api.forum?.label || '圈子';
    const forumTitle = api.forum?.title || '圈子广场';
    const initialTab: Tab = 'dashboard';

    const [tab, setTab] = useState<Tab>(initialTab);
    const [items, setItems] = useState<ContentItem[]>([]);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [contentMap, setContentMap] = useState<Record<number, ContentItem>>({});
    const [forum, setForum] = useState<UserForumContent>(EMPTY_FORUM);
    const [postsLoaded, setPostsLoaded] = useState(false);
    const [forumLoaded, setForumLoaded] = useState(false);
    const [commentsLoaded, setCommentsLoaded] = useState(false);
    const [loading, setLoading] = useState(articleEnabled);
    const [forumLoading, setForumLoading] = useState(forumEnabled);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<ContentItem | null>(null);
    const [deleting, setDeleting] = useState(0);
    const [pendingTopicDelete, setPendingTopicDelete] = useState<ForumTopic | null>(null);
    const [topicDeleting, setTopicDeleting] = useState(0);
    const [topicQuery, setTopicQuery] = useState('');
    const [topicFilter, setTopicFilter] = useState<TopicFilter>('all');
    const [articleQuery, setArticleQuery] = useState('');
    const [articleFilter, setArticleFilter] = useState<ArticleFilter>('all');

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
                    notifyError(
                        reason instanceof Error ? reason.message : '读取文章列表失败'
                    );
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
                    notifyError(
                        reason instanceof Error ? reason.message : '读取论坛内容失败'
                    );
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
                    notifyError(
                        reason instanceof Error ? reason.message : '读取历史评论失败'
                    );
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
        const entries: TabMeta[] = [
            {
                id: 'dashboard',
                label: '概览',
                icon: LayoutDashboard,
            },
        ];

        if (articleEnabled) {
            entries.push({ id: 'posts', label: '文章', count: articleCount, icon: FileText });
        }
        if (forumEnabled) {
            entries.push({
                id: 'topics',
                label: `${forumLabel}帖子`,
                count: topicCount,
                icon: MessagesSquare,
            });
            entries.push({
                id: 'circles',
                label: forumLabel,
                count: circleCount,
                icon: CircleDot,
            });
        }
        entries.push({
            id: 'comments',
            label: '我的评论',
            count: commentCount,
            icon: MessageSquare,
        });

        return entries;
    }, [
        articleEnabled,
        forumEnabled,
        articleCount,
        topicCount,
        circleCount,
        commentCount,
        forumLabel,
    ]);

    useEffect(() => {
        if (!tabs.some((entry) => entry.id === tab)) {
            setTab(tabs[0]?.id ?? 'comments');
        }
    }, [tab, tabs]);

    useEffect(() => {
        setTopicQuery('');
        setTopicFilter('all');
        setArticleQuery('');
        setArticleFilter('all');
    }, [tab]);

    const activity = useMemo(() => {
        if (tab === 'dashboard') {
            return monthlyActivity([
                ...items.map((item) => item.created),
                ...forum.topics.map((topic) => topic.created),
            ]);
        }
        if (tab === 'topics' || tab === 'circles') {
            return monthlyActivity(forum.topics.map((topic) => topic.created));
        }

        return monthlyActivity(items.map((item) => item.created));
    }, [tab, forum.topics, items]);

    const topicView = useMemo(() => {
        const source = forum.topics;
        const counts: Record<TopicFilter, number> = {
            all: source.length,
            publish: source.filter((topic) => topic.status === 'publish').length,
            waiting: source.filter((topic) => topic.status === 'waiting').length,
            rejected: source.filter((topic) => topic.status === 'rejected').length,
            deleted: source.filter((topic) => topic.status === 'deleted').length,
            pinned: source.filter((topic) => topic.pinned).length,
            featured: source.filter((topic) => topic.featured).length,
        };
        const keyword = topicQuery.trim().toLowerCase();
        const filtered = source.filter((topic) => {
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

        return { source, filtered, counts };
    }, [forum.topics, topicFilter, topicQuery]);

    const articleView = useMemo(() => {
        const counts: Record<ArticleFilter, number> = {
            all: items.length,
            publish: items.filter((item) => item.status === 'publish').length,
            draft: items.filter((item) => item.status === 'draft').length,
        };
        const keyword = articleQuery.trim().toLowerCase();
        const filtered = items.filter((item) => {
            if (articleFilter !== 'all' && item.status !== articleFilter) {
                return false;
            }
            if (keyword === '') {
                return true;
            }

            return [
                item.title,
                item.slug,
                item.status === 'publish' ? '已发布' : '草稿',
                item.categories.map((category) => category.name).join(' '),
                item.tags.map((tag) => tag.name).join(' '),
            ]
                .join(' ')
                .toLowerCase()
                .includes(keyword);
        });

        return { source: items, filtered, counts };
    }, [items, articleFilter, articleQuery]);

    const openEditor = (cid = 0) => {
        navigateApp(cid > 0 ? `${editorUrl}?cid=${cid}` : editorUrl);
    };

    const openTopicEditor = (topicId = 0) => {
        const url = new URL(api.forum.editor, window.location.href);
        url.searchParams.set('type', 'forum-topic');
        if (topicId > 0) {
            url.searchParams.set('id', String(topicId));
        }
        navigateApp(url.toString());
    };

    const removeTopic = async () => {
        if (!pendingTopicDelete || topicDeleting > 0) {
            return;
        }

        const target = pendingTopicDelete;
        setTopicDeleting(target.id);
        try {
            const response = await fetch(api.forum.topicDelete, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': api.forum.nonce,
                },
                body: JSON.stringify({ topic_id: target.id }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '删除帖子失败'));
            }

            setForum((current) => ({
                ...current,
                topics: current.topics.map((topic) =>
                    topic.id === target.id
                        ? {
                              ...topic,
                              status: 'deleted',
                              deleted: true,
                              restricted: true,
                              excerpt: '',
                              thumbnail: '',
                          }
                        : topic
                ),
                stats: {
                    ...current.stats,
                    topics:
                        target.status === 'publish'
                            ? Math.max(0, current.stats.topics - 1)
                            : current.stats.topics,
                },
            }));
            setPendingTopicDelete(null);
            notifySuccess(`《${target.title}》已移入回收站。`);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '删除帖子失败');
        } finally {
            setTopicDeleting(0);
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
                headers: {
                    Accept: 'application/json',
                    'X-Typecho-Token': api.profileNonce,
                },
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '删除文章失败'));
            }

            setItems((current) => current.filter((item) => item.cid !== target.cid));
            notifySuccess(`《${target.title}》已删除。`);
            setPendingDelete(null);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '删除文章失败');
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

    const renderDashboard = () => {
        const recentArticles = items.slice(0, 3);
        const recentTopics = forum.topics.slice(0, 3);

        return (
            <div className="content-dashboard">
                <section className="content-overview" aria-label="内容概览">
                    <div className="content-overview-metrics">
                        <div className="content-overview-metric">
                            <span>文章</span>
                            <strong>{articleCount}</strong>
                        </div>
                        <div className="content-overview-metric">
                            <span>{forumLabel}帖子</span>
                            <strong>{topicCount}</strong>
                        </div>
                        <div className="content-overview-metric">
                            <span>{forumLabel}</span>
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
                            <small>文章与{forumLabel}帖子</small>
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

                <div className="content-dashboard-grid">
                    <section className="content-dashboard-panel">
                        <div className="content-dashboard-head">
                            <div>
                                <h4>最近文章</h4>
                                <p>继续编辑最近发布或保存的内容。</p>
                            </div>
                            {articleEnabled ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => setTab('posts')}
                                >
                                    查看全部
                                </Button>
                            ) : null}
                        </div>
                        {loading ? (
                            <div className="content-dashboard-skeleton" aria-busy="true">
                                <span />
                                <span />
                            </div>
                        ) : recentArticles.length === 0 ? (
                            <p className="content-dashboard-empty">还没有文章，发布后会显示在这里。</p>
                        ) : (
                            <div className="content-dashboard-list">
                                {recentArticles.map((item) => (
                                    <button
                                        key={item.cid}
                                        type="button"
                                        className="content-dashboard-row"
                                        onClick={() => openEditor(item.cid)}
                                    >
                                        <span className="content-dashboard-row-main">
                                            <strong>{item.title || '未命名文章'}</strong>
                                            <small>
                                                {formatDate(item.created)} · {item.commentsNum} 条评论
                                            </small>
                                        </span>
                                        <Pencil aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    {forumEnabled ? (
                        <section className="content-dashboard-panel">
                            <div className="content-dashboard-head">
                                <div>
                                    <h4>最近{forumLabel}帖子</h4>
                                    <p>查看你参与的讨论与最新回复。</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => setTab('topics')}
                                >
                                    查看全部
                                </Button>
                            </div>
                            {forumLoading ? (
                                <div className="content-dashboard-skeleton" aria-busy="true">
                                    <span />
                                    <span />
                                </div>
                            ) : recentTopics.length === 0 ? (
                                <p className="content-dashboard-empty">
                                    还没有发布帖子，参与讨论后会显示在这里。
                                </p>
                            ) : (
                                <div className="content-dashboard-list">
                                    {recentTopics.map((topic) => (
                                        <a
                                            key={topic.id}
                                            className="content-dashboard-row"
                                            href={topic.url}
                                        >
                                            <span className="content-dashboard-row-main">
                                                <strong>{topic.title}</strong>
                                                <small>
                                                    {topic.circle?.name ?? forumLabel}
                                                    {' · '}
                                                    {topic.createdText}
                                                    {' · '}
                                                    {topic.comments} 回复
                                                </small>
                                            </span>
                                            <ExternalLink aria-hidden="true" />
                                        </a>
                                    ))}
                                </div>
                            )}
                        </section>
                    ) : null}
                </div>
            </div>
        );
    };

    const renderArticleFilters = () => {
        if (articleView.source.length === 0) {
            return null;
        }

        const filtering = articleQuery.trim() !== '' || articleFilter !== 'all';

        return (
            <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-line bg-surface px-2.5 py-2">
                <Input
                    className="h-8 w-full sm:w-60"
                    value={articleQuery}
                    onChange={(event) => setArticleQuery(event.target.value)}
                    placeholder="搜索标题、分类、标签或状态"
                    aria-label="搜索文章"
                />
                <select
                    className="h-8 min-w-32 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                    value={articleFilter}
                    onChange={(event) =>
                        setArticleFilter(event.target.value as ArticleFilter)
                    }
                    aria-label="筛选文章状态"
                >
                    <option value="all">全部状态（{articleView.counts.all}）</option>
                    <option value="publish">已发布（{articleView.counts.publish}）</option>
                    <option value="draft">草稿（{articleView.counts.draft}）</option>
                </select>
                <span className="text-[10.5px] text-ink-faint">
                    {articleView.filtered.length} / {articleView.source.length} 条
                </span>
                {filtering ? (
                    <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                            setArticleQuery('');
                            setArticleFilter('all');
                        }}
                    >
                        清除筛选
                    </Button>
                ) : null}
            </div>
        );
    };

    const renderTopicFilters = () => {
        if (topicView.source.length === 0) {
            return null;
        }

        const filtering = topicQuery.trim() !== '' || topicFilter !== 'all';

        return (
            <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-line bg-surface px-2.5 py-2">
                <Input
                    className="h-8 w-full sm:w-60"
                    value={topicQuery}
                    onChange={(event) => setTopicQuery(event.target.value)}
                    placeholder={`搜索标题、作者、${forumLabel}或话题`}
                    aria-label={`搜索${forumLabel}帖子`}
                />
                <select
                    className="h-8 min-w-32 rounded-[4px] border border-line bg-surface px-2 text-[12px] text-ink outline-none transition-[border-color,box-shadow] focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20"
                    value={topicFilter}
                    onChange={(event) => setTopicFilter(event.target.value as TopicFilter)}
                    aria-label="筛选帖子状态"
                >
                    <option value="all">全部状态（{topicView.counts.all}）</option>
                    <option value="waiting">待审核（{topicView.counts.waiting}）</option>
                    <option value="publish">已发布（{topicView.counts.publish}）</option>
                    <option value="rejected">已驳回（{topicView.counts.rejected}）</option>
                    <option value="deleted">回收站（{topicView.counts.deleted}）</option>
                    <option value="pinned">已置顶（{topicView.counts.pinned}）</option>
                    <option value="featured">精华（{topicView.counts.featured}）</option>
                </select>
                <span className="text-[10.5px] text-ink-faint">
                    {topicView.filtered.length} / {topicView.source.length} 条
                </span>
                {filtering ? (
                    <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                            setTopicQuery('');
                            setTopicFilter('all');
                        }}
                    >
                        清除筛选
                    </Button>
                ) : null}
            </div>
        );
    };

    return (
        <div className="content-manager min-w-0 grid-cols-[minmax(0,1fr)]">
            <div className="content-toolbar">
                <TabsNav
                    variant="tab"
                    className="content-tabs"
                    ariaLabel="个人内容管理视图"
                    active={tab}
                    idPrefix="content-manager"
                    panelId="content-manager-panel"
                    onChange={(id) => setTab(id as Tab)}
                    items={tabs.map((entry) => {
                        const Icon = entry.icon;
                        return {
                            id: entry.id,
                            label: entry.label,
                            icon: <Icon aria-hidden="true" />,
                            count: entry.count,
                        };
                    })}
                />

                <div className="content-toolbar-actions">
                    {articleEnabled ? (
                        <Button type="button" size="sm" onClick={() => openEditor()}>
                            <Plus aria-hidden="true" />
                            写文章
                        </Button>
                    ) : null}
                    {forumEnabled && api.forum.canPost ? (
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openTopicEditor()}
                        >
                            <PenLine aria-hidden="true" />
                            发帖子
                        </Button>
                    ) : null}
                    {forumEnabled ? (
                        <Button asChild type="button" size="sm" variant="ghost">
                            <a href={api.forum.home}>{forumTitle}</a>
                        </Button>
                    ) : null}
                </div>
            </div>

            <div
                id="content-manager-panel"
                role="tabpanel"
                aria-labelledby={`content-manager-tab-${tab}`}
                className="contents"
            >
                {tab === 'dashboard' ? (
                    renderDashboard()
                ) : tab === 'posts' ? (
                <div className="grid gap-3">
                    {renderArticleFilters()}
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
                ) : articleView.filtered.length === 0 ? (
                    <div className="content-empty">
                        <FileText
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">没有匹配的文章</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            换一个关键词或状态，查看其他文章。
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => {
                                setArticleQuery('');
                                setArticleFilter('all');
                            }}
                        >
                            清除筛选
                        </Button>
                    </div>
                ) : (
                    <ul className="content-list">
                        {articleView.filtered.map((item) => (
                            <li key={item.cid} className="content-list-item">
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
                ) : topicView.source.length === 0 ? (
                    <div className="content-empty">
                        <MessagesSquare
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">
                            还没有发布{forumLabel}帖子
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            {api.forum.canPost
                                ? `点击“发帖子”参与${forumLabel}讨论。`
                                : '当前用户组没有发帖权限。'}
                        </p>
                        <Button asChild variant="outline" size="sm" className="mt-4">
                            <a href={api.forum.home}>去{forumTitle}</a>
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {renderTopicFilters()}
                        {topicView.filtered.length === 0 ? (
                            <div className="content-empty">
                                <MessagesSquare
                                    className="mx-auto size-7 text-ink-faint"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                />
                                <p className="mt-3 text-[13px] font-medium">没有匹配的帖子</p>
                                <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                                    换一个关键词或状态，查看其他帖子。
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-4"
                                    onClick={() => {
                                        setTopicQuery('');
                                        setTopicFilter('all');
                                    }}
                                >
                                    清除筛选
                                </Button>
                            </div>
                        ) : (
                        <ul className="content-list">
                        {topicView.filtered.map((topic) => (
                            <li key={topic.id} className="content-list-item content-topic-item">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium">
                                            {topic.title}
                                        </p>
                                        <Badge variant="secondary">{topic.kindLabel}</Badge>
                                        {topic.status !== 'publish' ? (
                                            <Badge variant="outline">
                                                {topic.status === 'waiting'
                                                    ? '待审核'
                                                    : topic.status === 'rejected'
                                                      ? '已驳回'
                                                      : topic.status === 'deleted'
                                                        ? '回收站'
                                                      : topic.status}
                                            </Badge>
                                        ) : null}
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
                                    <DropdownMenu modal={false}>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={`管理 ${topic.title}`}
                                            >
                                                <MoreHorizontal aria-hidden="true" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-44">
                                            {topic.status !== 'deleted' ? (
                                                <>
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
                                                            setPendingTopicDelete(topic)
                                                        }
                                                    >
                                                        <Trash2 aria-hidden="true" />
                                                        移入回收站
                                                    </DropdownMenuItem>
                                                </>
                                            ) : (
                                                <DropdownMenuItem disabled>
                                                    <Trash2 aria-hidden="true" />
                                                    回收站帖子仅管理员可恢复
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </li>
                        ))}
                        </ul>
                        )}
                    </div>
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
                        <p className="mt-3 text-[13px] font-medium">
                            还没有加入{forumLabel}
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            在{forumTitle}发现感兴趣的话题，加入后会显示在这里。
                        </p>
                        <Button asChild variant="outline" size="sm" className="mt-4">
                            <a href={api.forum.home}>探索{forumLabel}</a>
                        </Button>
                    </div>
                ) : (
                    <div className="content-circle-groups">
                        {renderCircleGroup(`我创建的${forumLabel}`, forum.circles.created, 'created')}
                        {renderCircleGroup(`已加入的${forumLabel}`, forum.circles.joined, 'joined')}
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
            </div>

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

            <AlertDialog
                open={pendingTopicDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingTopicDelete(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除这篇帖子？</AlertDialogTitle>
                        <AlertDialogDescription>
                            《{pendingTopicDelete?.title ?? ''}》会移入回收站。普通用户只能看到标题与时间，管理员可以恢复或彻底删除。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={topicDeleting > 0}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={topicDeleting > 0}
                            onClick={(event) => {
                                event.preventDefault();
                                void removeTopic();
                            }}
                        >
                            {topicDeleting > 0 ? '删除中…' : '移入回收站'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
