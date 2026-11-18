import { useEffect, useMemo, useState } from 'react';
import {
    Code2,
    Image as ImageIcon,
    Images,
    LockKeyhole,
    MessageSquareText,
    Minus,
    Quote,
    Sparkles,
    Table2,
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
import { renderMarkdown } from '../../lib/markdown';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInsert: (snippet: string) => void;
}

type FieldKind = 'text' | 'textarea' | 'select';

interface FieldDef {
    key: string;
    label: string;
    kind: FieldKind;
    placeholder?: string;
    options?: { value: string; label: string }[];
}

interface ComponentDef {
    id: string;
    label: string;
    family: string;
    hint: string;
    icon: typeof Sparkles;
    fields: FieldDef[];
    build: (values: Record<string, string>) => string;
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
        hint: '图片、替代文字与图注。',
        icon: ImageIcon,
        fields: [
            { key: 'src', label: '图片地址', kind: 'text', placeholder: 'https://' },
            { key: 'alt', label: '替代文字', kind: 'text', placeholder: '无障碍描述' },
            { key: 'caption', label: '图注', kind: 'text', placeholder: '选填' },
        ],
        build: (values) => {
            const alt = (values.alt ?? '').replace(/[[\]]/g, '');
            const caption = (values.caption ?? '').trim();
            return `![${alt}](${(values.src ?? '').trim()})${caption === '' ? '' : `\n\n*${caption}*`}`;
        },
    },
    {
        id: 'gallery',
        label: '图片组',
        family: 'media',
        hint: '一行一个图片地址，可附加竖线分隔的图注。',
        icon: Images,
        fields: [
            {
                key: 'urls',
                label: '图片列表',
                kind: 'textarea',
                placeholder: 'https://example.com/a.jpg|图注 A\nhttps://example.com/b.jpg|图注 B',
            },
        ],
        build: (values) =>
            (values.urls ?? '')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line !== '')
                .map((line) => {
                    const [src, caption = ''] = line.split('|');
                    const alt = caption.trim().replace(/[[\]]/g, '');
                    return `![${alt}](${(src ?? '').trim()})${caption.trim() === '' ? '' : `\n\n*${caption.trim()}*`}`;
                })
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

function defaultsOf(def: ComponentDef): Record<string, string> {
    const values: Record<string, string> = {};
    for (const field of def.fields) {
        values[field.key] = field.kind === 'select' ? (field.options?.[0]?.value ?? '') : '';
    }
    return values;
}

function previewFor(def: ComponentDef, values: Record<string, string>): string {
    const content = renderMarkdown(values.content ?? '');
    const title = escapeHtml((values.title ?? '').trim());
    const tone = ALERT_TONES.some((item) => item.value === values.type) ? values.type : 'info';

    if (def.id === 'login' || def.id === 'reply') {
        const reply = def.id === 'reply';
        return `<section class="content-gate-hero"><div class="content-gate-hero-inner"><span class="content-gate-icon">${iconSvg(reply ? 'message' : 'lock')}</span><div class="content-gate-copy"><p class="content-gate-eyebrow">${reply ? 'COMMENT ACCESS' : 'MEMBER ACCESS'}</p><h2 class="content-gate-title">${reply ? '参与讨论后继续阅读' : '登录后继续阅读'}</h2><p class="content-gate-text">${reply ? '登录账号并参与评论后，即可查看被隐藏的完整内容。' : '这是一个仅对已登录成员开放的内容区域。登录后即可查看完整正文。'}</p></div><span class="content-gate-btn"><span>${reply ? '前往评论区' : '立即登录'}</span>${iconSvg('arrow')}</span></div></section>`;
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
        const src = escapeAttr((values.src ?? '').trim());
        const alt = escapeAttr(values.alt ?? '');
        return src === ''
            ? '<p class="text-sm text-ink-faint">填写图片地址后显示预览。</p>'
            : `<figure class="article-figure"><img src="${src}" alt="${alt}" loading="lazy"><figcaption>${escapeHtml(values.caption ?? '')}</figcaption></figure>`;
    }

    if (def.id === 'gallery') {
        const images = (values.urls ?? '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line !== '')
            .map((line) => {
                const [src, caption = ''] = line.split('|');
                return `<figure class="article-figure"><img src="${escapeAttr((src ?? '').trim())}" alt="" loading="lazy"><figcaption>${escapeHtml(caption.trim())}</figcaption></figure>`;
            })
            .join('');
        return images === ''
            ? '<p class="text-sm text-ink-faint">填写图片地址后显示预览。</p>'
            : `<div class="article-gallery">${images}</div>`;
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

    return renderMarkdown(def.build(values));
}

export default function ComponentLibrary({ open, onOpenChange, onInsert }: Props) {
    const [type, setType] = useState(INITIAL.id);
    const [values, setValues] = useState<Record<string, string>>(() => defaultsOf(INITIAL));

    const def = useMemo(
        () => COMPONENTS.find((item) => item.id === type) ?? INITIAL,
        [type]
    );
    const variants = useMemo(
        () => COMPONENTS.filter((item) => item.family === def.family),
        [def.family]
    );
    const snippet = useMemo(() => def.build(values).trim(), [def, values]);
    const preview = useMemo(() => previewFor(def, values), [def, values]);

    useEffect(() => {
        if (!open) {
            return;
        }
        setValues(defaultsOf(def));
    }, [open, def]);

    const selectFamily = (family: string) => {
        const first = COMPONENTS.find((item) => item.family === family);
        if (first) {
            setType(first.id);
        }
    };

    const insert = () => {
        if (snippet === '') {
            return;
        }
        onInsert(`\n${snippet}\n`);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(88dvh,780px)] w-[min(1120px,calc(100vw-24px))] max-w-none flex-col gap-0 overflow-hidden p-0">
                <DialogHeader className="shrink-0 border-b px-5 py-4">
                    <DialogTitle>插入内容组件</DialogTitle>
                    <DialogDescription>{def.hint}</DialogDescription>
                </DialogHeader>

                <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[180px_290px_minmax(0,1fr)] lg:overflow-hidden">
                    <nav
                        className="border-b p-3 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-b-0"
                        aria-label="组件分类"
                    >
                        <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
                            {FAMILIES.map((family) => (
                                <button
                                    key={family.id}
                                    type="button"
                                    onClick={() => selectFamily(family.id)}
                                    className={
                                        'rounded-md px-2.5 py-2 text-left text-sm transition-colors ' +
                                        (def.family === family.id
                                            ? 'bg-accent font-medium text-ink'
                                            : 'text-ink-mute hover:bg-accent hover:text-ink')
                                    }
                                >
                                    {family.label}
                                </button>
                            ))}
                        </div>
                    </nav>

                    <div className="min-w-0 border-b p-4 lg:min-h-0 lg:overflow-y-auto lg:border-b-0">
                        <div className="mb-4 flex flex-wrap gap-1.5">
                            {variants.map((variant) => {
                                const Icon = variant.icon;
                                const active = variant.id === def.id;
                                return (
                                    <button
                                        key={variant.id}
                                        type="button"
                                        onClick={() => setType(variant.id)}
                                        className={
                                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ' +
                                            (active
                                                ? 'border-brand/40 bg-brand-soft text-brand'
                                                : 'border-line text-ink-mute hover:text-ink')
                                        }
                                    >
                                        <Icon className="size-3.5" aria-hidden="true" />
                                        {variant.label}
                                    </button>
                                );
                            })}
                        </div>

                        {def.fields.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-line p-4 text-xs leading-6 text-ink-faint">
                                这个组件没有额外参数，点击下方按钮即可插入。
                            </p>
                        ) : (
                            <div className="grid gap-3.5">
                                {def.fields.map((field) => (
                                    <div key={field.key} className="grid gap-1.5">
                                        <Label htmlFor={`component-${field.key}`}>{field.label}</Label>
                                        {field.kind === 'select' ? (
                                            <select
                                                id={`component-${field.key}`}
                                                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                                value={values[field.key] ?? ''}
                                                onChange={(event) =>
                                                    setValues((current) => ({
                                                        ...current,
                                                        [field.key]: event.target.value,
                                                    }))
                                                }
                                            >
                                                {field.options?.map((option) => (
                                                    <option key={option.value} value={option.value}>
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
                                                    setValues((current) => ({
                                                        ...current,
                                                        [field.key]: event.target.value,
                                                    }))
                                                }
                                            />
                                        ) : (
                                            <Input
                                                id={`component-${field.key}`}
                                                value={values[field.key] ?? ''}
                                                placeholder={field.placeholder}
                                                onChange={(event) =>
                                                    setValues((current) => ({
                                                        ...current,
                                                        [field.key]: event.target.value,
                                                    }))
                                                }
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 bg-surface-2 p-4 lg:min-h-0 lg:overflow-y-auto lg:border-l">
                        <p className="mb-2 text-xs font-medium text-ink">效果预览</p>
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

                <DialogFooter className="shrink-0 border-t px-5 py-4">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button type="button" onClick={insert} disabled={snippet === ''}>
                        插入到正文
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
