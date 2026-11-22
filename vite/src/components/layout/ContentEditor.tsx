import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import {
    ArrowLeft,
    Blocks,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Columns2,
    Eye,
    FileText,
    ImagePlus,
    Images,
    Link2,
    LoaderCircle,
    PencilLine,
    Plus,
    Save,
    Send,
    Trash2,
    Upload,
    UserRound,
    X,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import ComponentLibrary from '../content/ComponentLibrary';
import DownloadSettings, { downloadConfigError } from '../content/DownloadSettings';
import MetaBox from '../content/EditorMetaBox';
import MarkdownToolbar from '../content/MarkdownToolbar';
import MediaLibrary from '../content/MediaLibrary';
import {
    attachmentsInText,
    attachmentReference,
    mergeAttachments,
    resolveAttachmentPreview,
    stripMarkdownMarker,
} from '../../lib/attachments';
import { renderMarkdown } from '../../lib/markdown';
import { notifyError, notifySuccess } from '../../lib/notify';
import { errorMessage, readPayload } from '../../lib/user';
import { termsFrom } from '../../lib/content';
import type { ContentItem, TermItem } from '../../lib/content';
import type { DownloadConfig } from '../../lib/downloads';
import type {
    ArticleField,
    MediaItem,
    UserApiEndpoints,
    UserProfile,
} from '../../types';

interface Props {
    api: UserApiEndpoints;
    profile: UserProfile;
    cid?: number;
    fields?: ArticleField[];
    onSaved?: () => void;
}

type SaveState = 'draft' | 'publish' | null;
type ViewMode = 'write' | 'split' | 'preview';

const EMPTY_FIELDS: ArticleField[] = [];
const DOWNLOAD_FIELDS = new Set([
    'Download_Enabled',
    'Download_Url',
    'Download_Paid',
    'Download_Price',
]);

interface SnapshotInput {
    title: string;
    text: string;
    status: string;
    slug: string;
    categories: number[];
    tags: string[];
    allowComment: boolean;
    fields: Record<string, string>;
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
        Object.entries(value.fields).sort(([left], [right]) => left.localeCompare(right)),
    ]);
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

function cleanEditorText(value: string, attachmentIds: number[] = []): string {
    const text = stripMarkdownMarker(value);
    if (attachmentIds.length === 0) {
        return text;
    }

    const allowed = new Set(attachmentIds);
    return text.replace(
        /^\s{0,3}\[(\d{1,12})\]:[^\n]*(?:\n|$)/gm,
        (match, rawId: string) => (allowed.has(Number(rawId)) ? '' : match)
    );
}

export default function ContentEditor({
    api,
    profile,
    cid = 0,
    fields = EMPTY_FIELDS,
    onSaved,
}: Props) {
    const initialId = Number.isFinite(cid) && cid > 0 ? Math.round(cid) : 0;
    const [editingId, setEditingId] = useState(initialId);
    const [categories, setCategories] = useState<TermItem[]>([]);
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState<MediaItem[]>([]);
    const [slug, setSlug] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [allowComment, setAllowComment] = useState(true);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(fields.map((field) => [field.name, field.value]))
    );
    const [status, setStatus] = useState('draft');
    const [created, setCreated] = useState('');
    const [modified, setModified] = useState('');
    const [permalink, setPermalink] = useState('');
    const [loading, setLoading] = useState(initialId > 0);
    const [saving, setSaving] = useState<SaveState>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('split');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [fieldMediaTarget, setFieldMediaTarget] = useState<string | null>(null);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [dirty, setDirty] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const baseline = useRef('');
    const articleFields = fields.filter((field) => !DOWNLOAD_FIELDS.has(field.name));
    const download: DownloadConfig = {
        enabled: ['1', 'true'].includes(fieldValues.Download_Enabled ?? ''),
        url: fieldValues.Download_Url ?? '',
        paid: ['1', 'true'].includes(fieldValues.Download_Paid ?? ''),
        price: fieldValues.Download_Price ?? '0.00',
    };
    const currentSnapshot = snapshotOf({
        title,
        text,
        status,
        slug,
        categories: selectedCategories,
        tags,
        allowComment,
        fields: fieldValues,
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
                        const nextText = cleanEditorText(
                            item.text,
                            (item.attachments ?? []).map((attachment) => attachment.id)
                        );
                        const nextCategories = item.categories.map((category) => category.mid);
                        const nextTags = item.tags.map((tag) => tag.name);
                        const nextFields = {
                            ...Object.fromEntries(fields.map((field) => [field.name, field.value])),
                            ...(item.fields ?? {}),
                        };
                        setTitle(item.title);
                        setText(nextText);
                        setAttachments(item.attachments ?? []);
                        setSlug(item.slug);
                        setStatus(nextStatus);
                        setSelectedCategories(nextCategories);
                        setTags(nextTags);
                        setAllowComment(item.allowComment);
                        setFieldValues(nextFields);
                        setCreated(item.created);
                        setModified(item.modified);
                        setPermalink(item.permalink);
                        baseline.current = snapshotOf({
                            title: item.title,
                            text: nextText,
                            status: nextStatus,
                            slug: item.slug,
                            categories: nextCategories,
                            tags: nextTags,
                            allowComment: item.allowComment,
                            fields: nextFields,
                        });
                    }
                } else if (active) {
                    const nextFields = Object.fromEntries(
                        fields.map((field) => [field.name, field.value])
                    );
                    setFieldValues(nextFields);
                    baseline.current = snapshotOf({
                        title: '',
                        text: '',
                        status: 'draft',
                        slug: '',
                        categories: [],
                        tags: [],
                        allowComment: true,
                        fields: nextFields,
                    });
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    notifyError(
                        reason instanceof Error ? reason.message : '读取文章失败'
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
    }, [api.content.categories, api.content.item, fields, initialId]);

    const stats = useMemo(() => {
        const words = countWords(text);
        return {
            chars: text.length,
            words,
            minutes: words === 0 ? 0 : Math.max(1, Math.round(words / 320)),
        };
    }, [text]);

    useEffect(() => {
        if (viewMode !== 'split') {
            return;
        }

        const editor = textareaRef.current;
        const preview = previewRef.current;
        if (!editor || !preview) {
            return;
        }

        let editorStamp = 0;
        let previewStamp = 0;
        const sync = (from: HTMLElement, to: HTMLElement) => {
            if (window.innerWidth <= 760) {
                return;
            }

            const fromRange = from.scrollHeight - from.clientHeight;
            const toRange = to.scrollHeight - to.clientHeight;
            if (fromRange <= 0 || toRange <= 0) {
                return;
            }

            const ratio = Math.min(1, Math.max(0, from.scrollTop / fromRange));
            to.scrollTop = ratio * toRange;
        };
        const onEditorScroll = () => {
            const now = performance.now();
            if (now - previewStamp < 80) {
                return;
            }
            editorStamp = now;
            sync(editor, preview);
        };
        const onPreviewScroll = () => {
            const now = performance.now();
            if (now - editorStamp < 80) {
                return;
            }
            previewStamp = now;
            sync(preview, editor);
        };

        editor.addEventListener('scroll', onEditorScroll, { passive: true });
        preview.addEventListener('scroll', onPreviewScroll, { passive: true });

        return () => {
            editor.removeEventListener('scroll', onEditorScroll);
            preview.removeEventListener('scroll', onPreviewScroll);
        };
    }, [viewMode]);

    const bodyAttachments = useMemo(
        () => attachmentsInText(text, attachments),
        [attachments, text]
    );
    const previewHtml = useMemo(
        () => renderMarkdown(resolveAttachmentPreview(text, attachments)),
        [attachments, text]
    );

    const insertSnippet = (snippet: string, incoming: MediaItem[] = []) => {
        if (incoming.length > 0) {
            setAttachments((current) => mergeAttachments(current, incoming));
        }

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
        insertSnippet(`\n${attachmentReference(item)}\n`, [item]);
    };

    const removeAttachmentReference = (item: MediaItem) => {
        const pattern = new RegExp(`\\n?!\\[[^\\]]*\\]\\[${item.id}\\]\\n?`, 'g');
        setText((current) => current.replace(pattern, '\n'));
        setAttachments((current) => current.filter((entry) => entry.id !== item.id));
    };

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

    const selectMedia = (item: MediaItem) => {
        if (fieldMediaTarget !== null) {
            setFieldValues((current) => ({ ...current, [fieldMediaTarget]: item.url }));
            setFieldMediaTarget(null);
            return;
        }

        insertMedia(item);
    };

    const openBodyMedia = () => {
        setFieldMediaTarget(null);
        setMediaOpen(true);
    };

    const openFieldMedia = (name: string) => {
        setFieldMediaTarget(name);
        setMediaOpen(true);
    };

    const setFieldValue = (name: string, value: string) => {
        setFieldValues((current) => ({ ...current, [name]: value }));
    };

    const setDownload = (next: DownloadConfig) => {
        setFieldValues((current) => ({
            ...current,
            Download_Enabled: next.enabled ? '1' : '0',
            Download_Url: next.url,
            Download_Paid: next.paid ? '1' : '0',
            Download_Price: next.price,
        }));
    };

    const uploadFiles = async (files: File[]) => {
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length === 0 || uploading) {
            return;
        }

        setUploading(true);
        const uploaded: MediaItem[] = [];

        try {
            for (const file of images) {
                try {
                    const body = new FormData();
                    body.append('file', file);
                    const response = await fetch(api.content.media, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {
                            Accept: 'application/json',
                            'X-Upload-Purpose': 'article',
                        },
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
                        uploaded.push(item);
                    }
                } catch (reason) {
                    notifyError(
                        reason instanceof Error ? reason.message : '图片上传失败'
                    );
                }
            }

            if (uploaded.length > 0) {
                insertSnippet(
                    '\n' + uploaded.map((item) => attachmentReference(item)).join('\n\n') + '\n',
                    uploaded
                );
                notifySuccess(`已插入 ${uploaded.length} 张图片附件。`);
            }
        } finally {
            setUploading(false);
        }
    };

    const save = async (nextStatus: 'draft' | 'publish') => {
        if (saving !== null) {
            return;
        }

        if (title.trim() === '') {
            notifyError('请先填写文章标题。');
            return;
        }

        const downloadError = downloadConfigError(download);
        if (downloadError) {
            notifyError(downloadError);
            return;
        }

        setSaving(nextStatus);

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
                    fields: fieldValues,
                    attachments: bodyAttachments.map((item) => item.id),
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
                const savedText = cleanEditorText(
                    saved.text,
                    (saved.attachments ?? []).map((attachment) => attachment.id)
                );
                setEditingId(saved.cid);
                setText(savedText);
                setAttachments(saved.attachments ?? attachments);
                setSlug(saved.slug);
                setCreated(saved.created);
                setModified(saved.modified);
                setPermalink(saved.permalink);
                if (saved.fields) {
                    setFieldValues((current) => ({ ...current, ...saved.fields }));
                }
                setStatus(nextStatus);
                window.history.replaceState(
                    window.history.state,
                    '',
                    `${api.pages.editor}?cid=${saved.cid}`
                );
            }

            baseline.current = snapshotOf({
                title,
                text: saved
                    ? cleanEditorText(
                          saved.text,
                          (saved.attachments ?? []).map((attachment) => attachment.id)
                      )
                    : text,
                status: nextStatus,
                slug: saved?.slug ?? slug,
                categories: selectedCategories,
                tags,
                allowComment,
                fields: saved?.fields ?? fieldValues,
            });
            setDirty(false);
            notifySuccess(nextStatus === 'draft' ? '草稿已保存。' : '文章已发布。');

            if (onSaved) {
                onSaved();
            }
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '文章保存失败');
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

    const renderArticleField = (field: ArticleField) => {
        const value = fieldValues[field.name] ?? '';
        const type = field.type.toLowerCase();
        const selectedValues = value
            .split(',')
            .map((item) => item.trim())
            .filter((item) => item !== '');

        const control =
            type === 'select' ? (
                <select
                    className="editor-field-select"
                    value={value}
                    onChange={(event) => setFieldValue(field.name, event.target.value)}
                    aria-label={field.label}
                >
                    <option value="">未选择</option>
                    {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : type === 'radio' && field.options.length > 0 ? (
                <div className="editor-field-choices" role="group" aria-label={field.label}>
                    {field.options.map((option) => {
                        const active = value === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                className={active ? 'is-active' : ''}
                                aria-pressed={active}
                                onClick={() => setFieldValue(field.name, option.value)}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            ) : type === 'checkbox' && field.options.length > 0 ? (
                <div className="content-checks">
                    {field.options.map((option) => (
                        <label key={option.value} className="content-check">
                            <Checkbox
                                checked={selectedValues.includes(option.value)}
                                onCheckedChange={(checked) => {
                                    const next = checked
                                        ? [...new Set([...selectedValues, option.value])]
                                        : selectedValues.filter(
                                              (item) => item !== option.value
                                          );
                                    setFieldValue(field.name, next.join(','));
                                }}
                            />
                            <span>{option.label}</span>
                        </label>
                    ))}
                </div>
            ) : type === 'textarea' ? (
                <Textarea
                    rows={3}
                    value={value}
                    onChange={(event) => setFieldValue(field.name, event.target.value)}
                    placeholder={field.description || field.label}
                    aria-label={field.label}
                />
            ) : (
                <Input
                    value={value}
                    onChange={(event) => setFieldValue(field.name, event.target.value)}
                    placeholder={field.description || field.label}
                    aria-label={field.label}
                />
            );

        return (
            <div key={field.name} className="editor-field">
                <div className="editor-field-head">
                    <span>{field.label}</span>
                    {field.media ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => openFieldMedia(field.name)}
                        >
                            <ImagePlus aria-hidden="true" />
                            选择图片
                        </Button>
                    ) : null}
                </div>
                {control}
                {field.description !== '' ? (
                    <p className="editor-field-hint">{field.description}</p>
                ) : null}
            </div>
        );
    };

    const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!(event.ctrlKey || event.metaKey) || saving !== null) {
            return;
        }

        if (event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save('draft');
        } else if (event.key === 'Enter') {
            event.preventDefault();
            void save('publish');
        }
    };

    return (
        <div className="editor-workspace" onKeyDown={handleEditorKeyDown}>
            <header className="editor-topbar">
                <div className="editor-topbar-row">
                    <div className="editor-topbar-left">
                        <a className="editor-back" href={api.pages.content}>
                            <ArrowLeft aria-hidden="true" />
                            <span>内容管理</span>
                        </a>
                        <span className="editor-topbar-sep" aria-hidden="true">
                            /
                        </span>
                        <span className="editor-topbar-doc">
                            {editingId > 0 ? '编辑文章' : '新建文章'}
                        </span>
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
                <div className="editor-topbar-sub">
                    <span>Markdown · 附件 cid · 组件库 · 媒体库</span>
                    <span className="editor-shortcut">
                        <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存草稿
                        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> 发布
                    </span>
                </div>
            </header>

            <div className="editor-canvas">
                <div className="editor-layout">
                    <div className="editor-primary">
                        <section className="editor-card editor-title-card">
                            <Input
                                className="editor-title-input"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="输入文章标题"
                                maxLength={150}
                                aria-label="文章标题"
                                autoFocus={editingId === 0}
                            />
                            <div className="editor-document-meta">
                                <span>
                                    <UserRound
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    {profile.screenName || profile.name}
                                </span>
                                {created !== '' ? (
                                    <span>
                                        <CalendarDays
                                            className="size-3.5"
                                            strokeWidth={1.8}
                                            aria-hidden="true"
                                        />
                                        {created.slice(0, 10)}
                                    </span>
                                ) : null}
                                <span>{stats.chars} 字</span>
                                <span>{stats.words} 词</span>
                                <span>{bodyAttachments.length} 张图片</span>
                            </div>
                            <div className="editor-permalink">
                                <Link2
                                    className="size-3.5"
                                    strokeWidth={1.7}
                                    aria-hidden="true"
                                />
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
                                <div
                                    className="editor-view-switch"
                                    role="group"
                                    aria-label="编辑视图"
                                >
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
                                <div className="editor-writing-tools">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="xs"
                                        onClick={() => setLibraryOpen(true)}
                                        disabled={saving !== null}
                                    >
                                        <Blocks aria-hidden="true" />
                                        组件
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="xs"
                                        onClick={openBodyMedia}
                                        disabled={saving !== null}
                                    >
                                        <ImagePlus aria-hidden="true" />
                                        图片
                                    </Button>
                                    <div className="editor-stats">
                                        <span>{stats.chars} 字</span>
                                        <span>{stats.words} 词</span>
                                        <span>约 {stats.minutes} 分钟</span>
                                    </div>
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
                                            onImage={openBodyMedia}
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
                                                ).filter((file) =>
                                                    file.type.startsWith('image/')
                                                );
                                                if (files.length > 0) {
                                                    event.preventDefault();
                                                    void uploadFiles(files);
                                                }
                                            }}
                                            placeholder="开始写作。图片会以 ![文件名][附件ID] 写入，并由 Typecho 附件系统关联。"
                                            aria-label="文章正文"
                                            spellCheck={false}
                                        />
                                    </div>
                                ) : null}

                                {viewMode !== 'write' ? (
                                    <div className="editor-preview" ref={previewRef}>
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
                                        <span>松开上传图片附件</span>
                                    </div>
                                ) : null}
                            </div>

                            <div className="editor-writing-foot">
                                <span>
                                    {uploading
                                        ? '图片上传中…'
                                        : '支持拖拽、粘贴、组件、媒体库与附件 cid 引用'}
                                </span>
                                <div className="editor-writing-foot-actions">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="xs"
                                        onClick={() => setLibraryOpen(true)}
                                    >
                                        <Blocks aria-hidden="true" />
                                        插入组件
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="xs"
                                        onClick={openBodyMedia}
                                    >
                                        <Images aria-hidden="true" />
                                        媒体库
                                    </Button>
                                </div>
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

                        <DownloadSettings
                            value={download}
                            enabled={api.downloads.enabled}
                            paymentEnabled={api.downloads.paymentEnabled}
                            disabled={saving !== null}
                            onChange={setDownload}
                        />

                        <MetaBox title={`正文图片${bodyAttachments.length > 0 ? ` · ${bodyAttachments.length}` : ''}`}>
                            {bodyAttachments.length > 0 ? (
                                <div className="editor-attachment-grid">
                                    {bodyAttachments.map((item) => (
                                        <div key={item.id} className="editor-attachment">
                                            <img src={item.url} alt={item.title} loading="lazy" />
                                            <button
                                                type="button"
                                                aria-label={`从正文移除 ${item.title}`}
                                                onClick={() => removeAttachmentReference(item)}
                                            >
                                                <Trash2 aria-hidden="true" />
                                            </button>
                                            <span title={item.title}>#{item.id}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="editor-meta-note">
                                    暂无正文图片。图片从媒体库插入后会自动登记附件。
                                </p>
                            )}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={openBodyMedia}
                            >
                                <ImagePlus aria-hidden="true" />
                                打开媒体库
                            </Button>
                        </MetaBox>

                        {articleFields.length > 0 ? (
                            <MetaBox title="文章字段">
                                <div className="editor-fields">
                                    {articleFields.map(renderArticleField)}
                                </div>
                            </MetaBox>
                        ) : null}

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
                                        <Badge
                                            key={tag}
                                            variant="secondary"
                                            className="content-tag"
                                        >
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
                                    onCheckedChange={(checked) =>
                                        setAllowComment(checked === true)
                                    }
                                />
                                <span>允许评论</span>
                            </label>
                            {modified !== '' ? (
                                <p className="editor-meta-note">
                                    最近更新：{modified.slice(0, 16)}
                                </p>
                            ) : null}
                        </MetaBox>

                        <MetaBox title="文档">
                            <p className="editor-meta-note">
                                <FileText
                                    className="mr-1 inline size-3.5"
                                    aria-hidden="true"
                                />
                                正文使用 Markdown 保存，图片以附件 cid 引用，前台由
                                Typecho 渲染并自动关联媒体库。
                            </p>
                        </MetaBox>
                    </aside>
                </div>
            </div>

            <div className="editor-mobile-bar">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving !== null}
                    onClick={() => void save('draft')}
                >
                    <Save aria-hidden="true" />
                    草稿
                </Button>
                <Button
                    type="button"
                    size="sm"
                    disabled={saving !== null}
                    onClick={() => void save('publish')}
                >
                    <Send aria-hidden="true" />
                    {status === 'publish' ? '更新' : '发布'}
                </Button>
            </div>

            <ComponentLibrary
                open={libraryOpen}
                onOpenChange={setLibraryOpen}
                onInsert={insertSnippet}
                api={api}
                uploadPurpose="article"
            />

            <MediaLibrary
                open={mediaOpen}
                onOpenChange={(next) => {
                    setMediaOpen(next);
                    if (!next) {
                        setFieldMediaTarget(null);
                    }
                }}
                api={api}
                uploadPurpose="article"
                onSelect={selectMedia}
            />
        </div>
    );
}
