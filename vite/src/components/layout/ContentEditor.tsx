import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    Clock3,
    Columns2,
    Eye,
    FileText,
    ImagePlus,
    Link2,
    LoaderCircle,
    PencilLine,
    Plus,
    Save,
    Send,
    Upload,
    X,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import MarkdownToolbar from '../content/MarkdownToolbar';
import MediaLibrary from '../content/MediaLibrary';
import { renderMarkdown } from '../../lib/markdown';
import { errorMessage, readPayload } from '../../lib/user';
import { termsFrom } from '../../lib/content';
import type { ContentItem, TermItem } from '../../lib/content';
import type { MediaItem, UserApiEndpoints, UserProfile } from '../../types';

interface Props {
    api: UserApiEndpoints;
    profile: UserProfile;
    cid?: number;
    onSaved?: () => void;
}

type Feedback = { tone: 'success' | 'error'; text: string };
type SaveState = 'draft' | 'publish' | null;
type ViewMode = 'write' | 'split' | 'preview';

interface SnapshotInput {
    title: string;
    text: string;
    status: string;
    slug: string;
    categories: number[];
    tags: string[];
    allowComment: boolean;
}

function snapshotOf(value: SnapshotInput): string {
    return JSON.stringify([
        value.title.trim(),
        value.text,
        value.status,
        value.slug.trim(),
        [...value.categories].sort((left, right) => left - right),
        [...value.tags].sort(),
        value.allowComment,
    ]);
}

function MetaBox({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="editor-meta-box">
            <div className="editor-meta-head">{title}</div>
            <div className="editor-meta-body">{children}</div>
        </section>
    );
}

function countWords(value: string): number {
    const text = value.trim();
    if (text === '') {
        return 0;
    }

    const latin = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
    const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
    return latin + cjk;
}

export default function ContentEditor({ api, profile, cid = 0, onSaved }: Props) {
    const initialId = Number.isFinite(cid) && cid > 0 ? Math.round(cid) : 0;
    const [editingId, setEditingId] = useState(initialId);
    const [categories, setCategories] = useState<TermItem[]>([]);
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [slug, setSlug] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [allowComment, setAllowComment] = useState(true);
    const [status, setStatus] = useState('draft');
    const [created, setCreated] = useState('');
    const [modified, setModified] = useState('');
    const [permalink, setPermalink] = useState('');
    const [loading, setLoading] = useState(initialId > 0);
    const [saving, setSaving] = useState<SaveState>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [dirty, setDirty] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const baseline = useRef('');
    const currentSnapshot = snapshotOf({
        title,
        text,
        status,
        slug,
        categories: selectedCategories,
        tags,
        allowComment,
    });

    useEffect(() => {
        if (baseline.current === '') {
            return;
        }

        setDirty(currentSnapshot !== baseline.current);
    }, [currentSnapshot]);

    useEffect(() => {
        if (!dirty) {
            return;
        }

        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        void (async () => {
            try {
                const requests: Promise<Response>[] = [
                    fetch(api.content.categories, {
                        credentials: 'same-origin',
                        headers: { Accept: 'application/json' },
                        signal: controller.signal,
                    }),
                ];

                if (initialId > 0) {
                    requests.push(
                        fetch(`${api.content.item}/${initialId}`, {
                            credentials: 'same-origin',
                            headers: { Accept: 'application/json' },
                            signal: controller.signal,
                        })
                    );
                }

                const responses = await Promise.all(requests);
                const categoryPayload = await readPayload(responses[0]);
                if (active && responses[0].ok) {
                    setCategories(termsFrom(categoryPayload));
                }

                if (initialId > 0 && responses[1]) {
                    const itemPayload = await readPayload(responses[1]);
                    if (!responses[1].ok) {
                        throw new Error(errorMessage(itemPayload, '读取文章失败'));
                    }

                    const item =
                        itemPayload?.data && typeof itemPayload.data === 'object'
                            ? (itemPayload.data as ContentItem)
                            : null;
                    if (!item) {
                        throw new Error('文章数据不完整');
                    }

                    if (active) {
                        const nextStatus = item.status === 'draft' ? 'draft' : 'publish';
                        const nextCategories = item.categories.map((category) => category.mid);
                        const nextTags = item.tags.map((tag) => tag.name);
                        setTitle(item.title);
                        setText(item.text);
                        setSlug(item.slug);
                        setStatus(nextStatus);
                        setSelectedCategories(nextCategories);
                        setTags(nextTags);
                        setAllowComment(item.allowComment);
                        setCreated(item.created);
                        setModified(item.modified);
                        setPermalink(item.permalink);
                        baseline.current = snapshotOf({
                            title: item.title,
                            text: item.text,
                            status: nextStatus,
                            slug: item.slug,
                            categories: nextCategories,
                            tags: nextTags,
                            allowComment: item.allowComment,
                        });
                    }
                } else if (active) {
                    baseline.current = snapshotOf({
                        title: '',
                        text: '',
                        status: 'draft',
                        slug: '',
                        categories: [],
                        tags: [],
                        allowComment: true,
                    });
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取文章失败',
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
    }, [api.content.categories, api.content.item, initialId]);

    const stats = useMemo(() => {
        const words = countWords(text);
        return {
            chars: text.length,
            words,
            minutes: words === 0 ? 0 : Math.max(1, Math.round(words / 320)),
        };
    }, [text]);

    const previewHtml = useMemo(() => renderMarkdown(text), [text]);

    const addTag = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const value = tagInput.trim().replace(/^#/, '');
        if (value === '') {
            return;
        }

        setTags((current) =>
            current.includes(value) || current.length >= 12 ? current : [...current, value]
        );
        setTagInput('');
    };

    const toggleCategory = (mid: number, checked: boolean) => {
        setSelectedCategories((current) =>
            checked ? [...new Set([...current, mid])] : current.filter((value) => value !== mid)
        );
    };

    const insertSnippet = (snippet: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setText((current) => current + snippet);
            return;
        }

        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const next = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
        setText(next);
        window.requestAnimationFrame(() => {
            textarea.focus();
            const cursor = start + snippet.length;
            textarea.setSelectionRange(cursor, cursor);
        });
    };

    const insertMedia = (item: MediaItem) => {
        const alt = item.title.replace(/[[\]]/g, '').trim();
        insertSnippet(`\n![${alt}](${item.url})\n`);
    };

    const uploadFiles = async (files: File[]) => {
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length === 0 || uploading) {
            return;
        }

        setUploading(true);
        setFeedback(null);

        try {
            for (const file of images) {
                const body = new FormData();
                body.append('file', file);
                const response = await fetch(api.content.media, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    body,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '图片上传失败'));
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

    const save = async (nextStatus: 'draft' | 'publish') => {
        if (saving !== null) {
            return;
        }

        if (title.trim() === '') {
            setFeedback({ tone: 'error', text: '请先填写文章标题' });
            return;
        }

        setSaving(nextStatus);
        setFeedback(null);

        try {
            const endpoint =
                editingId > 0 ? `${api.content.posts}/${editingId}` : api.content.posts;
            const response = await fetch(endpoint, {
                method: editingId > 0 ? 'PATCH' : 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: title.trim(),
                    text,
                    slug: slug.trim(),
                    status: nextStatus,
                    categories: selectedCategories,
                    tags,
                    allowComment,
                }),
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '文章保存失败'));
            }

            const saved =
                payload?.data && typeof payload.data === 'object'
                    ? (payload.data as ContentItem)
                    : null;
            if (saved) {
                setEditingId(saved.cid);
                setSlug(saved.slug);
                setCreated(saved.created);
                setModified(saved.modified);
                setPermalink(saved.permalink);
                setStatus(nextStatus);
                window.history.replaceState(
                    window.history.state,
                    '',
                    `${api.pages.editor}?cid=${saved.cid}`
                );
            }

            baseline.current = snapshotOf({
                title,
                text,
                status: nextStatus,
                slug: saved?.slug ?? slug,
                categories: selectedCategories,
                tags,
                allowComment,
            });
            setDirty(false);
            setFeedback({
                tone: 'success',
                text: nextStatus === 'draft' ? '草稿已保存。' : '文章已发布。',
            });

            if (onSaved) {
                onSaved();
            }
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '文章保存失败',
            });
        } finally {
            setSaving(null);
        }
    };

    if (loading) {
        return (
            <div className="editor-loading" aria-busy="true" aria-label="正在读取文章">
                <span />
                <span />
                <span />
            </div>
        );
    }

    const statusLabel =
        status === 'draft' ? '草稿' : status === 'publish' ? '已发布' : status || '未保存';

    return (
        <div className="editor-workspace">
            <div className="editor-toolbar">
                <a className="editor-back" href={api.pages.content}>
                    <ArrowLeft aria-hidden="true" />
                    <span>内容管理</span>
                </a>
                <div className="editor-toolbar-title">
                    <span>{editingId > 0 ? '编辑文章' : '新建文章'}</span>
                    <Badge variant={status === 'publish' ? 'default' : 'secondary'}>
                        {statusLabel}
                    </Badge>
                    {dirty ? <span className="editor-dirty">未保存</span> : null}
                </div>
                <div className="editor-toolbar-actions">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => void save('draft')}
                    >
                        {saving === 'draft' ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : (
                            <Save aria-hidden="true" />
                        )}
                        保存草稿
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        disabled={saving !== null}
                        onClick={() => void save('publish')}
                    >
                        {saving === 'publish' ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : (
                            <Send aria-hidden="true" />
                        )}
                        {status === 'publish' ? '更新文章' : '发布文章'}
                    </Button>
                </div>
            </div>

            <div className="editor-canvas">
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

                <div className="editor-layout">
                    <div className="editor-primary">
                        <section className="editor-card editor-title-card">
                            <Input
                                className="editor-title-input"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="添加标题…"
                                maxLength={150}
                                aria-label="文章标题"
                                autoFocus={editingId === 0}
                            />
                            <div className="editor-permalink">
                                <Link2 className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                                <span>固定链接</span>
                                <Input
                                    value={slug}
                                    onChange={(event) => setSlug(event.target.value)}
                                    placeholder="留空自动生成"
                                    maxLength={150}
                                    aria-label="文章固定链接"
                                />
                                {permalink !== '' ? (
                                    <a href={permalink} target="_blank" rel="noreferrer">
                                        预览
                                    </a>
                                ) : null}
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
                                    <span>{stats.chars} 字</span>
                                    <span>{stats.words} 词</span>
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
                                            onChange={setText}
                                            onImage={() => setMediaOpen(true)}
                                            disabled={saving !== null}
                                        />
                                        <Textarea
                                            ref={textareaRef}
                                            className="markdown-input editor-markdown-input"
                                            value={text}
                                            onChange={(event) => setText(event.target.value)}
                                            onPaste={(event) => {
                                                const files = Array.from(
                                                    event.clipboardData.files ?? []
                                                ).filter((file) => file.type.startsWith('image/'));
                                                if (files.length > 0) {
                                                    event.preventDefault();
                                                    void uploadFiles(files);
                                                }
                                            }}
                                            placeholder="开始写作…支持 Markdown、代码块、链接与图片；可直接拖拽或粘贴图片上传。"
                                            aria-label="文章正文"
                                            spellCheck={false}
                                        />
                                    </div>
                                ) : null}

                                {viewMode !== 'write' ? (
                                    <div className="editor-preview">
                                        {text.trim() === '' ? (
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
                                    {uploading ? '图片上传中…' : '支持拖拽、粘贴与媒体库插图'}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => setMediaOpen(true)}
                                >
                                    <ImagePlus aria-hidden="true" />
                                    媒体库
                                </Button>
                            </div>
                        </section>
                    </div>

                    <aside className="editor-sidebar">
                        <MetaBox title="发布">
                            <div className="editor-publish-state">
                                <span>
                                    {status === 'publish' ? (
                                        <CheckCircle2 aria-hidden="true" />
                                    ) : (
                                        <Clock3 aria-hidden="true" />
                                    )}
                                    状态
                                </span>
                                <Badge variant={status === 'publish' ? 'default' : 'secondary'}>
                                    {statusLabel}
                                </Badge>
                            </div>
                            <p className="editor-meta-note">
                                作者：{profile.screenName || profile.name}
                                {created !== '' ? ` · 创建于 ${created.slice(0, 10)}` : ''}
                            </p>
                            <div className="editor-publish-actions">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={saving !== null}
                                    onClick={() => void save('draft')}
                                >
                                    <Save aria-hidden="true" />
                                    保存草稿
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={saving !== null}
                                    onClick={() => void save('publish')}
                                >
                                    <Send aria-hidden="true" />
                                    发布
                                </Button>
                            </div>
                        </MetaBox>

                        <MetaBox title="分类">
                            {categories.length > 0 ? (
                                <div className="content-checks">
                                    {categories.map((category) => (
                                        <label key={category.mid} className="content-check">
                                            <Checkbox
                                                checked={selectedCategories.includes(category.mid)}
                                                onCheckedChange={(checked) =>
                                                    toggleCategory(category.mid, checked === true)
                                                }
                                            />
                                            <span className="truncate">{category.name}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <p className="editor-meta-note">
                                    暂无可选分类，发布后会保存在默认分类。
                                </p>
                            )}
                        </MetaBox>

                        <MetaBox title="标签">
                            <form className="content-tag-form" onSubmit={addTag}>
                                <Input
                                    value={tagInput}
                                    onChange={(event) => setTagInput(event.target.value)}
                                    placeholder="输入标签后回车"
                                    maxLength={150}
                                    aria-label="添加标签"
                                />
                                <Button
                                    type="submit"
                                    variant="outline"
                                    size="icon-sm"
                                    aria-label="添加标签"
                                >
                                    <Plus aria-hidden="true" />
                                </Button>
                            </form>
                            {tags.length > 0 ? (
                                <div className="content-tag-list">
                                    {tags.map((tag) => (
                                        <Badge key={tag} variant="secondary" className="content-tag">
                                            {tag}
                                            <button
                                                type="button"
                                                className="content-tag-remove"
                                                aria-label={`移除标签 ${tag}`}
                                                onClick={() =>
                                                    setTags((current) =>
                                                        current.filter((value) => value !== tag)
                                                    )
                                                }
                                            >
                                                <X aria-hidden="true" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="editor-meta-note">
                                    不存在的标签会在发布时自动创建。
                                </p>
                            )}
                        </MetaBox>

                        <MetaBox title="讨论">
                            <label className="content-check">
                                <Checkbox
                                    checked={allowComment}
                                    onCheckedChange={(checked) => setAllowComment(checked === true)}
                                />
                                <span>允许评论</span>
                            </label>
                            {modified !== '' ? (
                                <p className="editor-meta-note">最近更新：{modified.slice(0, 16)}</p>
                            ) : null}
                        </MetaBox>

                        <MetaBox title="文档">
                            <p className="editor-meta-note">
                                <FileText className="mr-1 inline size-3.5" aria-hidden="true" />
                                正文使用 Markdown 编写，发布后由 Typecho 渲染。
                            </p>
                        </MetaBox>
                    </aside>
                </div>
            </div>

            <MediaLibrary
                open={mediaOpen}
                onOpenChange={setMediaOpen}
                api={api}
                onSelect={insertMedia}
            />
        </div>
    );
}
