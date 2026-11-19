import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
    ArrowLeft,
    CalendarDays,
    ChevronDown,
    CircleDot,
    Columns2,
    Eye,
    ImagePlus,
    Layers3,
    Link2,
    LoaderCircle,
    PencilLine,
    Send,
    Tag as TagIcon,
    Upload,
    UserRound,
    X,
} from 'lucide-react';
import { renderMarkdown } from '../../lib/markdown';
import MarkdownToolbar from '../content/MarkdownToolbar';
import MediaLibrary from '../content/MediaLibrary';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import type { MediaItem, PageData } from '../../types';

type ViewMode = 'write' | 'split' | 'preview';

function countWords(value: string): { chars: number; words: number; minutes: number } {
    const text = value.trim();
    const chars = text.length;
    const latin = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
    const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    const words = latin + cjk;

    return { chars, words, minutes: Math.max(1, Math.ceil(words / 300)) };
}

function insertAtCursor(
    textarea: HTMLTextAreaElement | null,
    value: string,
    onChange: (next: string) => void,
    snippet: string
): void {
    if (!textarea) {
        onChange(value + snippet);
        return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const next = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
    onChange(next);
    window.requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + snippet.length;
        textarea.setSelectionRange(cursor, cursor);
    });
}

function MetaBox({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <details className="editor-meta-box" open>
            <summary className="editor-meta-head">
                <span>{title}</span>
                <ChevronDown className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
            </summary>
            <div className="editor-meta-body">{children}</div>
        </details>
    );
}

export default function ForumTopicEditor({ data }: { data: PageData }) {
    const editor = data.forumEditor;
    if (!editor) {
        return (
            <div className="editor-gate">
                <p className="editor-gate-title">发帖编辑器暂不可用</p>
                <p className="editor-gate-text">页面数据不完整，请返回圈子重新进入。</p>
            </div>
        );
    }

    if (editor.gate) {
        const login = editor.gate.type === 'login';
        return (
            <div className="editor-workspace">
                <div className="editor-gate">
                    <Layers3 className="size-9" strokeWidth={1.2} aria-hidden="true" />
                    <p className="editor-gate-title">{editor.gate.title}</p>
                    <p className="editor-gate-text">{editor.gate.text}</p>
                    {login ? (
                        <Button
                            type="button"
                            className="mt-1"
                            onClick={() => window.dispatchEvent(new Event('ttdf:open-auth'))}
                        >
                            登录后继续
                        </Button>
                    ) : (
                        <a className="editor-gate-link" href={editor.homeUrl}>
                            返回{editor.displayName}
                        </a>
                    )}
                </div>
            </div>
        );
    }

    const initialCircle = editor.circle?.id ?? editor.circles[0]?.id ?? 0;
    const [selectedCircle, setSelectedCircle] = useState(initialCircle);
    const [kind, setKind] = useState(editor.topicKinds[0]?.value ?? '讨论');
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [title, setTitle] = useState('');
    const [slug, setSlug] = useState('');
    const [content, setContent] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [pending, setPending] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const stats = useMemo(() => countWords(content), [content]);
    const previewHtml = useMemo(() => renderMarkdown(content), [content]);
    const circle = editor.circles.find((item) => item.id === selectedCircle) ?? editor.circle;
    const dirty = title.trim() !== '' || slug.trim() !== '' || content.trim() !== '' || tags.length > 0;

    const addTag = (value = tagInput) => {
        const next = value
            .trim()
            .replace(/^#+/u, '')
            .replace(/\s+/gu, ' ')
            .slice(0, 20);
        if (next === '') {
            return;
        }
        if (tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
            setTagInput('');
            return;
        }
        if (tags.length >= 8) {
            setFeedback({ tone: 'error', text: '最多添加 8 个话题。' });
            return;
        }

        setTags((current) => [...current, next]);
        setTagInput('');
        setFeedback(null);
    };

    const removeTag = (value: string) => {
        setTags((current) => current.filter((tag) => tag !== value));
    };

    const onTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
            event.preventDefault();
            addTag();
            return;
        }
        if (event.key === 'Backspace' && tagInput === '' && tags.length > 0) {
            setTags((current) => current.slice(0, -1));
        }
    };

    useEffect(() => {
        if (!dirty || submitting) {
            return;
        }

        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty, submitting]);

    const insertMedia = (item: MediaItem) => {
        const alt = item.title.replace(/[[\]]/g, '').trim();
        insertAtCursor(textareaRef.current, content, setContent, `\n![${alt}](${item.url})\n`);
    };

    const uploadFiles = async (files: File[]) => {
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length === 0 || uploading || !editor.canUseMedia) {
            return;
        }

        setUploading(true);
        setFeedback(null);
        try {
            for (const file of images) {
                const body = new FormData();
                body.append('file', file);
                const response = await fetch(editor.mediaEndpoint, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    body,
                });
                const payload = (await response.json().catch(() => null)) as
                    | { data?: unknown; message?: string }
                    | null;
                if (!response.ok) {
                    throw new Error(payload?.message || '图片上传失败');
                }

                const item =
                    payload?.data && typeof payload.data === 'object'
                        ? (payload.data as MediaItem)
                        : null;
                if (item) {
                    insertMedia(item);
                }
            }
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '图片上传失败',
            });
        } finally {
            setUploading(false);
        }
    };

    const submit = async () => {
        if (submitting) {
            return;
        }
        if (selectedCircle <= 0) {
            setFeedback({ tone: 'error', text: '请选择要发布到的圈子。' });
            return;
        }
        if (title.trim().length < 2) {
            setFeedback({ tone: 'error', text: '标题至少需要 2 个字符。' });
            return;
        }
        if (content.trim() === '') {
            setFeedback({ tone: 'error', text: '正文不能为空。' });
            return;
        }

        setSubmitting(true);
        setFeedback(null);
        try {
            const response = await fetch(editor.endpoints.topicCreate, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Typecho-Token': editor.nonce,
                },
                body: JSON.stringify({
                    circle_id: selectedCircle,
                    kind,
                    tags,
                    title: title.trim(),
                    slug: slug.trim(),
                    content,
                }),
            });
            const payload = (await response.json().catch(() => null)) as
                | { data?: unknown; message?: string }
                | null;
            if (!response.ok) {
                throw new Error(payload?.message || '发布失败，请稍后再试。');
            }

            const result =
                payload?.data && typeof payload.data === 'object'
                    ? (payload.data as {
                          url?: unknown;
                          status?: unknown;
                          message?: unknown;
                      })
                    : null;
            if (result?.status === 'waiting') {
                const message =
                    typeof result.message === 'string' && result.message.trim() !== ''
                        ? result.message
                        : '帖子已提交审核';
                setPending(true);
                setFeedback({ tone: 'success', text: message });
                setTitle('');
                setSlug('');
                setContent('');
                setTags([]);
                setTagInput('');
                return;
            }
            const url = typeof result?.url === 'string' ? result.url : '';
            if (url === '') {
                throw new Error('发布成功，但没有返回帖子地址，请回到圈子查看。');
            }

            window.location.assign(url);
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '发布失败，请稍后再试。',
            });
        } finally {
            setSubmitting(false);
        }
    };

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        void submit();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit();
        }
    };

    return (
        <div className="editor-workspace" onKeyDown={onKeyDown}>
            <form onSubmit={onSubmit}>
                <header className="editor-topbar">
                    <div className="editor-topbar-row">
                        <div className="editor-topbar-left">
                            <a className="editor-back" href={editor.homeUrl}>
                                <ArrowLeft aria-hidden="true" />
                                <span>{editor.displayName}</span>
                            </a>
                            <span className="editor-topbar-sep" aria-hidden="true">
                                /
                            </span>
                            <span className="editor-topbar-doc">发布新帖</span>
                            <Badge variant="secondary">新帖</Badge>
                            {dirty ? <span className="editor-dirty">未发布</span> : null}
                        </div>
                        <div className="editor-toolbar-actions">
                            <Button type="submit" size="sm" disabled={submitting || uploading}>
                                {submitting ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <Send aria-hidden="true" />
                                )}
                                {submitting ? '发布中…' : '发布帖子'}
                            </Button>
                        </div>
                    </div>
                    <div className="editor-topbar-sub">
                        <span>
                            {circle ? `发布到 ${circle.name}` : '圈子发帖'} · Markdown · 媒体库
                        </span>
                        <span className="editor-shortcut">
                            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 发布
                        </span>
                    </div>
                </header>

                <div className="editor-canvas">
                    {pending ? (
                        <div
                            className="content-feedback content-feedback-success flex flex-wrap items-center justify-between gap-2"
                            role="status"
                        >
                            <span>{feedback?.text || '帖子已提交审核'}</span>
                            <a
                                className="font-medium underline underline-offset-2"
                                href={editor.contentUrl || editor.homeUrl}
                            >
                                前往内容管理
                            </a>
                        </div>
                    ) : feedback ? (
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

                    <div className="editor-layout">
                        <div className="editor-primary">
                            <section className="editor-card editor-title-card">
                                <Input
                                    className="editor-title-input"
                                    value={title}
                                    onChange={(event) => setTitle(event.target.value)}
                                    placeholder="输入帖子标题"
                                    maxLength={editor.maxTitleLength}
                                    aria-label="帖子标题"
                                    autoFocus
                                />
                                <div className="editor-document-meta">
                                    <span>
                                        <UserRound className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                        {editor.viewer.screenName || editor.viewer.name}
                                    </span>
                                    <span>
                                        <CalendarDays className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                        草稿
                                    </span>
                                    <span>{stats.chars} 字</span>
                                    <span>{stats.words} 词</span>
                                </div>
                                <div className="editor-permalink">
                                    <Link2 className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                                    <span>固定链接</span>
                                    <Input
                                        value={slug}
                                        onChange={(event) => setSlug(event.target.value)}
                                        placeholder="留空自动生成随机地址"
                                        maxLength={editor.maxSlugLength}
                                        aria-label="帖子固定链接"
                                    />
                                </div>
                            </section>

                            <section className="editor-card editor-writing-card">
                                <div className="editor-writing-head">
                                    <div className="editor-view-switch" role="group" aria-label="编辑视图">
                                        <button
                                            type="button"
                                            className={viewMode === 'write' ? 'is-active' : ''}
                                            aria-pressed={viewMode === 'write'}
                                            onClick={() => setViewMode('write')}
                                        >
                                            <PencilLine aria-hidden="true" />
                                            写作
                                        </button>
                                        <button
                                            type="button"
                                            className={viewMode === 'split' ? 'is-active' : ''}
                                            aria-pressed={viewMode === 'split'}
                                            onClick={() => setViewMode('split')}
                                        >
                                            <Columns2 aria-hidden="true" />
                                            分屏
                                        </button>
                                        <button
                                            type="button"
                                            className={viewMode === 'preview' ? 'is-active' : ''}
                                            aria-pressed={viewMode === 'preview'}
                                            onClick={() => setViewMode('preview')}
                                        >
                                            <Eye aria-hidden="true" />
                                            预览
                                        </button>
                                    </div>
                                    <div className="editor-stats">
                                        <span>约 {stats.minutes} 分钟</span>
                                    </div>
                                </div>

                                <div
                                    className={
                                        'editor-writing-body is-' +
                                        viewMode +
                                        (dragging ? ' is-dragging' : '')
                                    }
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        setDragging(true);
                                    }}
                                    onDragLeave={() => setDragging(false)}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        setDragging(false);
                                        void uploadFiles(Array.from(event.dataTransfer.files ?? []));
                                    }}
                                >
                                    {viewMode !== 'preview' ? (
                                        <div className="editor-source">
                                            <MarkdownToolbar
                                                target={textareaRef}
                                                onChange={setContent}
                                                onImage={
                                                    editor.canUseMedia
                                                        ? () => setMediaOpen(true)
                                                        : undefined
                                                }
                                                disabled={submitting}
                                            />
                                            <Textarea
                                                ref={textareaRef}
                                                className="markdown-input editor-markdown-input"
                                                value={content}
                                                onChange={(event) => setContent(event.target.value)}
                                                onPaste={(event) => {
                                                    const files = Array.from(
                                                        event.clipboardData.files ?? []
                                                    ).filter((file) => file.type.startsWith('image/'));
                                                    if (files.length > 0) {
                                                        event.preventDefault();
                                                        void uploadFiles(files);
                                                    }
                                                }}
                                                placeholder="写下帖子正文…支持 Markdown、图片与代码块，可直接拖拽或粘贴图片上传。"
                                                aria-label="帖子正文"
                                                spellCheck={false}
                                                maxLength={editor.maxLength}
                                            />
                                        </div>
                                    ) : null}

                                    {viewMode !== 'write' ? (
                                        <div className="editor-preview">
                                            {content.trim() === '' ? (
                                                <p className="editor-preview-empty">
                                                    还没有正文内容，开始写作后这里会显示预览。
                                                </p>
                                            ) : (
                                                <div
                                                    className="prose editor-preview-body"
                                                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                                                />
                                            )}
                                        </div>
                                    ) : null}

                                    {dragging ? (
                                        <div className="editor-drop-overlay">
                                            <Upload aria-hidden="true" />
                                            <span>松开上传图片</span>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="editor-writing-foot">
                                    <span>
                                        {uploading ? '图片上传中…' : '支持 Markdown、拖拽上传与媒体库'}
                                    </span>
                                    <div className="editor-writing-foot-actions">
                                        {editor.canUseMedia ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="xs"
                                                onClick={() => setMediaOpen(true)}
                                            >
                                                <ImagePlus aria-hidden="true" />
                                                媒体库
                                            </Button>
                                        ) : (
                                            <span className="text-[10.5px] text-ink-faint">
                                                当前账号无媒体库权限
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </div>

                        <aside className="editor-sidebar">
                            <MetaBox title="发布设置">
                                <div className="grid gap-3">
                                    <label className="editor-field">
                                        <span className="editor-field-head">发布到圈子</span>
                                        <select
                                            className="editor-field-select"
                                            value={selectedCircle}
                                            onChange={(event) =>
                                                setSelectedCircle(Number(event.target.value))
                                            }
                                            required
                                        >
                                            {editor.circles.map((item) => (
                                                <option key={item.id} value={item.id}>
                                                    {item.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>

                                    <div className="editor-field">
                                        <span className="editor-field-head">帖子类型</span>
                                        <div className="editor-field-choices" role="group" aria-label="帖子类型">
                                            {editor.topicKinds.map((item) => (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    className={kind === item.value ? 'is-active' : ''}
                                                    aria-pressed={kind === item.value}
                                                    onClick={() => setKind(item.value)}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {editor.showTagInput ? (
                                        <div className="editor-field">
                                            <span className="editor-field-head">话题</span>
                                            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[6px] border border-line bg-surface px-2 py-1.5">
                                                {tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="inline-flex items-center gap-1 rounded-[4px] bg-brand-soft px-2 py-1 text-[10.5px] text-brand"
                                                    >
                                                        <TagIcon className="size-3" strokeWidth={1.8} aria-hidden="true" />
                                                        {tag}
                                                        <button
                                                            type="button"
                                                            className="ml-0.5 rounded-[2px] text-brand/70 hover:text-brand"
                                                            onClick={() => removeTag(tag)}
                                                            aria-label={`移除话题 ${tag}`}
                                                        >
                                                            <X className="size-3" strokeWidth={2} aria-hidden="true" />
                                                        </button>
                                                    </span>
                                                ))}
                                                <Input
                                                    className="h-7 min-w-[96px] flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                                                    value={tagInput}
                                                    onChange={(event) => setTagInput(event.target.value)}
                                                    onKeyDown={onTagKeyDown}
                                                    placeholder={tags.length === 0 ? '输入话题后按回车' : '继续添加…'}
                                                    maxLength={20}
                                                    aria-label="帖子话题"
                                                />
                                            </div>
                                            <p className="text-[10.5px] leading-5 text-ink-faint">
                                                最多 8 个，像文章标签一样用于归类和筛选。
                                            </p>
                                            {editor.tagSuggestions.filter((tag) => !tags.includes(tag)).length > 0 ? (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="text-[10px] text-ink-faint">常用</span>
                                                    {editor.tagSuggestions
                                                        .filter((tag) => !tags.includes(tag))
                                                        .slice(0, 8)
                                                        .map((tag) => (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                className="rounded-[999px] bg-surface-2 px-2 py-0.5 text-[10.5px] text-ink-mute hover:text-brand"
                                                                onClick={() => addTag(tag)}
                                                            >
                                                                #{tag}
                                                            </button>
                                                        ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {editor.requiresReview ? (
                                        <p className="editor-meta-note">
                                            发布后需要管理员审核，审核通过前仅你和管理员可见。
                                        </p>
                                    ) : null}
                                </div>
                            </MetaBox>

                            <MetaBox title="所属圈子">
                                {circle ? (
                                    <div className="grid gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-brand-soft">
                                                {circle.icon !== '' ? (
                                                    <img className="size-full object-cover" src={circle.icon} alt="" />
                                                ) : (
                                                    <CircleDot className="size-4 text-brand" strokeWidth={1.8} />
                                                )}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-[12px] font-medium text-ink">
                                                    {circle.name}
                                                </p>
                                                <p className="truncate text-[10.5px] text-ink-faint">
                                                    /circle/{circle.slug}
                                                </p>
                                            </div>
                                        </div>
                                        {circle.description !== '' ? (
                                            <p className="text-[11px] leading-5 text-ink-mute">
                                                {circle.description}
                                            </p>
                                        ) : null}
                                        <a className="editor-gate-link !text-[11px]" href={circle.url}>
                                            查看圈子
                                        </a>
                                    </div>
                                ) : (
                                    <p className="editor-meta-note">请选择一个圈子。</p>
                                )}
                            </MetaBox>

                        </aside>
                    </div>
                </div>
            </form>

            <MediaLibrary
                open={mediaOpen}
                onOpenChange={setMediaOpen}
                mediaEndpoint={editor.mediaEndpoint}
                onSelect={(item) => {
                    insertMedia(item);
                    setMediaOpen(false);
                }}
            />
        </div>
    );
}
