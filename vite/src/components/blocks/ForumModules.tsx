import { useMemo, useState } from 'react';
import {
    ChevronRight,
    Flame,
    LockKeyhole,
    Plus,
    Search,
    Tag as TagIcon,
    TrendingUp,
} from 'lucide-react';
import UserAvatar from '../layout/UserAvatar';
import { Button } from '../ui/button';
import { navigateApp } from '../../lib/appNavigation';
import { cssUrl } from '../../lib/css';
import { Input } from '../ui/input';
import type {
    ForumAuthorsBlock,
    ForumCircleGridBlock,
    ForumCircleHeroBlock,
    ForumCircleInfoBlock,
    ForumCircleListBlock,
    ForumCreateBlock,
    ForumHomeHeaderBlock,
    ForumHotCirclesBlock,
    ForumHotTopicsBlock,
    ForumJoinGateBlock,
    ForumNoticeBlock,
    ForumStatsBlock,
    ForumTopic,
    ForumTopicListBlock,
} from '../../types';
import {
    CircleDialog,
    CircleMark,
    CircleRow,
    JoinButton,
    LoginHint,
    Panel,
    TopicList,
    openTopicEditor,
} from './ForumBlocks';

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

function requestLogin(): void {
    window.dispatchEvent(new Event('ttdf:open-auth'));
}

function useTopicFilters(topics: ForumTopic[]) {
    const [tab, setTab] = useState<'square' | 'joined' | 'created' | 'mine'>('square');
    const [filter, setFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('');
    const [query, setQuery] = useState('');

    const tagOptions = useMemo(() => {
        const counts = new Map<string, number>();
        topics.forEach((topic) => {
            topic.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
        });

        return [...counts.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, 12)
            .map(([tag]) => tag);
    }, [topics]);

    return {
        tab,
        setTab,
        filter,
        setFilter,
        tagFilter,
        setTagFilter,
        query,
        setQuery,
        tagOptions,
    };
}

export function ForumHomeHeader(props: ForumHomeHeaderBlock) {
    const { forum, stats, showStats, showCreate } = props;
    const [circleOpen, setCircleOpen] = useState(false);
    const title = props.title.trim() !== '' ? props.title : forum.title;

    return (
        <section className="surface-card p-[15px]">
            <div className="flex flex-wrap items-center gap-2">
                <h1 id="forum-home-title" className="text-[16px] font-semibold text-ink">
                    {title}
                </h1>
                {showStats ? (
                    <span className="text-[11px] text-ink-faint">
                        {stats.circles} 圈子 · {stats.topics} 帖子
                    </span>
                ) : null}
                <a
                    className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-brand"
                    href={forum.homeUrl}
                >
                    全部圈子
                    <ChevronRight className="size-3" strokeWidth={1.8} aria-hidden="true" />
                </a>
                {showCreate && forum.permissions.createCircle ? (
                    <Button
                        type="button"
                        className="h-7 rounded-[4px] px-2.5 text-[11px]"
                        onClick={() => setCircleOpen(true)}
                    >
                        <Plus className="size-3" strokeWidth={2} aria-hidden="true" />
                        {forum.copy.create.action}
                    </Button>
                ) : null}
            </div>
            <CircleDialog
                open={circleOpen}
                onOpenChange={setCircleOpen}
                forum={forum}
                onCreated={(url) => navigateApp(url)}
            />
        </section>
    );
}

export function ForumCircleGrid({ circles, limit, title }: ForumCircleGridBlock) {
    const visible = limit > 0 ? circles.slice(0, limit) : circles;

    return (
        <section className="surface-card p-[15px]">
            {title !== '' ? (
                <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
                    <h2 className="text-[14px] font-medium text-ink">{title}</h2>
                    <span className="text-[10.5px] text-ink-faint">{circles.length} 个</span>
                </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visible.map((circle) => (
                    <a
                        key={circle.id}
                        className="group flex min-w-0 items-center gap-2 rounded-[6px] border border-line bg-surface-2 px-2.5 py-2 transition-colors hover:border-brand/30 hover:bg-brand-soft"
                        href={circle.url}
                    >
                        <CircleMark circle={circle} size="size-8" />
                        <span className="min-w-0">
                            <span className="block truncate text-[12px] font-medium text-ink group-hover:text-brand">
                                {circle.name}
                            </span>
                            <span className="block text-[10px] text-ink-faint">
                                {circle.memberCount} 圈友 · {circle.topicCount} 帖子
                            </span>
                        </span>
                    </a>
                ))}
                {visible.length === 0 ? (
                    <p className="col-span-full py-2 text-[12px] text-ink-faint">
                        暂无板块，创建第一个圈子后即可发帖。
                    </p>
                ) : null}
            </div>
        </section>
    );
}

export function ForumTopicList(props: ForumTopicListBlock) {
    const {
        forum,
        circle,
        circles,
        topics,
        pager,
        stats,
        showFilters,
        showSearch,
        limit,
    } = props;
    const viewer = forum.viewer;
    const {
        tab,
        setTab,
        filter,
        setFilter,
        tagFilter,
        setTagFilter,
        query,
        setQuery,
        tagOptions,
    } = useTopicFilters(topics);
    const [circleOpen, setCircleOpen] = useState(false);
    const joinedIds = useMemo(
        () => new Set(circles.filter((item) => item.joined).map((item) => item.id)),
        [circles]
    );
    const createdIds = useMemo(
        () =>
            new Set(
                circles
                    .filter((item) => item.ownerId === viewer.uid)
                    .map((item) => item.id)
            ),
        [circles, viewer.uid]
    );

    const visible = useMemo(() => {
        let rows = topics;
        if (circle === null) {
            if (tab === 'joined') {
                rows = rows.filter((topic) => topic.circle !== null && joinedIds.has(topic.circle.id));
            } else if (tab === 'created') {
                rows = rows.filter((topic) => topic.circle !== null && createdIds.has(topic.circle.id));
            } else if (tab === 'mine') {
                rows = rows.filter((topic) => topic.author.uid === viewer.uid);
            }
        }

        if (filter === 'featured') {
            rows = rows.filter((topic) => topic.featured);
        } else if (filter === 'pinned') {
            rows = rows.filter((topic) => topic.pinned);
        } else if (filter !== 'all') {
            rows = rows.filter((topic) => topic.kind === filter);
        }

        if (tagFilter !== '') {
            rows = rows.filter((topic) => topic.tags.includes(tagFilter));
        }

        const keyword = query.trim().toLowerCase();
        if (keyword !== '') {
            rows = rows.filter(
                (topic) =>
                    topic.title.toLowerCase().includes(keyword) ||
                    topic.excerpt.toLowerCase().includes(keyword)
            );
        }

        return limit > 0 ? rows.slice(0, limit) : rows;
    }, [topics, circle, tab, filter, tagFilter, query, limit, joinedIds, createdIds, viewer.uid]);

    const createTopic = () => {
        if (!viewer.loggedIn) {
            requestLogin();
            return;
        }
        if (circle !== null) {
            openTopicEditor(forum, circle.id);
            return;
        }
        if (circles.length === 0) {
            if (forum.permissions.createCircle) {
                setCircleOpen(true);
            }
            return;
        }
        if (forum.permissions.createTopic) {
            openTopicEditor(forum);
        } else if (forum.permissions.createCircle) {
            setCircleOpen(true);
        }
    };

    const canPublish =
        forum.quickPost && viewer.loggedIn && forum.permissions.createTopic && circles.length > 0;
    const title = props.title.trim() !== '' ? props.title : circle === null ? '最新帖子' : '全部帖子';

    return (
        <section className="surface-card p-[15px]">
            <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
                <h2 className="text-[14px] font-medium text-ink">{title}</h2>
                <span className="text-[10.5px] text-ink-faint">
                    {circle === null ? `${pager.total} 条` : `${pager.total} 个帖子`}
                </span>
                {circle !== null ? (
                    <a className="ml-auto text-[11px] text-brand" href={forum.homeUrl}>
                        返回{forum.displayName}
                    </a>
                ) : null}

                {circle === null && showSearch ? (
                    <form
                        className={cx('relative', circle === null ? 'ml-auto hidden sm:block' : 'hidden')}
                        onSubmit={(event) => event.preventDefault()}
                    >
                        <Search
                            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-faint"
                            strokeWidth={1.7}
                            aria-hidden="true"
                        />
                        <Input
                            className="h-8 w-40 rounded-[4px] pl-7 text-[11.5px]"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="搜索帖子"
                            aria-label="搜索帖子"
                        />
                    </form>
                ) : null}

                {circle === null && canPublish ? (
                    <Button
                        type="button"
                        className="h-8 rounded-[4px] px-3 text-[12px]"
                        onClick={createTopic}
                    >
                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        发布新帖
                    </Button>
                ) : circle === null && viewer.loggedIn && forum.permissions.createCircle ? (
                    <Button
                        type="button"
                        className="h-8 rounded-[4px] px-3 text-[12px]"
                        onClick={() => setCircleOpen(true)}
                    >
                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        {forum.copy.create.action}
                    </Button>
                ) : circle === null && !viewer.loggedIn ? (
                    <LoginHint />
                ) : null}
            </div>

            {circle === null ? (
                <div className="flex flex-wrap items-center gap-1 border-b border-line py-2.5">
                    {[
                        ['square', '广场'],
                        ['joined', `${forum.followLabel}的圈子`],
                        ['created', '创建的圈子'],
                        ['mine', '我的帖子'],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            className={cx(
                                'h-8 rounded-[4px] px-3 text-[12.5px] transition-colors',
                                tab === key
                                    ? 'bg-brand-soft font-medium text-brand'
                                    : 'text-ink-mute hover:bg-surface-2 hover:text-ink'
                            )}
                            onClick={() => setTab(key as typeof tab)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            ) : null}

            {showFilters ? (
                <div className="flex flex-wrap items-center gap-1.5 py-3">
                    {[
                        ['all', '全部'],
                        ...forum.topicKinds.map((kind) => [kind.value, kind.label]),
                        ['featured', '精华'],
                        ['pinned', '置顶'],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            className={cx(
                                'rounded-[999px] px-3 py-1 text-[11px] transition-colors',
                                filter === key
                                    ? 'bg-brand-soft font-medium text-brand'
                                    : 'bg-surface-2 text-ink-mute hover:text-brand'
                            )}
                            onClick={() => setFilter(key as typeof filter)}
                        >
                            {label}
                        </button>
                    ))}
                    {circle === null ? (
                        <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-ink-faint">
                            <TrendingUp className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                            {stats.todayTopics} 今日新帖
                        </span>
                    ) : null}
                </div>
            ) : null}

            {tagOptions.length > 0 || tagFilter !== '' ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line py-2.5">
                    <span className="inline-flex items-center gap-1 pr-1 text-[10.5px] text-ink-faint">
                        <TagIcon className="size-3" strokeWidth={1.8} aria-hidden="true" />
                        话题
                    </span>
                    <button
                        type="button"
                        className={cx(
                            'rounded-[999px] px-2.5 py-0.5 text-[10.5px] transition-colors',
                            tagFilter === ''
                                ? 'bg-brand-soft font-medium text-brand'
                                : 'bg-surface-2 text-ink-mute hover:text-brand'
                        )}
                        onClick={() => setTagFilter('')}
                    >
                        全部
                    </button>
                    {tagOptions.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            className={cx(
                                'rounded-[999px] px-2.5 py-0.5 text-[10.5px] transition-colors',
                                tagFilter === tag
                                    ? 'bg-brand-soft font-medium text-brand'
                                    : 'bg-surface-2 text-ink-mute hover:text-brand'
                            )}
                            onClick={() => setTagFilter(tag === tagFilter ? '' : tag)}
                        >
                            #{tag}
                        </button>
                    ))}
                </div>
            ) : null}

            <TopicList
                topics={visible}
                forum={forum}
                pager={pager}
                emptyTitle={
                    tagFilter !== ''
                        ? `没有话题 #${tagFilter} 的帖子`
                        : props.emptyTitle ||
                          (circle !== null
                              ? '这个圈子还没有帖子'
                              : tab === 'mine'
                                ? '你还没有发过帖子'
                                : '这里还没有帖子')
                }
                emptyText={
                    tagFilter !== ''
                        ? '换一个话题，或者清除筛选查看全部帖子。'
                        : props.emptyText ||
                          (circle !== null
                              ? '发布第一个帖子，让板块活跃起来。'
                              : '成为第一个发帖的人，开启这个板块的讨论。')
                }
                emptyAction={
                    tagFilter !== '' ? (
                        <Button
                            type="button"
                            className="h-8 rounded-[4px]"
                            onClick={() => setTagFilter('')}
                        >
                            清除话题筛选
                        </Button>
                    ) : circle === null && canPublish ? (
                        <Button type="button" className="h-8 rounded-[4px]" onClick={createTopic}>
                            <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                            发布新帖
                        </Button>
                    ) : circle === null && viewer.loggedIn && forum.permissions.createCircle ? (
                        <Button
                            type="button"
                            className="h-8 rounded-[4px]"
                            onClick={() => setCircleOpen(true)}
                        >
                            <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                            {forum.copy.create.action}
                        </Button>
                    ) : null
                }
                onTagClick={(tag) => setTagFilter(tag)}
            />

            <CircleDialog
                open={circleOpen}
                onOpenChange={setCircleOpen}
                forum={forum}
                onCreated={(url) => navigateApp(url)}
            />
        </section>
    );
}

export function ForumCreate(props: ForumCreateBlock) {
    const { forum } = props;
    const [circleOpen, setCircleOpen] = useState(false);
    const title = props.title.trim() !== '' ? props.title : forum.copy.create.title;
    const text = props.text.trim() !== '' ? props.text : forum.copy.create.text;

    return (
        <>
            <section className="forum-create-card overflow-hidden rounded-[8px] p-[18px] text-white shadow-card">
                <p className="text-[10px] font-medium tracking-[0.16em] text-white/65 uppercase">Create</p>
                <h2 className="mt-1 text-[18px] font-semibold leading-6">{title}</h2>
                {text !== '' ? (
                    <p className="mt-2 whitespace-pre-line text-[11.5px] leading-5 text-white/75">
                        {text}
                    </p>
                ) : null}
                {forum.permissions.createCircle ? (
                    <Button
                        type="button"
                        className="mt-3 h-8 rounded-[4px] bg-white px-3 text-[12px] text-[#17356f] hover:bg-white/90"
                        onClick={() => setCircleOpen(true)}
                    >
                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        {forum.copy.create.action}
                    </Button>
                ) : (
                    <p className="mt-3 text-[10.5px] leading-5 text-white/60">
                        当前仅管理员可以创建圈子。
                    </p>
                )}
            </section>
            <CircleDialog
                open={circleOpen}
                onOpenChange={setCircleOpen}
                forum={forum}
                onCreated={(url) => navigateApp(url)}
            />
        </>
    );
}

export function ForumCircleList({ circles, limit, title }: ForumCircleListBlock) {
    const visible = limit > 0 ? circles.slice(0, limit) : circles;

    return (
        <Panel title={title || '推荐圈子'} aside={<span>{circles.length} 个</span>}>
            {visible.length > 0 ? (
                <div className="grid gap-0.5">
                    {visible.map((circle) => (
                        <CircleRow key={circle.id} circle={circle} />
                    ))}
                </div>
            ) : (
                <p className="py-2 text-[11.5px] leading-5 text-ink-faint">
                    还没有圈子，等待管理员创建第一个板块。
                </p>
            )}
        </Panel>
    );
}

export function ForumNotice({ forum, title }: ForumNoticeBlock) {
    if (forum.notice === '') {
        return null;
    }

    return (
        <Panel title={title || '社区公告'}>
            <p className="whitespace-pre-line text-[11.5px] leading-6 text-ink-mute">{forum.notice}</p>
        </Panel>
    );
}

export function ForumAuthors({ authors, limit, title }: ForumAuthorsBlock) {
    if (authors.length === 0) {
        return null;
    }

    const visible = authors.slice(0, limit);

    return (
        <Panel title={title || '活跃排行'}>
            <ol className="grid gap-2">
                {visible.map((item, index) => (
                    <li key={item.user.uid} className="flex items-center gap-2 text-[11.5px]">
                        <span
                            className={cx(
                                'grid size-5 shrink-0 place-items-center rounded-[4px] text-[10px] font-semibold',
                                index < 3 ? 'bg-brand-soft text-brand' : 'bg-surface-2 text-ink-faint'
                            )}
                        >
                            {index + 1}
                        </span>
                        <UserAvatar
                            name={item.user.screenName || item.user.name}
                            avatar={item.user.avatar}
                            className="size-5"
                        />
                        <span className="min-w-0 flex-1 truncate text-ink-mute">
                            {item.user.screenName || item.user.name}
                        </span>
                        <span className="text-[10px] text-ink-faint">{item.topics} 帖</span>
                    </li>
                ))}
            </ol>
        </Panel>
    );
}

export function ForumJoinGate({ forum, circle, title, text }: ForumJoinGateBlock) {
    return (
        <section className="surface-card overflow-hidden">
            <div className="forum-join-gate">
                <span className="forum-join-gate-icon" aria-hidden="true">
                    <LockKeyhole className="size-6" strokeWidth={1.7} />
                </span>
                <div className="min-w-0">
                    <h1 className="text-[19px] font-medium leading-[1.45] text-ink">{title}</h1>
                    <p className="mt-1.5 max-w-2xl text-[12.5px] leading-[1.7] text-ink-mute">{text}</p>
                </div>
                <div className="forum-join-gate-actions">
                    <JoinButton forum={forum} circle={circle} />
                    <a className="text-[11.5px] text-ink-faint hover:text-brand" href={forum.homeUrl}>
                        返回{forum.displayName}
                    </a>
                </div>
            </div>
        </section>
    );
}

export function ForumCircleInfo({ forum, circle, title }: ForumCircleInfoBlock) {
    return (
        <Panel title={title || '关于圈子'}>
            <div className="flex items-start gap-3">
                <CircleMark circle={circle} size="size-14" />
                <div className="min-w-0 flex-1">
                    <h2
                        id="forum-circle-title"
                        className="truncate text-[16px] font-semibold leading-6 text-ink"
                    >
                        {circle.name}
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-faint">
                        {circle.memberCount} 位圈友 · {circle.topicCount} 个帖子
                    </p>
                </div>
            </div>
            <p className="mt-3 whitespace-pre-line text-[12px] leading-6 text-ink-mute">
                {circle.description || '这个圈子还没有填写简介。'}
            </p>
            <div className="mt-3">
                <JoinButton forum={forum} circle={circle} />
            </div>
        </Panel>
    );
}

export function ForumCircleHero({ forum, circle }: ForumCircleHeroBlock) {
    const viewer = forum.viewer;

    return (
        <section className="surface-card overflow-hidden">
            <div
                className="forum-circle-banner flex items-center gap-3 px-[18px] py-5 text-white"
                style={
                    circle.background !== ''
                        ? {
                              backgroundImage: `linear-gradient(100deg, rgba(8, 15, 30, 0.82), rgba(8, 15, 30, 0.38)), ${cssUrl(circle.background)}`,
                          }
                        : undefined
                }
            >
                <CircleMark circle={circle} size="size-12" />
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium tracking-[0.16em] text-white/60 uppercase">
                        Circle / Board
                    </p>
                    <h1 className="mt-0.5 truncate text-[20px] font-semibold leading-7">{circle.name}</h1>
                    <p className="mt-0.5 truncate text-[11.5px] text-white/70">
                        {circle.description || `${circle.topicCount} 个帖子正在等待你的参与`}
                    </p>
                </div>
                {viewer.loggedIn && forum.permissions.createTopic ? (
                    <Button
                        type="button"
                        className="h-8 shrink-0 rounded-[4px] bg-white px-3 text-[12px] text-[#17356f] hover:bg-white/90"
                        onClick={() => openTopicEditor(forum, circle.id)}
                    >
                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        发布新帖
                    </Button>
                ) : viewer.loggedIn ? (
                    <span className="shrink-0 text-[11px] text-white/65">暂无发帖权限</span>
                ) : (
                    <LoginHint />
                )}
            </div>
        </section>
    );
}

export function ForumStats({ stats, circle, showCircle, title }: ForumStatsBlock) {
    const items: Array<[string, number]> =
        circle !== null && showCircle
            ? [
                ['帖子', circle.topicCount],
                ['圈友', circle.memberCount],
                ['全站帖子', stats.topics],
                ['全站回复', stats.replies],
            ]
            : [
                ['帖子', stats.topics],
                ['回复', stats.replies],
                ['圈子', stats.circles],
                ['圈友', stats.members],
            ];

    return (
        <Panel title={title || '圈子数据'}>
            <div className="grid grid-cols-2 gap-2">
                {items.map(([label, value]) => (
                    <div key={label} className="rounded-[6px] bg-surface-2 px-3 py-2">
                        <p className="text-[17px] font-semibold leading-6 text-ink">{value}</p>
                        <p className="text-[10.5px] text-ink-faint">{label}</p>
                    </div>
                ))}
            </div>
        </Panel>
    );
}

export function ForumHotCircles({ circles, limit, title }: ForumHotCirclesBlock) {
    return (
        <Panel title={title || '热门圈子'}>
            <div className="grid gap-0.5">
                {circles.slice(0, limit).map((circle) => (
                    <CircleRow key={circle.id} circle={circle} />
                ))}
            </div>
        </Panel>
    );
}

export function ForumHotTopics({ topics, limit, title }: ForumHotTopicsBlock) {
    return (
        <Panel title={title || '热门帖子'}>
            <ul className="grid gap-2">
                {topics.slice(0, limit).map((topic) => (
                    <li key={topic.id} className="min-w-0">
                        <a
                            className="group flex items-start gap-2 text-[12.5px] leading-[1.6] text-ink-mute hover:text-brand"
                            href={topic.url}
                        >
                            <Flame
                                className="mt-0.5 size-3.5 shrink-0 text-[#e86b3a]"
                                strokeWidth={1.7}
                                aria-hidden="true"
                            />
                            <span className="line-clamp-2">{topic.title}</span>
                        </a>
                        <p className="mt-0.5 pl-[22px] text-[10.5px] text-ink-faint">
                            {topic.views} 浏览 · {topic.comments} 回复
                        </p>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}
