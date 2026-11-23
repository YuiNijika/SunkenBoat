import { useEffect, useMemo, useState } from 'react';
import {
    BadgeDollarSign,
    Code2,
    Image as ImageIcon,
    ImagePlus,
    Images,
    LockKeyhole,
    MessageSquareText,
    Minus,
    Quote,
    Search,
    Sparkles,
    Table2,
    Trash2,
    TriangleAlert,
} from 'lucide-react';
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
import { Textarea } from '../ui/textarea';
import MediaLibrary from './MediaLibrary';
import { renderMarkdown } from '../../lib/markdown';
import type { MediaItem, UploadPurpose, UserApiEndpoints } from '../../types';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInsert: (snippet: string, attachments?: MediaItem[]) => void;
    excluded?: Array<'login' | 'reply'>;
    api?: UserApiEndpoints;
    mediaEndpoint?: string;
    uploadPurpose?: UploadPurpose;
}

type FieldKind = 'text' | 'textarea' | 'select' | 'media' | 'media-list';

interface FieldDef {
    key: string;
    label: string;
    kind: FieldKind;
    placeholder?: string;
    options?: { value: string; label: string }[];
}

interface PickedMedia {
    item: MediaItem;
    caption: string;
}

type MediaValues = Record<string, PickedMedia[]>;

interface ComponentDef {
    id: string;
    label: string;
    family: string;
    hint: string;
    icon: typeof Sparkles;
    fields: FieldDef[];
    build: (values: Record<string, string>, media: MediaValues) => string;
}

const FAMILIES = [
    { id: 'access', label: '访问权限' },
    { id: 'notice', label: '提示与卡片' },
    { id: 'media', label: '图片与媒体' },
    { id: 'layout', label: '排版与结构' },
    { id: 'writing', label: '代码与引用' },
];

const ALERT_TONES = [
    { value: 'info', label: '信息' },
    { value: 'success', label: '成功' },
    { value: 'warning', label: '警告' },
    { value: 'danger', label: '危险' },
];

function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function iconSvg(name: 'lock' | 'message' | 'arrow'): string {
    const paths =
        name === 'message'
            ? '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8"/><path d="M8 13h5"/>'
            : name === 'arrow'
              ? '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>'
              : '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';

    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function attr(name: string, value: string): string {
    const clean = value.trim();
    return clean === '' ? '' : ` ${name}="${escapeAttr(clean)}"`;
}

function blockBody(value: string): string {
    return value.trim();
}

function imageAlt(item: MediaItem, fallback = ''): string {
    const value = (fallback.trim() || item.title || item.name || '图片')
        .replace(/[[\]\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return value.slice(0, 120) || '图片';
}

function imageReference(item: MediaItem, caption = '', altOverride = ''): string {
    const reference = `![${imageAlt(item, altOverride)}][${item.id}]`;
    return caption.trim() === ''
        ? reference
        : `${reference}\n\n*${caption.trim().replace(/\*/g, '')}*`;
}

const COMPONENTS: ComponentDef[] = [
    {
        id: 'login',
        label: '登录可见',
        family: 'access',
        hint: '访客未登录时只显示登录提示，受保护内容不会出现在页面源码里。',
        icon: LockKeyhole,
        fields: [{ key: 'content', label: '隐藏内容', kind: 'textarea', placeholder: '登录后可见的正文' }],
        build: (values) => `[login]\n${blockBody(values.content ?? '')}\n[/login]`,
    },
    {
        id: 'reply',
        label: '回复可见',
        family: 'access',
        hint: '当前用户在本篇发表并通过评论后，才显示这里的内容。',
        icon: MessageSquareText,
        fields: [{ key: 'content', label: '隐藏内容', kind: 'textarea', placeholder: '评论后可见的正文' }],
        build: (values) => `[reply]\n${blockBody(values.content ?? '')}\n[/reply]`,
    },
    {
        id: 'paid',
        label: '付费可见',
        family: 'access',
        hint: '购买后解锁正文。支持余额、积分和站点已配置的第三方支付通道。',
        icon: BadgeDollarSign,
        fields: [
            { key: 'title', label: '内容标题', kind: 'text', placeholder: '付费内容的标题' },
            { key: 'text', label: '简介', kind: 'textarea', placeholder: '购买前展示的简短说明' },
            { key: 'price', label: '售价（元）', kind: 'text', placeholder: '9.90' },
            { key: 'badge', label: '徽章', kind: 'text', placeholder: '付费阅读' },
            {
                key: 'modes',
                label: '支付方式',
                kind: 'select',
                options: [
                    { value: 'all', label: '全部可用方式' },
                    { value: 'balance', label: '仅余额' },
                    { value: 'points', label: '仅积分' },
                    { value: 'gateway', label: '仅第三方支付' },
                    { value: 'balance,points', label: '余额或积分' },
                    { value: 'balance,gateway', label: '余额或第三方支付' },
                    { value: 'points,gateway', label: '积分或第三方支付' },
                ],
            },
            {
                key: 'style',
                label: '展示样式',
                kind: 'select',
                options: [
                    { value: 'hero', label: 'Hero 首屏式（默认）' },
                    { value: 'card', label: '商品卡片式' },
                ],
            },
            { key: 'image', label: '商品卡片封面', kind: 'media', placeholder: '可选' },
            { key: 'content', label: '购买后可见内容', kind: 'textarea', placeholder: '支持 Markdown' },
        ],
        build: (values, media) => {
            const picked = media.image?.[0];
            const image = picked ? attr('image', picked.item.url) : '';

            return `[paid${attr('price', values.price ?? '')}${attr('title', values.title ?? '')}`
                + `${attr('text', values.text ?? '')}${attr('badge', values.badge ?? '')}`
                + `${attr('modes', values.modes ?? 'all')}${attr('style', values.style ?? 'hero')}`
                + `${image}]\n${blockBody(values.content ?? '')}\n[/paid]`;
        },
    },
    {
        id: 'alert',
        label: '提示块',
        family: 'notice',
        hint: '信息、成功、警告和危险四种语义提示。',
        icon: TriangleAlert,
        fields: [
            { key: 'type', label: '类型', kind: 'select', options: ALERT_TONES },
            { key: 'title', label: '标题', kind: 'text', placeholder: '选填' },
            { key: 'content', label: '内容', kind: 'textarea', placeholder: '支持 Markdown' },
        ],
        build: (values) =>
            `[alert${attr('type', values.type ?? 'info')}${attr('title', values.title ?? '')}]\n${blockBody(values.content ?? '')}\n[/alert]`,
    },
    {
        id: 'card',
        label: '内容卡片',
        family: 'notice',
        hint: '把一组内容收进带标题的卡片。',
        icon: Sparkles,
        fields: [
            { key: 'title', label: '标题', kind: 'text', placeholder: '选填' },
            { key: 'content', label: '内容', kind: 'textarea', placeholder: '支持 Markdown' },
        ],
        build: (values) =>
            `[card${attr('title', values.title ?? '')}]\n${blockBody(values.content ?? '')}\n[/card]`,
    },
    {
        id: 'spoiler',
        label: '折叠面板',
        family: 'notice',
        hint: '默认折叠，点击标题展开补充内容。',
        icon: Sparkles,
        fields: [
            { key: 'label', label: '折叠标题', kind: 'text', placeholder: '点击展开' },
            { key: 'content', label: '内容', kind: 'textarea', placeholder: '支持 Markdown' },
        ],
        build: (values) =>
            `[spoiler${attr('label', values.label ?? '点击展开')}]\n${blockBody(values.content ?? '')}\n[/spoiler]`,
    },
    {
        id: 'figure',
        label: '单张图片',
        family: 'media',
        hint: '从媒体库选择附件，正文写入文件名与附件 ID 引用。',
        icon: ImageIcon,
        fields: [
            { key: 'image', label: '图片附件', kind: 'media', placeholder: '从媒体库选择' },
            { key: 'alt', label: '替代文字', kind: 'text', placeholder: '留空使用文件名' },
            { key: 'caption', label: '图注', kind: 'text', placeholder: '选填' },
        ],
        build: (values, media) => {
            const picked = media.image?.[0];
            return picked
                ? imageReference(picked.item, values.caption ?? '', values.alt ?? '')
                : '';
        },
    },
    {
        id: 'gallery',
        label: '图片组',
        family: 'media',
        hint: '一次从媒体库选择多张附件，可逐张填写图注并调整顺序。',
        icon: Images,
        fields: [{ key: 'images', label: '图片附件', kind: 'media-list' }],
        build: (_values, media) =>
            (media.images ?? [])
                .map((picked) => imageReference(picked.item, picked.caption))
                .join('\n\n'),
    },
    {
        id: 'code',
        label: '代码块',
        family: 'writing',
        hint: '带语言标记的 fenced code block，前台会启用高亮与复制。',
        icon: Code2,
        fields: [
            { key: 'lang', label: '语言', kind: 'text', placeholder: 'php / js / bash' },
            { key: 'code', label: '代码', kind: 'textarea', placeholder: '// code' },
        ],
        build: (values) =>
            `\`\`\`${(values.lang ?? '').trim()}\n${(values.code ?? '').replace(/```/g, '\\`\\`\\`')}\n\`\`\``,
    },
    {
        id: 'quote',
        label: '引用',
        family: 'writing',
        hint: '引用一段话，可附出处。',
        icon: Quote,
        fields: [
            { key: 'content', label: '引用内容', kind: 'textarea', placeholder: '引用的文字' },
            { key: 'cite', label: '出处', kind: 'text', placeholder: '选填' },
        ],
        build: (values) => {
            const quote = blockBody(values.content ?? '')
                .split(/\r?\n/)
                .map((line) => `> ${line}`)
                .join('\n');
            const cite = (values.cite ?? '').trim();
            return cite === '' ? quote : `${quote}\n>\n> — ${cite}`;
        },
    },
    {
        id: 'table',
        label: '表格',
        family: 'layout',
        hint: '逗号分隔列头，每行用竖线分隔单元格。',
        icon: Table2,
        fields: [
            { key: 'head', label: '列头', kind: 'text', placeholder: '名称, 说明, 状态' },
            {
                key: 'rows',
                label: '数据行',
                kind: 'textarea',
                placeholder: '第一项|说明一|完成\n第二项|说明二|进行中',
            },
        ],
        build: (values) => {
            const heads = (values.head ?? '')
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item !== '');
            if (heads.length === 0) {
                return '';
            }

            const rows = (values.rows ?? '')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line !== '');

            return [
                `| ${heads.join(' | ')} |`,
                `| ${heads.map(() => '---').join(' | ')} |`,
                ...rows.map(
                    (line) =>
                        `| ${heads
                            .map((_, index) => (line.split('|')[index] ?? '').trim())
                            .join(' | ')} |`
                ),
            ].join('\n');
        },
    },
    {
        id: 'divider',
        label: '分割线',
        family: 'layout',
        hint: '在段落之间创建清晰的分隔。',
        icon: Minus,
        fields: [],
        build: () => '---',
    },
];

const INITIAL = COMPONENTS[0] as ComponentDef;
const EMPTY_EXCLUDED: Array<'login' | 'reply'> = [];

function defaultsOf(def: ComponentDef): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of def.fields) {
        if (field.kind === 'media' || field.kind === 'media-list') {
            continue;
        }
        values[field.key] = field.kind === 'select' ? (field.options?.[0]?.value ?? '') : '';
    }

    if (def.id === 'paid') {
        values.title = values.title || '付费内容';
        values.price = values.price || '9.90';
        values.badge = values.badge || '付费阅读';
        values.style = values.style || 'hero';
        values.modes = values.modes || 'all';
    }

    return values;
}

function previewFor(def: ComponentDef, values: Record<string, string>, media: MediaValues): string {
    const content = renderMarkdown(values.content ?? '');
    const title = escapeHtml((values.title ?? '').trim());
    const tone = ALERT_TONES.some((item) => item.value === values.type) ? values.type : 'info';

    if (def.id === 'login' || def.id === 'reply') {
        const reply = def.id === 'reply';
        return `<section class="content-gate-hero"><div class="content-gate-hero-inner"><span class="content-gate-icon">${iconSvg(reply ? 'message' : 'lock')}</span><div class="content-gate-copy"><h2 class="content-gate-title">${reply ? '参与讨论后继续阅读' : '登录后继续阅读'}</h2><span class="content-gate-divider"></span><p class="content-gate-text">${reply ? '登录账号并参与评论后，即可查看被隐藏的完整内容。' : '这是一个仅对已登录成员开放的内容区域。登录后即可查看完整正文。'}</p></div><span class="content-gate-btn">${reply ? '前往评论区' : '立即登录'}</span></div></section>`;
    }

    if (def.id === 'paid') {
        const paidTitle = escapeHtml((values.title ?? '').trim() || '付费内容');
        const paidText = escapeHtml((values.text ?? '').trim() || '购买后即可查看这一区块的完整内容。');
        const badge = escapeHtml((values.badge ?? '').trim() || '付费阅读');
        const price = escapeHtml((values.price ?? '').trim() || '0.00');
        const style = values.style === 'card' ? 'card' : 'hero';
        const image = media.image?.[0];
        const imageBlock = style === 'card' && image
            ? `<div class="paid-gate-media"><img src="${escapeAttr(image.item.url)}" alt="" loading="lazy"></div>`
            : '';
        const labels = (values.modes ?? 'all')
            .split(',')
            .map((mode) => {
                if (mode === 'balance') {
                    return '余额';
                }
                if (mode === 'points') {
                    return '积分';
                }
                if (mode === 'gateway') {
                    return '第三方支付';
                }
                return '';
            })
            .filter((label) => label !== '');
        const modes = labels.length > 0 && !(values.modes ?? '').includes('all')
            ? `<div class="paid-gate-modes">${labels.map((label) => `<span class="paid-gate-mode">${label}</span>`).join('')}</div>`
            : '';

        return `<section class="content-gate-hero paid-gate paid-gate-${style}"><div class="paid-gate-inner">${imageBlock}<div class="paid-gate-body"><span class="paid-gate-badge">${badge}</span><h2 class="content-gate-title paid-gate-title">${paidTitle}</h2><p class="content-gate-text paid-gate-text">${paidText}</p><div class="paid-gate-price"><span class="paid-gate-price-main"><small>¥</small>${price}</span></div>${modes}<span class="content-gate-btn paid-gate-buy">立即购买</span><p class="paid-gate-hint">这里是编辑器预览；购买按钮在发布后才生效。</p></div></div></section>`;
    }

    if (def.id === 'alert') {
        return `<div class="article-alert is-${tone}" role="note">${title === '' ? '' : `<p class="article-alert-title">${title}</p>`}<div class="article-alert-body">${content}</div></div>`;
    }

    if (def.id === 'card') {
        return `<div class="article-card">${title === '' ? '' : `<h3>${title}</h3>`}<div>${content}</div></div>`;
    }

    if (def.id === 'spoiler') {
        return `<details class="article-spoiler" open><summary>${escapeHtml(values.label || '点击展开')}</summary><div>${content}</div></details>`;
    }

    if (def.id === 'figure') {
        const picked = media.image?.[0];
        if (!picked) {
            return '<p class="text-sm text-ink-faint">从媒体库选择图片后显示预览。</p>';
        }

        return `<figure class="article-figure"><img src="${escapeAttr(picked.item.url)}" alt="${escapeAttr(imageAlt(picked.item, values.alt ?? ''))}" loading="lazy"><figcaption>${escapeHtml(values.caption ?? '')}</figcaption></figure>`;
    }

    if (def.id === 'gallery') {
        const picked = media.images ?? [];
        if (picked.length === 0) {
            return '<p class="text-sm text-ink-faint">从媒体库选择图片后显示预览。</p>';
        }

        return `<div class="article-gallery">${picked
            .map(
                (entry) =>
                    `<figure class="article-figure"><img src="${escapeAttr(entry.item.url)}" alt="${escapeAttr(imageAlt(entry.item))}" loading="lazy"><figcaption>${escapeHtml(entry.caption)}</figcaption></figure>`
            )
            .join('')}</div>`;
    }

    if (def.id === 'code') {
        return `<pre><code>${escapeHtml(values.code ?? '')}</code></pre>`;
    }

    if (def.id === 'quote') {
        const cite = (values.cite ?? '').trim();
        return `<blockquote>${content}${cite === '' ? '' : `<footer>— ${escapeHtml(cite)}</footer>`}</blockquote>`;
    }

    if (def.id === 'divider') {
        return '<hr>';
    }

    return renderMarkdown(def.build(values, media));
}

function pickedAttachments(media: MediaValues): MediaItem[] {
    const map = new Map<number, MediaItem>();
    for (const group of Object.values(media)) {
        for (const entry of group) {
            map.set(entry.item.id, entry.item);
        }
    }
    return [...map.values()];
}

interface PickerState {
    field: string;
    multiple: boolean;
}

export default function ComponentLibrary({
    open,
    onOpenChange,
    onInsert,
    excluded = EMPTY_EXCLUDED,
    api,
    mediaEndpoint,
    uploadPurpose = 'article',
}: Props) {
    const available = useMemo(
        () => COMPONENTS.filter((item) => !excluded.some((id) => id === item.id)),
        [excluded]
    );
    const initial = available[0] ?? INITIAL;
    const [type, setType] = useState(initial.id);
    const [query, setQuery] = useState('');
    const [values, setValues] = useState<Record<string, string>>(() => defaultsOf(initial));
    const [media, setMedia] = useState<MediaValues>({});
    const [picker, setPicker] = useState<PickerState | null>(null);

    const def = useMemo(
        () => available.find((item) => item.id === type) ?? initial,
        [available, initial, type]
    );
    const search = query.trim().toLowerCase();
    const visible = useMemo(
        () =>
            search === ''
                ? available.filter((item) => item.family === def.family)
                : available.filter((item) =>
                      `${item.label} ${item.hint} ${item.family}`.toLowerCase().includes(search)
                  ),
        [available, def.family, search]
    );
    const snippet = useMemo(() => def.build(values, media).trim(), [def, media, values]);
    const preview = useMemo(() => previewFor(def, values, media), [def, media, values]);
    const attachments = useMemo(() => pickedAttachments(media), [media]);

    useEffect(() => {
        if (!open) {
            return;
        }

        setValues(defaultsOf(def));
        setMedia({});
    }, [open, def]);

    useEffect(() => {
        if (!open || search === '' || visible.length === 0) {
            return;
        }

        if (!visible.some((item) => item.id === type)) {
            setType(visible[0].id);
        }
    }, [open, search, type, visible]);

    const selectFamily = (family: string) => {
        const first = available.find((item) => item.family === family);
        if (first) {
            setQuery('');
            setType(first.id);
        }
    };

    const chooseType = (id: string) => {
        setType(id);
    };

    const setValue = (key: string, value: string) => {
        setValues((current) => ({ ...current, [key]: value }));
    };

    const pickMedia = (items: MediaItem[]) => {
        if (!picker || items.length === 0) {
            return;
        }

        setMedia((current) => {
            const field = picker.field;
            const existing = picker.multiple ? current[field] ?? [] : [];
            const map = new Map<number, PickedMedia>(
                existing.map((entry) => [entry.item.id, entry])
            );

            for (const item of items) {
                map.set(item.id, map.get(item.id) ?? { item, caption: '' });
            }

            return { ...current, [field]: [...map.values()] };
        });
    };

    const removeMedia = (field: string, id: number) => {
        setMedia((current) => ({
            ...current,
            [field]: (current[field] ?? []).filter((entry) => entry.item.id !== id),
        }));
    };

    const setCaption = (field: string, id: number, caption: string) => {
        setMedia((current) => ({
            ...current,
            [field]: (current[field] ?? []).map((entry) =>
                entry.item.id === id ? { ...entry, caption } : entry
            ),
        }));
    };

    const insert = () => {
        if (snippet === '') {
            return;
        }

        onInsert(`\n${snippet}\n`, attachments);
        onOpenChange(false);
    };

    const renderMediaField = (field: FieldDef) => {
        const picked = media[field.key] ?? [];
        const multiple = field.kind === 'media-list';

        if (picked.length === 0) {
            return (
                <button
                    type="button"
                    className="grid w-full place-items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-6 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
                    onClick={() => setPicker({ field: field.key, multiple })}
                >
                    <ImagePlus className="size-5 text-ink-faint" aria-hidden="true" />
                    <span className="text-xs text-ink-mute">
                        {multiple ? '从媒体库选择多张图片' : '从媒体库选择图片'}
                    </span>
                    <span className="text-[10px] text-ink-faint">
                        使用 Typecho 附件，正文只写入文件名与附件 ID
                    </span>
                </button>
            );
        }

        return (
            <div className="grid gap-2">
                {picked.map((entry) => (
                    <div
                        key={entry.item.id}
                        className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-line bg-surface p-2"
                    >
                        <img
                            src={entry.item.url}
                            alt={entry.item.title}
                            className="size-16 rounded-md object-cover"
                            loading="lazy"
                        />
                        <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-ink">
                                {entry.item.title}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-ink-faint">
                                #{entry.item.id} · {entry.item.name}
                            </p>
                            {multiple ? (
                                <Input
                                    value={entry.caption}
                                    onChange={(event) =>
                                        setCaption(field.key, entry.item.id, event.target.value)
                                    }
                                    placeholder="图注（选填）"
                                    className="mt-1.5 h-7 text-xs"
                                    aria-label={`图注 ${entry.item.title}`}
                                />
                            ) : null}
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`移除 ${entry.item.title}`}
                            onClick={() => removeMedia(field.key, entry.item.id)}
                        >
                            <Trash2 aria-hidden="true" />
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPicker({ field: field.key, multiple })}
                >
                    <ImagePlus aria-hidden="true" />
                    {multiple ? '继续添加图片' : '更换图片'}
                </Button>
            </div>
        );
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="flex h-[min(90dvh,820px)] w-[min(1180px,calc(100vw-24px))] max-w-none flex-col gap-0 overflow-hidden p-0"
                    style={{ maxWidth: 'min(1180px, calc(100vw - 24px))' }}
                >
                    <DialogHeader className="shrink-0 gap-3 border-b px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                            <div>
                                <DialogTitle>插入内容组件</DialogTitle>
                                <DialogDescription>{def.hint}</DialogDescription>
                            </div>
                            <div className="relative w-full min-w-[200px] sm:w-64">
                                <Search
                                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-faint"
                                    aria-hidden="true"
                                />
                                <Input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="搜索组件"
                                    className="pl-8"
                                    aria-label="搜索内容组件"
                                />
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[170px_370px_minmax(0,1fr)] lg:overflow-hidden">
                        <nav
                            className="border-b p-3 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
                            aria-label="组件分类"
                        >
                            <p className="mb-2 px-2 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
                                分类
                            </p>
                            <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                                {FAMILIES.filter((family) =>
                                    available.some((item) => item.family === family.id)
                                ).map((family) => (
                                    <button
                                        key={family.id}
                                        type="button"
                                        onClick={() => selectFamily(family.id)}
                                        className={
                                            'rounded-md px-2.5 py-2 text-left text-sm transition-colors ' +
                                            (def.family === family.id && search === ''
                                                ? 'bg-accent font-medium text-ink'
                                                : 'text-ink-mute hover:bg-accent hover:text-ink')
                                        }
                                    >
                                        {family.label}
                                    </button>
                                ))}
                            </div>
                        </nav>

                        <div className="flex min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0">
                            <div className="max-h-[230px] shrink-0 overflow-y-auto border-b p-3">
                                <p className="mb-2 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
                                    {search === '' ? '组件' : `搜索结果 ${visible.length}`}
                                </p>
                                {visible.length === 0 ? (
                                    <p className="rounded-md border border-dashed border-line px-3 py-5 text-center text-xs text-ink-faint">
                                        没有匹配的组件。
                                    </p>
                                ) : (
                                    <div className="grid gap-1">
                                        {visible.map((item) => {
                                            const Icon = item.icon;
                                            const active = item.id === def.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => chooseType(item.id)}
                                                    className={
                                                        'flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors ' +
                                                        (active
                                                            ? 'border-brand/40 bg-brand-soft'
                                                            : 'border-transparent hover:border-line hover:bg-surface-2')
                                                    }
                                                >
                                                    <span
                                                        className={
                                                            'mt-0.5 grid size-7 shrink-0 place-content-center rounded-md ' +
                                                            (active
                                                                ? 'bg-brand text-white'
                                                                : 'bg-surface-2 text-ink-mute')
                                                        }
                                                    >
                                                        <Icon className="size-3.5" aria-hidden="true" />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block text-xs font-medium text-ink">
                                                            {item.label}
                                                        </span>
                                                        <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-ink-faint">
                                                            {item.hint}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                <p className="mb-3 text-xs font-medium text-ink">
                                    {def.label}设置
                                </p>
                                {def.fields.length === 0 ? (
                                    <p className="rounded-lg border border-dashed border-line p-4 text-xs leading-6 text-ink-faint">
                                        这个组件没有额外参数，点击下方按钮即可插入。
                                    </p>
                                ) : (
                                    <div className="grid gap-3.5">
                                        {def.fields.map((field) => (
                                            <div key={field.key} className="grid gap-1.5">
                                                <Label htmlFor={`component-${field.key}`}>
                                                    {field.label}
                                                </Label>
                                                {field.kind === 'media' ||
                                                field.kind === 'media-list' ? (
                                                    renderMediaField(field)
                                                ) : field.kind === 'select' ? (
                                                    <select
                                                        id={`component-${field.key}`}
                                                        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                                        value={values[field.key] ?? ''}
                                                        onChange={(event) =>
                                                            setValue(field.key, event.target.value)
                                                        }
                                                    >
                                                        {field.options?.map((option) => (
                                                            <option
                                                                key={option.value}
                                                                value={option.value}
                                                            >
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : field.kind === 'textarea' ? (
                                                    <Textarea
                                                        id={`component-${field.key}`}
                                                        rows={5}
                                                        value={values[field.key] ?? ''}
                                                        placeholder={field.placeholder}
                                                        onChange={(event) =>
                                                            setValue(field.key, event.target.value)
                                                        }
                                                    />
                                                ) : (
                                                    <Input
                                                        id={`component-${field.key}`}
                                                        value={values[field.key] ?? ''}
                                                        placeholder={field.placeholder}
                                                        onChange={(event) =>
                                                            setValue(field.key, event.target.value)
                                                        }
                                                    />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="min-w-0 bg-surface-2 p-4 lg:min-h-0 lg:overflow-y-auto">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <p className="text-xs font-medium text-ink">效果预览</p>
                                <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-ink-faint">
                                    {attachments.length} 张附件
                                </span>
                            </div>
                            <div className="rounded-lg border border-line bg-surface p-4">
                                {preview === '' ? (
                                    <p className="text-sm text-ink-faint">填写内容后在这里预览。</p>
                                ) : (
                                    <div
                                        className="prose"
                                        dangerouslySetInnerHTML={{ __html: preview }}
                                    />
                                )}
                            </div>
                            <p className="mt-4 mb-2 text-xs font-medium text-ink">插入的 Markdown</p>
                            <pre className="max-h-44 overflow-auto rounded-lg border border-line bg-[#17181a] p-3 text-[11px] leading-6 text-[#d6d8dc]">
                                <code>{snippet || '（尚未生成内容）'}</code>
                            </pre>
                        </div>
                    </div>

                    <DialogFooter className="shrink-0 items-center justify-between gap-3 border-t px-5 py-4 sm:space-x-0">
                        <span className="text-[11px] text-ink-faint">
                            图片组件会自动登记附件，保存时写入附件关联。
                        </span>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                取消
                            </Button>
                            <Button type="button" onClick={insert} disabled={snippet === ''}>
                                插入到正文
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <MediaLibrary
                open={picker !== null}
                onOpenChange={(next) => {
                    if (!next) {
                        setPicker(null);
                    }
                }}
                api={api}
                mediaEndpoint={mediaEndpoint}
                uploadPurpose={uploadPurpose}
                multiple={picker?.multiple ?? false}
                onSelect={(item) => pickMedia([item])}
                onSelectMany={pickMedia}
                title={picker?.multiple ? '选择图片附件' : '选择图片附件'}
            />
        </>
    );
}
