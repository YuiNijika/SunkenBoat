import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
    ArrowUpRight,
    BadgeCheck,
    Ban,
    Bookmark,
    Check,
    ChevronRight,
    CircleDot,
    Clock3,
    Eye,
    Flag,
    Flame,
    Hash,
    ImagePlus,
    Layers3,
    LoaderCircle,
    MessageCircle,
    MessageSquareText,
    MoreHorizontal,
    Pencil,
    Pin,
    Plus,
    Search,
    Share2,
    Star,
    Tag as TagIcon,
    ThumbsUp,
    TrendingUp,
    Trash2,
    UserPlus,
    Users,
} from 'lucide-react';
import {
    CommentComposer,
    CommentEmpty,
    CommentEntry,
    CommentSection,
} from '../content/CommentSection';
import type { CommentSortOrder } from '../content/CommentSection';
import MediaLibrary from '../content/MediaLibrary';
import DownloadCard from '../content/DownloadCard';
import ShareSheet from '../content/ShareSheet';
import UserAvatar from '../layout/UserAvatar';
import BreadcrumbsBlock from './BreadcrumbsBlock';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';
import { cssUrl } from '../../lib/css';
import type {
    ForumCircle,
    ForumCircleBlock,
    ForumConfig,
    ForumHomeBlock,
    ForumRater,
    ForumReply,
    ForumTopic,
    ForumTopicBlock,
    MediaItem,
} from '../../types';
import {
    flashNotify,
    notifyError,
    notifySuccess,
} from '../../lib/notify';
import { navigateApp, refreshApp } from '../../lib/appNavigation';

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

function mediaFileName(value: string): string {
    if (value === '') {
        return '';
    }

    try {
        const url = new URL(value, window.location.href);
        const filename = decodeURIComponent(
            url.pathname.split('/').filter(Boolean).pop() || ''
        );
        return filename || url.hostname;
    } catch {
        return value.split(/[?#]/)[0].split('/').filter(Boolean).pop() || value;
    }
}

function requestLogin(): void {
    window.dispatchEvent(new Event('ttdf:open-auth'));
}

async function forumRequest<T>(endpoint: string, nonce: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Typecho-Token': nonce,
        },
        body: JSON.stringify(body),
    });

    let payload: { message?: string; data?: unknown } = {};
    try {
        payload = (await response.json()) as { message?: string; data?: unknown };
    } catch {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload.message || '操作失败，请稍后再试。');
    }

    return (payload.data ?? payload) as T;
}

export function openTopicEditor(forum: ForumConfig, circleId = 0, topicId = 0): void {
    if (!forum.viewer.loggedIn) {
        requestLogin();
        return;
    }
    if (topicId <= 0 && !forum.permissions.createTopic) {
        return;
    }

    const url = new URL(forum.editorUrl, window.location.href);
    url.searchParams.set('type', 'forum-topic');
    if (topicId > 0) {
        url.searchParams.set('id', String(topicId));
    } else if (circleId > 0) {
        url.searchParams.set('circle', String(circleId));
    }
    navigateApp(url.toString());
}

function insertText(
    textarea: HTMLTextAreaElement | null,
    setValue: (value: string) => void,
    snippet: string
): void {
    if (!textarea) {
        setValue(snippet);
        return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const next = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
    setValue(next);
    window.requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + snippet.length;
        textarea.setSelectionRange(cursor, cursor);
    });
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error && reason.message !== '' ? reason.message : '操作失败，请稍后再试。';
}

export function Panel({
    title,
    aside,
    children,
    className = '',
}: {
    title: string;
    aside?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={cx('surface-card gap-0 p-[15px]', className)}>
            <div className="relative mb-3 flex items-center gap-2 pb-2">
                <h2 className="text-[15px] font-medium leading-6 text-ink">{title}</h2>
                {aside ? <div className="ml-auto text-[11px] text-ink-faint">{aside}</div> : null}
                <span
                    className="absolute bottom-[3px] left-0 h-[3px] w-10 rounded-[5px] bg-brand shadow-[1px_1px_3px_-1px_var(--accent)]"
                    aria-hidden="true"
                />
            </div>
            {children}
        </section>
    );
}

export function CircleMark({ circle, size = 'size-11' }: { circle: ForumCircle; size?: string }) {
    if (circle.icon !== '') {
        return (
            <span className={cx('block shrink-0 overflow-hidden rounded-[10px] bg-surface-3', size)}>
                <img className="size-full object-cover" src={circle.icon} alt="" loading="lazy" />
            </span>
        );
    }

    return (
        <span
            className={cx(
                'grid shrink-0 place-items-center rounded-[10px] bg-brand-soft text-[17px] font-semibold text-brand',
                size
            )}
            aria-hidden="true"
        >
            {(circle.name || '圈').slice(0, 1)}
        </span>
    );
}

export function CircleRow({ circle, followLabel = '关注' }: { circle: ForumCircle; followLabel?: string }) {
    return (
        <a
            className="group flex min-w-0 items-center gap-2.5 rounded-[6px] px-1.5 py-2 transition-colors hover:bg-surface-2"
            href={circle.url}
        >
            <CircleMark circle={circle} size="size-9" />
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-ink group-hover:text-brand">
                        {circle.name}
                    </span>
                    {circle.joined ? (
                        <span className="shrink-0 text-[10px] text-brand">已{followLabel}</span>
                    ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[10.5px] text-ink-faint">
                    {circle.memberCount} 位圈友 · {circle.topicCount} 个帖子
                </span>
            </span>
            <ChevronRight className="size-3.5 shrink-0 text-ink-faint" strokeWidth={1.7} aria-hidden="true" />
        </a>
    );
}

function TopicThumb({ topic }: { topic: ForumTopic }) {
    if (topic.thumbnail === '') {
        return null;
    }

    return (
        <span className="block h-[68px] w-[92px] shrink-0 overflow-hidden rounded-[7px] bg-surface-3">
            <img
                className="size-full object-cover"
                src={topic.thumbnail}
                alt=""
                loading="lazy"
                decoding="async"
            />
        </span>
    );
}

function TopicRow({
    topic,
    forum,
    onTagClick,
}: {
    topic: ForumTopic;
    forum?: ForumConfig;
    onTagClick?: (tag: string) => void;
}) {
    const author = topic.author;
    const canManage =
        forum !== undefined
        && forum.viewer.loggedIn
        && (forum.permissions.moderate || forum.viewer.uid === author.uid);

    return (
        <article className="group relative border-b border-line px-1 py-3.5 last:border-b-0">
            <div className="flex min-w-0 gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {topic.pinned ? (
                            <Badge className="rounded-[3px] border-0 bg-[rgba(229,72,77,0.1)] px-1.5 py-0 text-[10px] font-normal text-[#d94848]">
                                置顶
                            </Badge>
                        ) : null}
                        {topic.featured ? (
                            <Badge className="rounded-[3px] border-0 bg-[rgba(245,158,11,0.12)] px-1.5 py-0 text-[10px] font-normal text-[#b45309]">
                                精华
                            </Badge>
                        ) : null}
                        <Badge variant="secondary" className="rounded-[3px] border-0 bg-surface-2 px-1.5 py-0 text-[10px] font-normal text-ink-mute">
                            {topic.kindLabel}
                        </Badge>
                        {topic.circle ? (
                            <a
                                className="inline-flex items-center gap-0.5 text-[10.5px] text-ink-faint hover:text-brand"
                                href={topic.circle.url}
                            >
                                <Hash className="size-2.5" strokeWidth={2} aria-hidden="true" />
                                {topic.circle.name}
                            </a>
                        ) : null}
                    </div>

                    <h3 className="mt-1.5 text-[15px] font-medium leading-[1.5] text-ink">
                        <a className="transition-colors group-hover:text-brand" href={topic.url}>
                            {topic.title}
                        </a>
                    </h3>

                    {topic.excerpt !== '' ? (
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.7] text-ink-mute">
                            {topic.excerpt}
                        </p>
                    ) : null}

                    {topic.tags.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {topic.tags.map((tag) => (
                                <button
                                    key={tag}
                                    type="button"
                                    className="inline-flex items-center gap-0.5 rounded-[3px] bg-brand-soft/70 px-1.5 py-0.5 text-[10px] text-brand"
                                    onClick={() => onTagClick?.(tag)}
                                >
                                    <TagIcon className="size-2.5" strokeWidth={2} aria-hidden="true" />
                                    {tag}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                        <span className="inline-flex items-center gap-1.5">
                            <UserAvatar
                                name={author.screenName || author.name}
                                avatar={author.avatar}
                                className="size-5"
                            />
                            <span className="text-ink-mute">{author.screenName || author.name}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock3 className="size-3" strokeWidth={1.7} aria-hidden="true" />
                            {topic.createdText}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Eye className="size-3" strokeWidth={1.7} aria-hidden="true" />
                            {topic.views}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <ThumbsUp className="size-3" strokeWidth={1.7} aria-hidden="true" />
                            {topic.likes}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Star className="size-3" strokeWidth={1.7} aria-hidden="true" />
                            {topic.ratingCount > 0 ? topic.ratingAverage.toFixed(1) : '—'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <MessageCircle className="size-3" strokeWidth={1.7} aria-hidden="true" />
                            {topic.comments}
                        </span>
                        {canManage && forum ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-0.5 text-ink-faint hover:text-brand"
                                onClick={() =>
                                    openTopicEditor(forum, topic.circle?.id ?? 0, topic.id)
                                }
                            >
                                <Pencil className="size-3" strokeWidth={1.8} aria-hidden="true" />
                                编辑
                            </button>
                        ) : null}
                        <a className="ml-auto inline-flex items-center gap-0.5 text-brand" href={topic.url}>
                            参与讨论
                            <ArrowUpRight className="size-3" strokeWidth={1.8} aria-hidden="true" />
                        </a>
                    </div>
                </div>

                <TopicThumb topic={topic} />
            </div>
        </article>
    );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
    return (
        <div className="grid place-items-center rounded-[8px] border border-dashed border-line px-6 py-12 text-center">
            <Layers3 className="size-9 text-ink-faint" strokeWidth={1.2} aria-hidden="true" />
            <p className="mt-3 text-[14px] font-medium text-ink">{title}</p>
            <p className="mt-1 max-w-md text-[12px] leading-6 text-ink-mute">{text}</p>
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}

export function LoginHint({ text = '登录后即可参与圈子讨论。' }: { text?: string }) {
    return (
        <Button type="button" variant="secondary" className="h-8 rounded-[4px]" onClick={requestLogin}>
            登录后参与
            <span className="sr-only">{text}</span>
        </Button>
    );
}

interface CircleDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    forum: ForumConfig;
    onCreated: (url: string) => void;
    circle?: ForumCircle | null;
    onUpdated?: () => void;
}

export function CircleDialog({
    open,
    onOpenChange,
    forum,
    onCreated,
    circle = null,
    onUpdated,
}: CircleDialogProps) {
    const editing = Boolean(circle && circle.id > 0);
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [icon, setIcon] = useState('');
    const [background, setBackground] = useState('');
    const [mediaTarget, setMediaTarget] = useState<'icon' | 'background' | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setName(circle?.name ?? '');
        setSlug(circle?.slug ?? '');
        setDescription(circle?.description ?? '');
        setIcon(circle?.icon ?? '');
        setBackground(circle?.background ?? '');
        setMediaTarget(null);
        setBusy(false);
    }, [open, circle]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) {
            return;
        }

        setBusy(true);
        try {
            const endpoint = editing ? forum.endpoints.circleUpdate : forum.endpoints.circleCreate;
            const result = await forumRequest<{ url: string }>(endpoint, forum.nonce, {
                id: circle?.id ?? 0,
                name,
                slug,
                description,
                icon,
                background,
            });
            if (editing) {
                flashNotify('success', `圈子「${name.trim()}」已更新。`);
                onUpdated?.();
                onOpenChange(false);
            } else {
                flashNotify('success', `圈子「${name.trim()}」已创建。`);
                onCreated(result.url);
            }
        } catch (reason) {
            notifyError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain border-line bg-surface sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{editing ? '编辑圈子' : forum.copy.create.action}</DialogTitle>
                    <DialogDescription>
                        {editing
                            ? '修改圈子名称、图标与背景，保存后会同步到圈子广场和帖子侧栏。'
                            : forum.copy.create.hint}
                    </DialogDescription>
                </DialogHeader>

                <form className="grid min-w-0 gap-3" onSubmit={submit}>
                    <label className="grid gap-1.5 text-[12px] text-ink-mute">
                        名称
                        <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required />
                    </label>
                    <label className="grid gap-1.5 text-[12px] text-ink-mute">
                        Slug（可选）
                        <Input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={64} />
                    </label>
                    <label className="grid gap-1.5 text-[12px] text-ink-mute">
                        简介
                        <Textarea
                            className="min-h-[88px]"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            maxLength={200}
                        />
                    </label>
                    <div className="grid min-w-0 gap-2 text-[12px] text-ink-mute">
                        <span>圈子图标（可选）</span>
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-[6px] border border-line bg-surface-2 p-2.5">
                            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-surface-3">
                                {icon !== '' ? (
                                    <img className="size-full object-cover" src={icon} alt="" />
                                ) : (
                                    <ImagePlus className="size-5 text-ink-faint" strokeWidth={1.6} aria-hidden="true" />
                                )}
                            </span>
                            <div className="min-w-0 flex-1 basis-40">
                                <p
                                    className="truncate text-[11.5px] text-ink-mute"
                                    title={icon || undefined}
                                >
                                    {icon !== ''
                                        ? mediaFileName(icon)
                                        : '从媒体库选择一张图片作为圈子图标'}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-[10.5px] text-ink-faint">
                                    {forum.canUseMedia
                                        ? '支持选择或上传图片。'
                                        : '当前账号没有媒体库权限，可暂不设置图标。'}
                                </p>
                            </div>
                            <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">
                                {icon !== '' ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() => setIcon('')}
                                    >
                                        移除
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-7 px-2 text-[11px]"
                                    disabled={!forum.canUseMedia}
                                    onClick={() => setMediaTarget('icon')}
                                >
                                    <ImagePlus className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                    媒体库
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="grid min-w-0 gap-2 text-[12px] text-ink-mute">
                        <span>圈子背景（可选）</span>
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-[6px] border border-line bg-surface-2 p-2.5">
                            <span
                                className="forum-circle-cover grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-surface-3"
                                style={
                                    background !== ''
                                        ? {
                                              backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.12), rgba(15, 23, 42, 0.48)), ${cssUrl(background)}`,
                                          }
                                        : undefined
                                }
                            >
                                {background === '' ? (
                                    <ImagePlus className="size-5 text-ink-faint" strokeWidth={1.6} aria-hidden="true" />
                                ) : null}
                            </span>
                            <div className="min-w-0 flex-1 basis-40">
                                <p
                                    className="truncate text-[11.5px] text-ink-mute"
                                    title={background || undefined}
                                >
                                    {background !== ''
                                        ? mediaFileName(background)
                                        : '用于帖子侧栏和圈子横幅的背景图'}
                                </p>
                                <p className="mt-0.5 line-clamp-2 text-[10.5px] text-ink-faint">
                                    建议使用横向图片，系统会自动裁切并叠加暗色遮罩。
                                </p>
                            </div>
                            <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-1 sm:w-auto">
                                {background !== '' ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="h-7 px-2 text-[11px]"
                                        onClick={() => setBackground('')}
                                    >
                                        移除
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="h-7 px-2 text-[11px]"
                                    disabled={!forum.canUseMedia}
                                    onClick={() => setMediaTarget('background')}
                                >
                                    <ImagePlus className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                    媒体库
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={busy || name.trim() === ''}>
                            {busy ? '保存中…' : editing ? '保存圈子' : forum.copy.create.action}
                        </Button>
                    </div>
                </form>
                <MediaLibrary
                    open={mediaTarget !== null}
                    onOpenChange={(next) => setMediaTarget(next ? mediaTarget : null)}
                    mediaEndpoint={forum.mediaEndpoint}
                    uploadPurpose={mediaTarget === 'background' ? 'background' : 'topic'}
                    onSelect={(item) => {
                        if (mediaTarget === 'background') {
                            setBackground(item.url);
                        } else {
                            setIcon(item.url);
                        }
                        setMediaTarget(null);
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}

export function JoinButton({ forum, circle }: { forum: ForumConfig; circle: ForumCircle }) {
    const [joined, setJoined] = useState(circle.joined);
    const [count, setCount] = useState(circle.memberCount);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setJoined(circle.joined);
        setCount(circle.memberCount);
    }, [circle.joined, circle.memberCount, circle.id]);

    if (!forum.permissions.join) {
        return null;
    }

    const toggle = async () => {
        if (!forum.viewer.loggedIn) {
            requestLogin();
            return;
        }
        if (busy) {
            return;
        }

        setBusy(true);
        try {
            const result = await forumRequest<{ joined: boolean; memberCount: number }>(
                forum.endpoints.join,
                forum.nonce,
                { circle_id: circle.id }
            );
            setJoined(result.joined);
            setCount(result.memberCount);
            notifySuccess(
                result.joined
                    ? `${forum.followLabel}成功。`
                    : `已取消${forum.followLabel}。`
            );
        } catch (reason) {
            notifyError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-1">
            <Button
                type="button"
                variant={joined ? 'secondary' : 'default'}
                className="h-8 rounded-[4px] px-3 text-[12px]"
                disabled={busy}
                onClick={() => void toggle()}
            >
                <Users className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                {busy ? '处理中…' : joined ? `已${forum.followLabel}` : `${forum.followLabel}圈子`}
                <span className="ml-1 text-[10px] opacity-70">{count}</span>
            </Button>
        </div>
    );
}

export function TopicList({
    topics,
    forum,
    pager,
    emptyTitle,
    emptyText,
    emptyAction,
    onTagClick,
}: {
    topics: ForumTopic[];
    forum?: ForumConfig;
    pager?: { hasMore: boolean; nextUrl: string; total: number };
    emptyTitle: string;
    emptyText: string;
    emptyAction?: ReactNode;
    onTagClick?: (tag: string) => void;
}) {
    if (topics.length === 0) {
        return <EmptyState title={emptyTitle} text={emptyText} action={emptyAction} />;
    }

    return (
        <div>
            {topics.map((topic) => (
                <TopicRow
                    key={topic.id}
                    topic={topic}
                    forum={forum}
                    onTagClick={onTagClick}
                />
            ))}
            {pager?.hasMore && pager.nextUrl !== '' ? (
                <div className="pt-4">
                    <a
                        className="flex h-9 items-center justify-center rounded-[5px] bg-surface-2 text-[12px] text-ink-mute transition-colors hover:bg-brand-soft hover:text-brand"
                        href={pager.nextUrl}
                    >
                        加载更多
                        <span className="ml-1 text-[10px] text-ink-faint">共 {pager.total} 条</span>
                    </a>
                </div>
            ) : null}
        </div>
    );
}

function SidebarHot({
    hotCircles,
    hotTopics,
    followLabel = '关注',
}: {
    hotCircles: ForumCircle[];
    hotTopics: ForumTopic[];
    followLabel?: string;
}) {
    return (
        <div className="grid gap-[15px]">
            <Panel title="热门圈子">
                <div className="grid gap-0.5">
                    {hotCircles.slice(0, 6).map((circle) => (
                        <CircleRow key={circle.id} circle={circle} followLabel={followLabel} />
                    ))}
                </div>
            </Panel>

            <Panel title="热门帖子">
                <ul className="grid gap-2">
                    {hotTopics.slice(0, 6).map((topic) => (
                        <li key={topic.id} className="min-w-0">
                            <a
                                className="group flex items-start gap-2 text-[12.5px] leading-[1.6] text-ink-mute hover:text-brand"
                                href={topic.url}
                            >
                                <Flame className="mt-0.5 size-3.5 shrink-0 text-[#e86b3a]" strokeWidth={1.7} aria-hidden="true" />
                                <span className="line-clamp-2">{topic.title}</span>
                            </a>
                            <p className="mt-0.5 pl-[22px] text-[10.5px] text-ink-faint">
                                {topic.views} 浏览 · {topic.comments} 回复
                            </p>
                        </li>
                    ))}
                </ul>
            </Panel>
        </div>
    );
}

function HotTopicList({ topics, empty }: { topics: ForumTopic[]; empty: string }) {
    if (topics.length === 0) {
        return <p className="px-1 py-5 text-center text-[11px] text-ink-faint">{empty}</p>;
    }

    return (
        <ol className="grid gap-0.5">
            {topics.slice(0, 8).map((topic, index) => (
                <li key={topic.id} className="min-w-0">
                    <a
                        className="group flex items-start gap-2 rounded-[5px] px-1.5 py-1.5 transition-colors hover:bg-surface-2"
                        href={topic.url}
                    >
                        <span
                            className={cx(
                                'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-[4px] text-[9.5px] font-bold leading-none',
                                index === 0
                                    ? 'bg-[#ff5c8a] text-white'
                                    : index === 1
                                      ? 'bg-[#ff9f43] text-white'
                                      : index === 2
                                        ? 'bg-[#f7c948] text-[#5a4300]'
                                        : 'bg-surface-2 text-ink-faint'
                            )}
                        >
                            {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-[12px] leading-[1.55] text-ink-soft group-hover:text-brand">
                                {topic.title}
                            </span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-faint">
                                <span>{topic.views} 浏览</span>
                                <span>{topic.comments} 回复</span>
                            </span>
                        </span>
                    </a>
                </li>
            ))}
        </ol>
    );
}

export function ForumHomeBlock({
    forum,
    circles,
    topics,
    pager,
    hotCircles,
    hotTopics,
    stats,
    authors,
}: ForumHomeBlock) {
    const [tab, setTab] = useState<'square' | 'joined' | 'created' | 'mine'>('square');
    const [filter, setFilter] = useState('all');
    const [tagFilter, setTagFilter] = useState('');
    const [query, setQuery] = useState('');
    const [circleOpen, setCircleOpen] = useState(false);
    const viewer = forum.viewer;
    const joinedIds = useMemo(
        () => new Set(circles.filter((circle) => circle.joined).map((circle) => circle.id)),
        [circles]
    );
    const createdIds = useMemo(
        () => new Set(circles.filter((circle) => circle.ownerId === viewer.uid).map((circle) => circle.id)),
        [circles, viewer.uid]
    );
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

    const visible = useMemo(() => {
        let rows = topics;
        if (tab === 'joined') {
            rows = rows.filter((topic) => topic.circle !== null && joinedIds.has(topic.circle.id));
        } else if (tab === 'created') {
            rows = rows.filter((topic) => topic.circle !== null && createdIds.has(topic.circle.id));
        } else if (tab === 'mine') {
            rows = rows.filter((topic) => topic.author.uid === viewer.uid);
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

        return rows;
    }, [topics, tab, filter, tagFilter, query, joinedIds, createdIds, viewer.uid]);

    const createTopic = () => {
        if (!viewer.loggedIn) {
            requestLogin();
            return;
        }
        if (circles.length === 0) {
            if (forum.permissions.createCircle) {
                setCircleOpen(true);
            }
            return;
        }
        if (!forum.permissions.createTopic) {
            return;
        }
        openTopicEditor(forum);
    };

    const canPublish =
        forum.quickPost && viewer.loggedIn && forum.permissions.createTopic && circles.length > 0;

    return (
        <section className="forum-page" aria-labelledby="forum-home-title">
            <div className="grid gap-[15px] lg:grid-cols-[var(--forum-left-width)_minmax(0,1fr)_var(--forum-right-width)]">
                <aside className="order-2 grid content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:order-1 lg:self-start">
                    <section className="forum-create-card overflow-hidden rounded-[8px] p-[18px] text-white shadow-card">
                        <p className="text-[10px] font-medium tracking-[0.16em] text-white/65 uppercase">Create</p>
                        <h2 className="mt-1 text-[18px] font-semibold leading-6">
                            {forum.copy.create.title}
                        </h2>
                        {forum.copy.create.text !== '' ? (
                            <p className="mt-2 whitespace-pre-line text-[11.5px] leading-5 text-white/75">
                                {forum.copy.create.text}
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

                    <Panel title="推荐圈子" aside={<span>{circles.length} 个</span>}>
                        {circles.length > 0 ? (
                            <div className="grid gap-0.5">
                                {circles.slice(0, 8).map((circle) => (
                                    <CircleRow key={circle.id} circle={circle} followLabel={forum.followLabel} />
                                ))}
                            </div>
                        ) : (
                            <p className="py-2 text-[11.5px] leading-5 text-ink-faint">
                                还没有圈子，等待管理员创建第一个板块。
                            </p>
                        )}
                    </Panel>

                    {forum.notice !== '' ? (
                        <Panel title="社区公告">
                            <p className="whitespace-pre-line text-[11.5px] leading-6 text-ink-mute">{forum.notice}</p>
                        </Panel>
                    ) : null}

                    {authors.length > 0 ? (
                        <Panel title="活跃排行">
                            <ol className="grid gap-2">
                                {authors.map((item, index) => (
                                    <li key={item.user.uid} className="flex items-center gap-2 text-[11.5px]">
                                        <span
                                            className={cx(
                                                'grid size-5 shrink-0 place-items-center rounded-[4px] text-[10px] font-semibold',
                                                index < 3
                                                    ? 'bg-brand-soft text-brand'
                                                    : 'bg-surface-2 text-ink-faint'
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
                    ) : null}
                </aside>

                <div className="order-1 min-w-0 lg:order-2">
                    <div className="surface-card mb-[15px] p-[15px]">
                        <div className="mb-3 flex items-center gap-2">
                            <h1 id="forum-home-title" className="text-[16px] font-semibold text-ink">
                                {forum.title}
                            </h1>
                            <span className="text-[11px] text-ink-faint">
                                {stats.circles} 圈子 · {stats.topics} 帖子
                            </span>
                            <a className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-brand" href={forum.homeUrl}>
                                全部圈子
                                <ChevronRight className="size-3" strokeWidth={1.8} aria-hidden="true" />
                            </a>
                            {forum.permissions.createCircle ? (
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

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {circles.slice(0, 6).map((circle) => (
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
                            {circles.length === 0 ? (
                                <p className="col-span-full py-2 text-[12px] text-ink-faint">
                                    暂无板块，创建第一个圈子后即可发帖。
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="surface-card mb-[15px] p-[15px]">
                        <div className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
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

                            <div className="ml-auto flex items-center gap-1">
                                <form
                                    className="relative hidden sm:block"
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
                                {canPublish ? (
                                    <Button type="button" className="h-8 rounded-[4px] px-3 text-[12px]" onClick={createTopic}>
                                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                        发布新帖
                                    </Button>
                                ) : viewer.loggedIn && circles.length === 0 && forum.permissions.createCircle ? (
                                    <Button
                                        type="button"
                                        className="h-8 rounded-[4px] px-3 text-[12px]"
                                        onClick={() => setCircleOpen(true)}
                                    >
                                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                        {forum.copy.create.action}
                                    </Button>
                                ) : (
                                    viewer.loggedIn ? null : <LoginHint />
                                )}
                            </div>
                        </div>

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
                            <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-ink-faint">
                                <TrendingUp className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                                {stats.todayTopics} 今日新帖
                            </span>
                        </div>

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
                                    : tab === 'mine'
                                      ? '你还没有发过帖子'
                                      : '这里还没有帖子'
                            }
                            emptyText={
                                tagFilter !== ''
                                    ? '换一个话题，或者清除筛选查看全部帖子。'
                                    : tab === 'mine'
                                    ? '选择一个圈子，把你的想法分享出来。'
                                    : '成为第一个发帖的人，开启这个板块的讨论。'
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
                                ) : canPublish ? (
                                    <Button type="button" className="h-8 rounded-[4px]" onClick={createTopic}>
                                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                        发布新帖
                                    </Button>
                                ) : viewer.loggedIn && circles.length === 0 && forum.permissions.createCircle ? (
                                    <Button type="button" className="h-8 rounded-[4px]" onClick={() => setCircleOpen(true)}>
                                        <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                        {forum.copy.create.action}
                                    </Button>
                                ) : null
                            }
                            onTagClick={(tag) => setTagFilter(tag)}
                        />
                    </div>
                </div>

                <aside className="order-3 grid content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
                    <Panel title="圈子数据">
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                ['帖子', stats.topics],
                                ['回复', stats.replies],
                                ['圈子', stats.circles],
                                ['圈友', stats.members],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-[6px] bg-surface-2 px-3 py-2">
                                    <p className="text-[17px] font-semibold leading-6 text-ink">{value}</p>
                                    <p className="text-[10.5px] text-ink-faint">{label}</p>
                                </div>
                            ))}
                        </div>
                    </Panel>
                    <SidebarHot
                        hotCircles={hotCircles}
                        hotTopics={hotTopics}
                        followLabel={forum.followLabel}
                    />
                </aside>
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

export function ForumCircleBlock({
    forum,
    circle,
    topics,
    pager,
    hotCircles,
    hotTopics,
    stats,
}: ForumCircleBlock) {
    const viewer = forum.viewer;
    const [tagFilter, setTagFilter] = useState('');
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
    const visibleTopics = useMemo(
        () => (tagFilter === '' ? topics : topics.filter((topic) => topic.tags.includes(tagFilter))),
        [topics, tagFilter]
    );

    return (
        <section className="forum-page" aria-labelledby="forum-circle-title">
            <div className="grid gap-[15px] lg:grid-cols-[var(--forum-left-width)_minmax(0,1fr)_var(--forum-right-width)]">
                <aside className="order-2 grid content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:order-1 lg:self-start">
                    <Panel title="关于圈子">
                        <div className="flex items-start gap-3">
                            <CircleMark circle={circle} size="size-14" />
                            <div className="min-w-0">
                                <h2 id="forum-circle-title" className="text-[16px] font-semibold leading-6 text-ink">
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

                    {forum.notice !== '' ? (
                        <Panel title="社区公告">
                            <p className="whitespace-pre-line text-[11.5px] leading-6 text-ink-mute">{forum.notice}</p>
                        </Panel>
                    ) : null}

                    <Panel title="圈子统计">
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                ['帖子', circle.topicCount],
                                ['圈友', circle.memberCount],
                                ['全站帖子', stats.topics],
                                ['全站回复', stats.replies],
                            ].map(([label, value]) => (
                                <div key={label} className="rounded-[6px] bg-surface-2 px-3 py-2">
                                    <p className="text-[17px] font-semibold leading-6 text-ink">{value}</p>
                                    <p className="text-[10.5px] text-ink-faint">{label}</p>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </aside>

                <div className="order-1 min-w-0 lg:order-2">
                    <div className="surface-card overflow-hidden">
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
                        <div className="p-[15px]">
                            <div className="mb-2 flex items-center gap-2 border-b border-line pb-2">
                                <span className="text-[13px] font-medium text-ink">全部帖子</span>
                                <span className="text-[10.5px] text-ink-faint">{pager.total} 条</span>
                                <a className="ml-auto text-[11px] text-brand" href={forum.homeUrl}>
                                    返回{forum.displayName}
                                </a>
                            </div>
                            {tagOptions.length > 0 ? (
                                <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
                                topics={visibleTopics}
                                forum={forum}
                                pager={pager}
                                emptyTitle={
                                    tagFilter === '' ? '这个圈子还没有帖子' : `没有话题 #${tagFilter} 的帖子`
                                }
                                emptyText={
                                    tagFilter === ''
                                        ? '发布第一个帖子，让板块活跃起来。'
                                        : '换一个话题，或者清除筛选查看全部帖子。'
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
                                    ) : viewer.loggedIn && forum.permissions.createTopic ? (
                                        <Button
                                            type="button"
                                            className="h-8 rounded-[4px]"
                                            onClick={() => openTopicEditor(forum, circle.id)}
                                        >
                                            <Plus className="size-3.5" strokeWidth={2} aria-hidden="true" />
                                            发布新帖
                                        </Button>
                                    ) : null
                                }
                                onTagClick={(tag) => setTagFilter(tag)}
                            />
                        </div>
                    </div>
                </div>

                <aside className="order-3 grid content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
                    <SidebarHot
                        hotCircles={hotCircles}
                        hotTopics={hotTopics}
                        followLabel={forum.followLabel}
                    />
                </aside>
            </div>

        </section>
    );
}

function RailAction({
    icon,
    label,
    value,
    active,
    disabled,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    value?: number | string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className={cx('forum-rail-action', active ? 'is-active' : '', disabled ? 'is-disabled' : '')}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
        >
            <span className="forum-rail-icon">{icon}</span>
            {value !== undefined ? <span className="forum-rail-count">{value}</span> : null}
        </button>
    );
}

function ForumReplyEntry({
    reply,
    depth = 0,
    onReply,
}: {
    reply: ForumReply;
    depth?: number;
    onReply?: (reply: ForumReply) => void;
}) {
    return (
        <CommentEntry
            commentId={reply.id}
            author={{
                name: reply.author.screenName || reply.author.name,
                avatar: reply.author.avatar,
                url: reply.author.url,
                verified:
                    reply.author.group === 'administrator'
                    || reply.author.group === 'editor',
                groupLabel: reply.author.groupLabel,
            }}
            contentHtml={reply.contentHtml}
            createdText={reply.createdText}
            depth={depth}
            onReply={onReply ? () => onReply(reply) : undefined}
        >
            {reply.children.map((child) => (
                <ForumReplyEntry
                    key={child.id}
                    reply={child}
                    depth={depth + 1}
                    onReply={onReply}
                />
            ))}
        </CommentEntry>
    );
}

function QuickReplyPicker({
    items,
    recent,
    onPick,
    onRemember,
}: {
    items: string[];
    recent: string[];
    onPick: (text: string) => void;
    onRemember: (text: string) => void;
}) {
    if (items.length === 0 && recent.length === 0) {
        return null;
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-7 rounded-[4px] px-2 text-[11px]">
                    <MessageSquareText className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    快捷回复
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] border-line bg-surface p-2.5">
                <Tabs defaultValue="system">
                    <TabsList className="mb-2 h-8 w-full">
                        <TabsTrigger value="system">系统</TabsTrigger>
                        <TabsTrigger value="mine">我的</TabsTrigger>
                    </TabsList>
                    <TabsContent value="system" className="mt-0">
                        <div className="grid max-h-[240px] gap-1 overflow-y-auto">
                            {items.map((item, index) => (
                                <button
                                    key={`${item}-${index}`}
                                    type="button"
                                    className="rounded-[5px] px-2.5 py-2 text-left text-[12px] leading-5 text-ink-mute transition-colors hover:bg-surface-2 hover:text-ink"
                                    onClick={() => {
                                        onPick(item);
                                        onRemember(item);
                                    }}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="mine" className="mt-0">
                        {recent.length > 0 ? (
                            <div className="grid max-h-[240px] gap-1 overflow-y-auto">
                                {recent.map((item, index) => (
                                    <button
                                        key={`${item}-${index}`}
                                        type="button"
                                        className="rounded-[5px] px-2.5 py-2 text-left text-[12px] leading-5 text-ink-mute transition-colors hover:bg-surface-2 hover:text-ink"
                                        onClick={() => onPick(item)}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="px-2 py-6 text-center text-[11.5px] text-ink-faint">
                                使用系统短语后，会在这里保留最近记录。
                            </p>
                        )}
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
}

function RatingWidget({
    average,
    count,
    mine,
    raters,
    disabled,
    busy,
    onRate,
}: {
    average: number;
    count: number;
    mine: number;
    raters: ForumRater[];
    disabled: boolean;
    busy: boolean;
    onRate: (value: 1 | 2 | 3 | 4 | 5) => void;
}) {
    const [hoverValue, setHoverValue] = useState(0);
    const averageValue = Number.isFinite(average) ? Math.max(0, Math.min(5, average)) : 0;
    const visibleValue = hoverValue > 0 ? hoverValue : mine;

    return (
        <section id="forum-rating" className="forum-rating-card" aria-label="帖子评分">
            <div className="forum-rating-average" aria-live="polite">
                <Star
                    className="size-[18px]"
                    strokeWidth={1.7}
                    fill="currentColor"
                    aria-hidden="true"
                />
                <strong>{averageValue.toFixed(1)}</strong>
                <span>/ 5</span>
            </div>
            <div
                className="forum-rating-stars"
                role="group"
                aria-label="选择 1 到 5 星"
                onMouseLeave={() => setHoverValue(0)}
            >
                {[1, 2, 3, 4, 5].map((value) => (
                    <button
                        key={value}
                        type="button"
                        className={cx(
                            'forum-rating-star',
                            value <= visibleValue ? 'is-active' : ''
                        )}
                        aria-label={`${value} 星`}
                        aria-pressed={mine === value}
                        disabled={disabled || busy}
                        onMouseEnter={() => setHoverValue(value)}
                        onFocus={() => setHoverValue(value)}
                        onBlur={() => setHoverValue(0)}
                        onClick={() => {
                            setHoverValue(0);
                            onRate(value as 1 | 2 | 3 | 4 | 5);
                        }}
                    >
                        <Star
                            className="size-[18px]"
                            strokeWidth={1.6}
                            fill={value <= visibleValue ? 'currentColor' : 'none'}
                            aria-hidden="true"
                        />
                    </button>
                ))}
            </div>
            <p className="forum-rating-count">
                {count > 0 ? `${count} 人已评分` : '暂无评分'}
                {mine > 0 ? ` · 你的评分 ${mine} 星` : ' · 点击星星评分'}
                {busy ? ' · 同步中…' : ''}
            </p>

            {raters.length > 0 ? (
                <div className="forum-rating-people" aria-label="最近评分用户">
                    {raters.slice(0, 10).map((rater) => (
                        <a
                            key={rater.uid}
                            href={rater.url}
                            className="forum-rating-person"
                            title={`${rater.screenName || rater.name}：${rater.value} 星`}
                        >
                            <UserAvatar
                                name={rater.screenName || rater.name}
                                avatar={rater.avatar}
                                className="size-7"
                            />
                            <span className="forum-rating-badge">
                                {rater.value}
                                <span aria-hidden="true">★</span>
                            </span>
                        </a>
                    ))}
                </div>
            ) : (
                <p className="forum-rating-empty">还没有人评分，成为第一个打分的人。</p>
            )}
        </section>
    );
}

export function ForumTopicBlock({
    forum,
    topic,
    circle,
    breadcrumbs,
    contentHtml,
    download,
    replies,
    replyCount,
    showAuthor,
    showAuthorTopics,
    authorTopics,
    hotTopics,
    restricted = false,
    restrictedText = '',
}: ForumTopicBlock) {
    const viewer = forum.viewer;
    const canEditCircle = Boolean(
        circle
        && viewer.loggedIn
        && (circle.ownerId === viewer.uid || viewer.group === 'administrator' || forum.permissions.moderate)
    );
    const [liked, setLiked] = useState(topic.liked);
    const [favorited, setFavorited] = useState(topic.favorited);
    const [likes, setLikes] = useState(topic.likes);
    const [favorites, setFavorites] = useState(topic.favorites);
    const [pinned, setPinned] = useState(topic.pinned);
    const [featured, setFeatured] = useState(topic.featured);
    const [topicStatus, setTopicStatus] = useState(topic.status);
    const [ratingAverage, setRatingAverage] = useState(topic.ratingAverage);
    const [ratingCount, setRatingCount] = useState(topic.ratingCount);
    const [ratingMine, setRatingMine] = useState(topic.ratingMine);
    const [raters, setRaters] = useState<ForumRater[]>(topic.ratingUsers ?? []);
    const [ratingBusy, setRatingBusy] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);
    const [comment, setComment] = useState('');
    const [replyTo, setReplyTo] = useState<ForumReply | null>(null);
    const [replySort, setReplySort] = useState<CommentSortOrder>('latest');
    const [busy, setBusy] = useState(false);
    const [manageBusy, setManageBusy] = useState('');
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [joined, setJoined] = useState(circle?.joined ?? false);
    const [memberCount, setMemberCount] = useState(circle?.memberCount ?? 0);
    const [joinBusy, setJoinBusy] = useState(false);
    const [circleEditOpen, setCircleEditOpen] = useState(false);
    const [quickRecent, setQuickRecent] = useState<string[]>(() => {
        try {
            const stored = JSON.parse(window.localStorage.getItem('ttdf:forum-quick-replies') ?? '[]');
            return Array.isArray(stored)
                ? stored.filter((item): item is string => typeof item === 'string' && item.trim() !== '').slice(0, 10)
                : [];
        } catch {
            return [];
        }
    });
    const contentRef = useRef<HTMLDivElement | null>(null);
    const textarea = useRef<HTMLTextAreaElement | null>(null);

    const sortedReplies = useMemo(() => {
        const list = [...replies];
        list.sort((left, right) => {
            if (left.created !== right.created) {
                return replySort === 'latest'
                    ? right.created - left.created
                    : left.created - right.created;
            }

            return replySort === 'latest'
                ? right.id - left.id
                : left.id - right.id;
        });

        return list;
    }, [replies, replySort]);

    useEffect(() => {
        if (contentRef.current === null) {
            return;
        }

        void import('../../lib/highlight').then(({ highlightCode: run }) => {
            if (contentRef.current !== null) {
                run(contentRef.current);
            }
        });
    }, [contentHtml]);

    const rememberQuickReply = (text: string) => {
        setQuickRecent((current) => {
            const next = [text, ...current.filter((item) => item !== text)].slice(0, 10);
            try {
                window.localStorage.setItem('ttdf:forum-quick-replies', JSON.stringify(next));
            } catch {
                // Storage is a convenience; a blocked localStorage must not break posting.
            }
            return next;
        });
    };

    const react = async (type: 'like' | 'favorite') => {
        if (!viewer.loggedIn) {
            requestLogin();
            return;
        }
        if (!forum.permissions.react) {
            return;
        }

        try {
            const result = await forumRequest<{
                active: boolean;
                likes: number;
                favorites: number;
            }>(forum.endpoints.react, forum.nonce, { topic_id: topic.id, type });

            if (type === 'like') {
                setLiked(result.active);
                setLikes(result.likes);
            } else {
                setFavorited(result.active);
                setFavorites(result.favorites);
            }
            notifySuccess(
                type === 'like'
                    ? result.active
                        ? '已点赞。'
                        : '已取消点赞。'
                    : result.active
                      ? '已收藏。'
                      : '已取消收藏。'
            );
        } catch (reason) {
            notifyError(errorMessage(reason));
        }
    };

    const copyShareLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            notifySuccess('链接已复制。');
        } catch {
            notifyError('复制失败，请手动复制地址栏链接。');
        }
    };

    const share = () => {
        if (!forum.share.enabled) {
            void copyShareLink();
            return;
        }

        setShareOpen(true);
    };

    const rate = async (value: 1 | 2 | 3 | 4 | 5) => {
        if (!viewer.loggedIn) {
            requestLogin();
            return;
        }
        if (!forum.permissions.react || ratingBusy) {
            return;
        }

        setRatingBusy(true);
        try {
            const result = await forumRequest<{
                average: number;
                count: number;
                mine: number;
                raters: ForumRater[];
            }>(forum.endpoints.rate, forum.nonce, { topic_id: topic.id, value });
            setRatingAverage(result.average);
            setRatingCount(result.count);
            setRatingMine(result.mine);
            setRaters(Array.isArray(result.raters) ? result.raters : []);
            notifySuccess('评分已更新。');
        } catch (reason) {
            notifyError(errorMessage(reason));
        } finally {
            setRatingBusy(false);
        }
    };

    const report = () => {
        if (forum.reportEmail === '') {
            return;
        }

        const subject = encodeURIComponent(`举报帖子：${topic.title}`);
        const body = encodeURIComponent(`${window.location.href}\n\n请说明举报原因：`);
        window.location.href = `mailto:${forum.reportEmail}?subject=${subject}&body=${body}`;
    };

    const canManage = viewer.loggedIn
        && (forum.permissions.moderate || viewer.uid === topic.author.uid);

    const moderate = async (op: string) => {
        if (manageBusy !== '') {
            return;
        }

        setManageBusy(op);
        try {
            const result = await forumRequest<{ items?: ForumTopic[] }>(
                forum.endpoints.moderation,
                forum.nonce,
                { op, ids: [topic.id] }
            );
            const updated = Array.isArray(result.items)
                ? result.items.find((item) => item.id === topic.id)
                : undefined;
            if (updated) {
                setPinned(updated.pinned);
                setFeatured(updated.featured);
                setTopicStatus(updated.status);
            } else if (op === 'pin' || op === 'unpin') {
                setPinned(op === 'pin');
            } else if (op === 'feature' || op === 'unfeature') {
                setFeatured(op === 'feature');
            } else if (op === 'approve') {
                setTopicStatus('publish');
            } else if (op === 'reject') {
                setTopicStatus('rejected');
            }
            const messages: Record<string, string> = {
                approve: '帖子已通过审核。',
                reject: '帖子已驳回。',
                pin: '帖子已置顶。',
                unpin: '已取消置顶。',
                feature: '帖子已设为精华。',
                unfeature: '已取消精华。',
            };
            notifySuccess(messages[op] ?? '帖子状态已更新。');
        } catch (reason) {
            notifyError(errorMessage(reason));
        } finally {
            setManageBusy('');
        }
    };

    const removeTopic = async () => {
        if (manageBusy !== '') {
            return;
        }

        setManageBusy('delete');
        try {
            await forumRequest(forum.endpoints.topicDelete, forum.nonce, {
                topic_id: topic.id,
            });
            flashNotify('success', `《${topic.title}》已移入回收站。`);
            navigateApp(topic.circle?.url || forum.homeUrl);
        } catch (reason) {
            notifyError(errorMessage(reason));
            setDeleteOpen(false);
        } finally {
            setManageBusy('');
        }
    };

    const toggleJoin = async () => {
        if (circle === null || joinBusy) {
            return;
        }
        if (!viewer.loggedIn) {
            requestLogin();
            return;
        }
        if (!forum.permissions.join) {
            return;
        }

        setJoinBusy(true);
        try {
            const result = await forumRequest<{
                joined: boolean;
                memberCount: number;
                message?: string;
            }>(forum.endpoints.join, forum.nonce, { circle_id: circle.id });
            setJoined(result.joined);
            setMemberCount(result.memberCount);
            notifySuccess(
                result.message
                    || (result.joined ? '已加入圈子。' : '已退出圈子。')
            );
        } catch (reason) {
            notifyError(errorMessage(reason));
        } finally {
            setJoinBusy(false);
        }
    };

    const submitReply = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) {
            return;
        }
        if (!viewer.loggedIn) {
            requestLogin();
            return;
        }

        setBusy(true);
        try {
            await forumRequest(forum.endpoints.replyCreate, forum.nonce, {
                topic_id: topic.id,
                parent_id: replyTo?.id ?? 0,
                content: comment,
            });
            setComment('');
            setReplyTo(null);
            notifySuccess('评论已发布。');
            refreshApp();
        } catch (reason) {
            notifyError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    const author = topic.author;

    return (
        <section className="forum-page" aria-labelledby="forum-topic-title">
            <div className="grid gap-[15px] lg:grid-cols-[56px_minmax(0,1fr)_282px]">
                <aside className="order-1 hidden min-w-0 lg:sticky lg:top-[var(--forum-sticky-top)] lg:block lg:self-start">
                    <div
                        className="forum-action-rail grid grid-cols-3 justify-items-center gap-3 lg:grid-cols-1 lg:gap-2.5"
                        role="toolbar"
                        aria-label="帖子操作"
                    >
                        <RailAction
                            icon={<ThumbsUp className="size-[19px]" strokeWidth={1.8} />}
                            label="点赞"
                            value={likes}
                            active={liked}
                            onClick={() => void react('like')}
                        />
                        <RailAction
                            icon={<Star className="size-[19px]" strokeWidth={1.8} />}
                            label="收藏"
                            value={favorites}
                            active={favorited}
                            onClick={() => void react('favorite')}
                        />
                        <RailAction
                            icon={<Share2 className="size-[19px]" strokeWidth={1.8} />}
                            label="分享"
                            onClick={() => void share()}
                        />
                    </div>
                </aside>

                <div className="order-2 min-w-0">
                    {breadcrumbs.length > 0 ? (
                        <div className="mb-[14px]">
                            <BreadcrumbsBlock items={breadcrumbs} />
                        </div>
                    ) : null}

                    <article className="surface-card overflow-hidden">
                        <div className="px-4 pb-4 pt-5 sm:px-6">
                            <div className="flex items-start gap-2">
                                <h1
                                    id="forum-topic-title"
                                    className="min-w-0 flex-1 text-[22px] font-semibold leading-[1.4] text-ink sm:text-[24px]"
                                >
                                    {topic.title}
                                </h1>
                                {canManage ? (
                                    <DropdownMenu modal={false}>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                type="button"
                                                size="icon-sm"
                                                variant="ghost"
                                                className="mt-0.5 shrink-0"
                                                disabled={manageBusy !== ''}
                                                aria-label="帖子管理操作"
                                            >
                                                {manageBusy !== '' ? (
                                                    <LoaderCircle
                                                        className="animate-spin"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <MoreHorizontal aria-hidden="true" />
                                                )}
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-44">
                                            <DropdownMenuItem
                                                onSelect={() =>
                                                    openTopicEditor(
                                                        forum,
                                                        topic.circle?.id ?? 0,
                                                        topic.id
                                                    )
                                                }
                                            >
                                                <Pencil aria-hidden="true" />
                                                编辑帖子
                                            </DropdownMenuItem>
                                            {forum.permissions.moderate ? (
                                                <>
                                                    <DropdownMenuItem
                                                        onSelect={() =>
                                                            void moderate(
                                                                pinned ? 'unpin' : 'pin'
                                                            )
                                                        }
                                                    >
                                                        <Pin aria-hidden="true" />
                                                        {pinned ? '取消置顶' : '置顶'}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onSelect={() =>
                                                            void moderate(
                                                                featured
                                                                    ? 'unfeature'
                                                                    : 'feature'
                                                            )
                                                        }
                                                    >
                                                        <Star aria-hidden="true" />
                                                        {featured ? '取消精华' : '设为精华'}
                                                    </DropdownMenuItem>
                                                    {topicStatus !== 'publish' ? (
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void moderate('approve')
                                                            }
                                                        >
                                                            <Check aria-hidden="true" />
                                                            通过审核
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {topicStatus !== 'rejected' ? (
                                                        <DropdownMenuItem
                                                            onSelect={() =>
                                                                void moderate('reject')
                                                            }
                                                        >
                                                            <Ban aria-hidden="true" />
                                                            驳回
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                </>
                                            ) : null}
                                            {forum.reportEmail !== '' ? (
                                                <DropdownMenuItem onSelect={report}>
                                                    <Flag aria-hidden="true" />
                                                    举报帖子
                                                </DropdownMenuItem>
                                            ) : null}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                onSelect={() => setDeleteOpen(true)}
                                            >
                                                <Trash2 aria-hidden="true" />
                                                删除
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                ) : null}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10.5px] text-ink-faint">
                                <a
                                    className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-soft hover:text-brand"
                                    href={author.url || '#'}
                                >
                                    <UserAvatar
                                        name={author.screenName || author.name}
                                        avatar={author.avatar}
                                        className="size-[22px]"
                                    />
                                    {author.screenName || author.name}
                                    {author.group === 'administrator'
                                    || author.group === 'editor' ? (
                                        <BadgeCheck
                                            className="size-3.5 text-[#4da3ff]"
                                            strokeWidth={2.1}
                                            aria-label={author.groupLabel}
                                        />
                                    ) : null}
                                </a>
                                <span className="rounded-full bg-[rgba(255,138,61,0.12)] px-1.5 py-0.5 text-[9.5px] font-medium text-[#ff8a3d]">
                                    {author.groupLabel}
                                </span>
                                <span className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 text-[9.5px] text-ink-mute">
                                    {topic.kindLabel}
                                </span>
                                {pinned ? (
                                    <span className="rounded-[3px] bg-[rgba(229,72,77,0.1)] px-1.5 py-0.5 text-[9.5px] text-[#d94848]">
                                        置顶
                                    </span>
                                ) : null}
                                {featured ? (
                                    <span className="rounded-[3px] bg-[rgba(245,158,11,0.12)] px-1.5 py-0.5 text-[9.5px] text-[#b45309]">
                                        精华
                                    </span>
                                ) : null}
                                {topicStatus !== 'publish' ? (
                                    <span className="rounded-[3px] bg-[rgba(229,72,77,0.1)] px-1.5 py-0.5 text-[9.5px] text-[#d94848]">
                                        {topicStatus === 'waiting'
                                            ? '待审核'
                                            : topicStatus === 'rejected'
                                              ? '已驳回'
                                              : topicStatus === 'deleted'
                                                ? '回收站'
                                              : topicStatus}
                                    </span>
                                ) : null}
                                {topic.tags.slice(0, 4).map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-0.5 rounded-[3px] bg-brand-soft px-1.5 py-0.5 text-[9.5px] text-brand"
                                    >
                                        <TagIcon className="size-2.5" strokeWidth={2} aria-hidden="true" />
                                        {tag}
                                    </span>
                                ))}
                                <span className="inline-flex items-center gap-1">
                                    <Clock3 className="size-3" strokeWidth={1.8} aria-hidden="true" />
                                    {topic.createdText}
                                </span>
                                <span className="ml-auto inline-flex items-center gap-3">
                                    <span className="inline-flex items-center gap-1">
                                        <Eye className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                        {topic.views}
                                    </span>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 hover:text-brand"
                                        onClick={() =>
                                            document
                                                .getElementById('forum-replies')
                                                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                        }
                                    >
                                        <MessageCircle
                                            className="size-3.5"
                                            strokeWidth={1.8}
                                            aria-hidden="true"
                                        />
                                        {replyCount}
                                    </button>
                                </span>
                            </div>
                        </div>

                        {restricted ? (
                            <div className="forum-topic-restricted px-4 py-8 text-center sm:px-6">
                                <Ban
                                    className="mx-auto size-7 text-ink-faint"
                                    strokeWidth={1.5}
                                    aria-hidden="true"
                                />
                                <p className="mt-3 text-[13px] font-medium text-ink-soft">
                                    帖子已移入回收站
                                </p>
                                <p className="mx-auto mt-1 max-w-md text-[12px] leading-6 text-ink-mute">
                                    {restrictedText
                                        || '这篇帖子仅保留标题与发布时间，正文内容暂不可查看。'}
                                </p>
                            </div>
                        ) : (
                            <div
                                ref={contentRef}
                                className="prose forum-prose px-4 py-4 sm:px-6 sm:py-5"
                                dangerouslySetInnerHTML={{ __html: contentHtml }}
                            />
                        )}

                        {!restricted && download ? (
                            <div className="border-t border-line px-4 py-4 sm:px-6">
                                <DownloadCard offer={download} />
                            </div>
                        ) : null}

                        {!restricted ? (
                        <div className="border-t border-line px-4 py-4 sm:px-6">
                            <RatingWidget
                                average={ratingAverage}
                                count={ratingCount}
                                mine={ratingMine}
                                raters={raters}
                                disabled={viewer.loggedIn && !forum.permissions.react}
                                busy={ratingBusy}
                                onRate={(value) => void rate(value)}
                            />
                        </div>
                        ) : null}

                        {!restricted ? (
                        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[11px] text-ink-faint">
                            <button
                                type="button"
                                className={cx(
                                    'inline-flex items-center gap-1',
                                    liked ? 'text-brand' : 'hover:text-brand'
                                )}
                                onClick={() => void react('like')}
                            >
                                <ThumbsUp className="size-3.5" strokeWidth={1.8} />
                                {likes} 赞
                            </button>
                            <button
                                type="button"
                                className={cx(
                                    'inline-flex items-center gap-1',
                                    favorited ? 'text-brand' : 'hover:text-brand'
                                )}
                                onClick={() => void react('favorite')}
                            >
                                <Bookmark className="size-3.5" strokeWidth={1.8} />
                                {favorites} 收藏
                            </button>
                            <button
                                type="button"
                                className={cx(
                                    'inline-flex items-center gap-1',
                                    ratingMine > 0 ? 'text-brand' : 'hover:text-brand'
                                )}
                                onClick={() =>
                                    document
                                        .getElementById('forum-rating')
                                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                }
                            >
                                <Star className="size-3.5" strokeWidth={1.8} />
                                {ratingCount > 0 ? `${ratingAverage.toFixed(1)} 评分` : '评分'}
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:text-brand"
                                onClick={() =>
                                    document
                                        .getElementById('forum-replies')
                                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                }
                            >
                                <MessageCircle className="size-3.5" strokeWidth={1.8} />
                                {replyCount} 回复
                            </button>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:text-brand"
                                onClick={() => void share()}
                            >
                                <Share2 className="size-3.5" strokeWidth={1.8} />
                                分享
                            </button>
                            {topic.circle ? (
                                <a
                                    className="ml-auto inline-flex items-center gap-1 text-brand"
                                    href={topic.circle.url}
                                >
                                    进入圈子
                                    <ArrowUpRight className="size-3" strokeWidth={1.8} />
                                </a>
                            ) : null}
                        </div>
                        ) : null}
                    </article>

                    {showAuthor && !restricted ? (
                        <section className="surface-card mt-[15px] overflow-hidden">
                            <div className="flex items-start gap-3 px-4 py-4">
                                <UserAvatar
                                    name={author.screenName || author.name}
                                    avatar={author.avatar}
                                    className="size-[52px]"
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <a
                                            className="truncate text-[14px] font-semibold text-ink hover:text-brand"
                                            href={author.url || '#'}
                                        >
                                            {author.screenName || author.name}
                                        </a>
                                        {author.group === 'administrator'
                                        || author.group === 'editor' ? (
                                            <BadgeCheck
                                                className="size-4 text-[#4da3ff]"
                                                strokeWidth={2.1}
                                                aria-label={author.groupLabel}
                                            />
                                        ) : null}
                                        <span className="rounded-full bg-[rgba(255,138,61,0.12)] px-2 py-0.5 text-[9.5px] font-medium text-[#ff8a3d]">
                                            {author.groupLabel}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10.5px] text-ink-faint">
                                        近期发布 {authorTopics.length} 篇帖子
                                    </p>
                                </div>
                                {author.url ? (
                                    <a
                                        className="hidden shrink-0 items-center gap-0.5 text-[10.5px] text-ink-faint hover:text-brand sm:inline-flex"
                                        href={author.url}
                                    >
                                        个人空间
                                        <ArrowUpRight className="size-3" strokeWidth={1.8} />
                                    </a>
                                ) : null}
                            </div>
                            {showAuthorTopics && authorTopics.length > 0 ? (
                                <ul className="border-t border-line px-3 py-2">
                                    {authorTopics.map((item) => (
                                        <li key={item.id}>
                                            <a
                                                className="group flex items-start gap-2 rounded-[5px] px-1.5 py-1.5 transition-colors hover:bg-surface-2"
                                                href={item.url}
                                            >
                                                <CircleDot
                                                    className="mt-[3px] size-3 shrink-0 text-brand"
                                                    strokeWidth={2}
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1">
                                                    <span className="line-clamp-1 text-[12px] leading-5 text-ink-soft group-hover:text-brand">
                                                        {item.title}
                                                    </span>
                                                    <span className="mt-0.5 block text-[10px] text-ink-faint">
                                                        {item.createdText} · {item.comments} 回复
                                                    </span>
                                                </span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </section>
                    ) : null}

                    {!restricted ? (
                    <CommentSection
                        id="forum-replies"
                        title="回复"
                        count={replyCount}
                        hint="友善交流，支持 Markdown"
                        className="mt-[15px]"
                        sortOrder={replySort}
                        onSortChange={setReplySort}
                    >
                        {viewer.loggedIn && forum.permissions.reply ? (
                            <CommentComposer
                                textareaRef={textarea}
                                avatar={{
                                    name: viewer.screenName || viewer.name,
                                    avatar: viewer.avatar,
                                }}
                                value={comment}
                                onChange={setComment}
                                onSubmit={submitReply}
                                busy={busy}
                                meme={forum.meme}
                                placeholder="友善交流，请勿发表情、请勿灌水，违者封号"
                                submitLabel="提交回复"
                                label="回复内容"
                                replyTo={
                                    replyTo
                                        ? {
                                              label:
                                                  replyTo.author.screenName
                                                  || replyTo.author.name,
                                              onCancel: () =>
                                                  setReplyTo(null),
                                          }
                                        : null
                                }
                                onImage={
                                    forum.canUseMedia
                                        ? () => setMediaOpen(true)
                                        : undefined
                                }
                                quickReply={
                                    forum.quickReply.enabled ? (
                                        <QuickReplyPicker
                                            items={forum.quickReply.items}
                                            recent={quickRecent}
                                            onPick={(text) =>
                                                insertText(
                                                    textarea.current,
                                                    setComment,
                                                    text
                                                )
                                            }
                                            onRemember={rememberQuickReply}
                                        />
                                    ) : null
                                }
                            />
                        ) : (
                            <div className="px-4 py-4">
                                <div className="rounded-[8px] border border-dashed border-line px-4 py-5 text-center">
                                    <p className="text-[12px] text-ink-mute">
                                        {viewer.loggedIn
                                            ? '当前圈子暂不开放回复。'
                                            : '登录后即可参与评论。'}
                                    </p>
                                    {!viewer.loggedIn ? (
                                        <div className="mt-3 flex justify-center">
                                            <LoginHint />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        )}
                        <MediaLibrary
                            open={mediaOpen}
                            onOpenChange={setMediaOpen}
                            mediaEndpoint={forum.mediaEndpoint}
                            uploadPurpose="topic"
                            onSelect={(item: MediaItem) => {
                                insertText(
                                    textarea.current,
                                    setComment,
                                    `\n![${item.title}](${item.url})\n`
                                );
                                setMediaOpen(false);
                            }}
                        />

                        {sortedReplies.length > 0 ? (
                            <ul className="comment-list">
                                {sortedReplies.map((reply) => (
                                    <ForumReplyEntry
                                        key={reply.id}
                                        reply={reply}
                                        onReply={(target) => {
                                            setReplyTo(target);
                                            textarea.current?.focus();
                                        }}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <CommentEmpty
                                image={forum.nullImage}
                                text="还没有评论，来抢沙发吧。"
                            />
                        )}
                    </CommentSection>
                    ) : null}
                </div>

                <aside className="order-3 grid content-start gap-[15px] lg:sticky lg:top-[var(--sticky-top)] lg:self-start">
                    {circle ? (
                        <section className="surface-card overflow-hidden">
                            <div
                                className="forum-circle-cover relative h-[104px]"
                                style={
                                    circle.background !== ''
                                        ? {
                                              backgroundImage: `linear-gradient(180deg, rgba(10, 18, 35, 0.08), rgba(10, 18, 35, 0.58)), ${cssUrl(circle.background)}`,
                                          }
                                        : undefined
                                }
                            >
                                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
                                {canEditCircle ? (
                                    <button
                                        type="button"
                                        className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-[4px] bg-black/35 px-2 py-1 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-black/50"
                                        onClick={() => setCircleEditOpen(true)}
                                    >
                                        <Pencil className="size-3" strokeWidth={2} aria-hidden="true" />
                                        编辑圈子
                                    </button>
                                ) : null}
                                <a
                                    className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-[4px] bg-black/35 px-2 py-1 text-[10px] text-white backdrop-blur-sm"
                                    href={circle.url}
                                >
                                    <CircleDot className="size-3" strokeWidth={2} aria-hidden="true" />
                                    进入圈子
                                </a>
                                <div className="absolute inset-x-3 bottom-2 flex items-end justify-between">
                                    <CircleMark
                                        circle={circle}
                                        size="size-12 border-2 border-white/85 shadow-[0_8px_22px_-10px_rgba(0,0,0,0.8)]"
                                    />
                                </div>
                            </div>
                            <div className="px-4 pb-4 pt-2.5">
                                <h2 className="truncate text-[14px] font-semibold text-ink">
                                    {circle.name}
                                </h2>
                                <p className="mt-1 line-clamp-2 text-[11px] leading-[1.6] text-ink-faint">
                                    {circle.description.trim() !== ''
                                        ? circle.description
                                        : `欢迎来到「${circle.name}」，一起参与讨论。`}
                                </p>
                                <dl className="mt-3 grid grid-cols-2 divide-x divide-line border-y border-line py-2 text-center">
                                    <div>
                                        <dd className="text-[14px] font-semibold text-ink">
                                            {circle.topicCount}
                                        </dd>
                                        <dt className="text-[10px] text-ink-faint">帖子</dt>
                                    </div>
                                    <div>
                                        <dd className="text-[14px] font-semibold text-ink">
                                            {memberCount}
                                        </dd>
                                        <dt className="text-[10px] text-ink-faint">圈友</dt>
                                    </div>
                                </dl>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        className="inline-flex h-8 items-center justify-center gap-1 rounded-[5px] bg-brand px-2 text-[11.5px] font-medium text-brand-contrast transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
                                        disabled={
                                            viewer.loggedIn && !forum.permissions.createTopic
                                        }
                                        onClick={() => openTopicEditor(forum, circle.id)}
                                    >
                                        <Plus className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                                        发布
                                    </button>
                                    <button
                                        type="button"
                                        className={
                                            joined
                                                ? 'inline-flex h-8 items-center justify-center gap-1 rounded-[5px] border border-line bg-surface-2 px-2 text-[11.5px] font-medium text-ink-mute transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'
                                                : 'inline-flex h-8 items-center justify-center gap-1 rounded-[5px] bg-brand px-2 text-[11.5px] font-medium text-brand-contrast transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50'
                                        }
                                        disabled={
                                            joinBusy
                                            || (viewer.loggedIn && !forum.permissions.join)
                                        }
                                        onClick={() => void toggleJoin()}
                                    >
                                        {joined ? (
                                            <Check className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                                        ) : (
                                            <UserPlus className="size-3.5" strokeWidth={2.1} aria-hidden="true" />
                                        )}
                                        {joinBusy
                                            ? '处理中'
                                            : joined
                                              ? '已关注'
                                              : forum.followLabel}
                                    </button>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    <Panel title="热门推荐">
                        <Tabs defaultValue="hot" className="gap-2">
                            <TabsList className="grid h-8 w-full grid-cols-3">
                                <TabsTrigger value="hot" className="text-[11px]">
                                    热门
                                </TabsTrigger>
                                <TabsTrigger value="featured" className="text-[11px]">
                                    精华
                                </TabsTrigger>
                                <TabsTrigger value="pinned" className="text-[11px]">
                                    置顶
                                </TabsTrigger>
                            </TabsList>
                            <TabsContent value="hot" className="mt-1">
                                <HotTopicList topics={hotTopics} empty="暂无热门帖子" />
                            </TabsContent>
                            <TabsContent value="featured" className="mt-1">
                                <HotTopicList
                                    topics={hotTopics.filter((item) => item.featured)}
                                    empty="暂无精华帖子"
                                />
                            </TabsContent>
                            <TabsContent value="pinned" className="mt-1">
                                <HotTopicList
                                    topics={hotTopics.filter((item) => item.pinned)}
                                    empty="暂无置顶帖子"
                                />
                            </TabsContent>
                        </Tabs>
                    </Panel>
                </aside>
            </div>
            <ShareSheet
                open={shareOpen}
                onOpenChange={setShareOpen}
                config={forum.share}
                url={window.location.href}
                title={topic.title}
                siteName={document.title}
            />
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除这篇帖子？</AlertDialogTitle>
                        <AlertDialogDescription>
                            《{topic.title}》及其全部回复会被永久删除，此操作无法撤销。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={manageBusy === 'delete'}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={manageBusy === 'delete'}
                            onClick={(event) => {
                                event.preventDefault();
                                void removeTopic();
                            }}
                        >
                            {manageBusy === 'delete' ? '删除中…' : '确认删除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {circle ? (
                <CircleDialog
                    open={circleEditOpen}
                    onOpenChange={setCircleEditOpen}
                    forum={forum}
                    circle={circle}
                    onCreated={() => undefined}
                    onUpdated={() => refreshApp()}
                />
            ) : null}
        </section>
    );
}
