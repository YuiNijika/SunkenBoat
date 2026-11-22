export type MarkdownAction =
    | 'heading'
    | 'bold'
    | 'italic'
    | 'code'
    | 'codeblock'
    | 'link'
    | 'image'
    | 'quote'
    | 'ul'
    | 'ol';

interface WrapConfig {
    before: string;
    after: string;
    placeholder: string;
}

const WRAPS: Partial<Record<MarkdownAction, WrapConfig>> = {
    bold: { before: '**', after: '**', placeholder: '粗体文字' },
    italic: { before: '*', after: '*', placeholder: '斜体文字' },
    code: { before: '`', after: '`', placeholder: 'code' },
    codeblock: { before: '\n```\n', after: '\n```\n', placeholder: '// code' },
    link: { before: '[', after: '](https://example.com)', placeholder: '链接文字' },
    image: { before: '![', after: '](https://example.com/image.jpg)', placeholder: '图片说明' },
};

const PREFIXES: Partial<Record<MarkdownAction, string>> = {
    heading: '## ',
    quote: '> ',
    ul: '- ',
    ol: '1. ',
};

function commit(
    textarea: HTMLTextAreaElement,
    value: string,
    selectionStart: number,
    selectionEnd: number,
    onChange: (value: string) => void
): void {
    onChange(value);

    window.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(selectionStart, selectionEnd);
        textarea.scrollTop = textarea.scrollHeight;
    });
}

export function applyMarkdownAction(
    textarea: HTMLTextAreaElement | null,
    action: MarkdownAction,
    onChange: (value: string) => void
): void {
    if (!textarea) {
        return;
    }

    const value = textarea.value;
    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? start;
    const selected = value.slice(start, end);

    const wrap = WRAPS[action];
    if (wrap) {
        const body = selected === '' ? wrap.placeholder : selected;
        const inserted = wrap.before + body + wrap.after;
        const next = value.slice(0, start) + inserted + value.slice(end);

        commit(
            textarea,
            next,
            start + wrap.before.length,
            start + wrap.before.length + body.length,
            onChange
        );
        return;
    }

    const prefix = PREFIXES[action];
    if (!prefix) {
        return;
    }

    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const lineEndIndex = value.indexOf('\n', end);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
    const block = value.slice(lineStart, lineEnd) || '文字';
    const lines = block.split('\n');
    const inserted = lines
        .map((line, index) => (action === 'ol' ? `${index + 1}. ${line}` : prefix + line))
        .join('\n');
    const next = value.slice(0, lineStart) + inserted + value.slice(lineEnd);

    commit(
        textarea,
        next,
        lineStart,
        lineStart + inserted.length,
        onChange
    );
}

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function safeUrl(value: string): string | null {
    const url = value.replace(/&amp;/g, '&').trim();
    if (
        url === '' ||
        url.startsWith('//') ||
        !/^(?:https?:\/\/|\/(?!\/)|#|mailto:)/i.test(url)
    ) {
        return null;
    }

    return escapeHtml(url);
}

function inlineMarkdown(value: string): string {
    const code: string[] = [];
    let html = escapeHtml(value).replace(/`([^`\n]+)`/g, (_match, body: string) => {
        const index = code.push(`<code>${body}</code>`) - 1;
        return `\u0000CODE${index}\u0000`;
    });

    html = html
        .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, alt: string, url: string) => {
            const src = safeUrl(url);
            return src === null ? match : `<img src="${src}" alt="${alt}" loading="lazy">`;
        })
        .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (match, label: string, url: string) => {
            const href = safeUrl(url);
            return href === null
                ? match
                : `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
        })
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/~~([^~]+)~~/g, '<del>$1</del>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/_([^_]+)_/g, '<em>$1</em>');

    return html.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => code[Number(index)] ?? '');
}

/**
 * Small, deliberately limited Markdown renderer for the editor preview.
 *
 * It escapes input before adding markup, only allows safe link schemes, and
 * intentionally does not accept raw HTML. The public article renderer still
 * comes from Typecho, so this function is only a writing aid.
 */
export function renderMarkdown(value: string): string {
    const lines = value.replace(/\r\n?/g, '\n').split('\n');
    const output: string[] = [];
    let paragraph: string[] = [];

    const flushParagraph = () => {
        if (paragraph.length === 0) {
            return;
        }

        output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
        paragraph = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';

        const fence = line.match(/^\s*```([A-Za-z0-9_+-]*)\s*$/);
        if (fence) {
            flushParagraph();
            const language = (fence[1] ?? '').trim();
            const code: string[] = [];
            index += 1;
            while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? '')) {
                code.push(lines[index] ?? '');
                index += 1;
            }

            const className = language !== '' ? ` class="language-${escapeHtml(language)}"` : '';
            output.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`);
            continue;
        }

        if (/^\s*$/.test(line)) {
            flushParagraph();
            continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            const level = heading[1]?.length ?? 1;
            output.push(`<h${level}>${inlineMarkdown(heading[2] ?? '')}</h${level}>`);
            continue;
        }

        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
            flushParagraph();
            output.push('<hr>');
            continue;
        }

        if (/^\s*>\s?/.test(line)) {
            flushParagraph();
            const quote: string[] = [];
            while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? '')) {
                quote.push((lines[index] ?? '').replace(/^\s*>\s?/, ''));
                index += 1;
            }
            index -= 1;
            output.push(`<blockquote>${quote.map(inlineMarkdown).join('<br>')}</blockquote>`);
            continue;
        }

        if (/^\s*[-*+]\s+/.test(line)) {
            flushParagraph();
            const items: string[] = [];
            while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? '')) {
                items.push((lines[index] ?? '').replace(/^\s*[-*+]\s+/, ''));
                index += 1;
            }
            index -= 1;
            output.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
            continue;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            flushParagraph();
            const items: string[] = [];
            while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? '')) {
                items.push((lines[index] ?? '').replace(/^\s*\d+\.\s+/, ''));
                index += 1;
            }
            index -= 1;
            output.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ol>`);
            continue;
        }

        paragraph.push(line);
    }

    flushParagraph();

    return output.join('\n');
}

const EDITOR_SHORTCODE =
    /\[(login|reply|paid|alert|card|spoiler)\b([^\]]*)\]([\s\S]*?)\[\/\1\]/gi;

function shortcodeAttributes(source: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const pattern = /([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(source)) !== null) {
        const name = (match[1] ?? '').toLowerCase();
        if (name === '') {
            continue;
        }

        attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
    }

    return attributes;
}

function insideCodeFence(source: string, index: number): boolean {
    let fence = false;
    for (const line of source.slice(0, index).split('\n')) {
        if (/^\s*```/.test(line)) {
            fence = !fence;
        }
    }

    return fence;
}

function editorShortcode(
    name: string,
    attributes: Record<string, string>,
    body: string
): string {
    const content = renderEditorPreview(body);

    if (name === 'login' || name === 'reply') {
        const reply = name === 'reply';
        return (
            `<section class="editor-shortcode-gate is-${name}" data-gate="${name}">`
            + '<header class="editor-shortcode-gate-head">'
            + `<span class="editor-shortcode-gate-badge">${reply ? '回复可见' : '登录可见'}</span>`
            + `<span class="editor-shortcode-gate-note">${reply ? '发布后需在本篇评论后才能查看' : '发布后仅登录用户可查看'}</span>`
            + '</header>'
            + `<div class="editor-shortcode-gate-body">${content === '' ? '<p class="editor-shortcode-gate-empty">尚未填写隐藏内容。</p>' : content}</div>`
            + '</section>'
        );
    }

    if (name === 'paid') {
        const title = (attributes.title ?? '').trim() || '付费内容';
        const text = (attributes.text ?? '').trim() || '购买后即可查看这一区块的完整内容。';
        const badge = (attributes.badge ?? '').trim() || '付费阅读';
        const price = (attributes.price ?? '').trim() || '0.00';
        const style = attributes.style === 'card' ? 'card' : 'hero';
        const image = safeUrl(attributes.image ?? '');
        const imageBlock = style === 'card' && image
            ? `<div class="paid-gate-media"><img src="${escapeHtml(image)}" alt="" loading="lazy"></div>`
            : '';
        const labels = (attributes.modes ?? 'all')
            .split(/[\s,|]+/)
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
        const modes = labels.length > 0
            ? `<div class="paid-gate-modes">${labels.map((label) => `<span class="paid-gate-mode">${label}</span>`).join('')}</div>`
            : '';

        return (
            `<section class="content-gate-hero paid-gate paid-gate-${style}">`
            + '<div class="paid-gate-inner">'
            + imageBlock
            + '<div class="paid-gate-body">'
            + `<span class="paid-gate-badge">${escapeHtml(badge)}</span>`
            + `<h2 class="content-gate-title paid-gate-title">${escapeHtml(title)}</h2>`
            + `<p class="content-gate-text paid-gate-text">${escapeHtml(text)}</p>`
            + `<div class="paid-gate-price"><span class="paid-gate-price-main"><small>¥</small>${escapeHtml(price)}</span></div>`
            + modes
            + '<span class="content-gate-btn paid-gate-buy">立即购买</span>'
            + '<p class="paid-gate-hint">编辑器预览：购买按钮在发布后生效。</p>'
            + '</div></div></section>'
            + '<div class="editor-shortcode-paid-preview"><p class="editor-shortcode-paid-preview-label">购买后显示</p>'
            + `<div class="editor-shortcode-gate-body">${content === '' ? '<p class="editor-shortcode-gate-empty">尚未填写购买后可见内容。</p>' : content}</div>`
            + '</div>'
        );
    }

    if (name === 'alert') {
        const requested = (attributes.type ?? 'info').toLowerCase();
        const tone = ['info', 'success', 'warning', 'danger'].includes(requested)
            ? requested
            : 'info';
        const title = (attributes.title ?? '').trim();
        return (
            `<div class="article-alert is-${tone}" role="note">`
            + (title === '' ? '' : `<p class="article-alert-title">${escapeHtml(title)}</p>`)
            + `<div class="article-alert-body">${content}</div>`
            + '</div>'
        );
    }

    if (name === 'card') {
        const title = (attributes.title ?? '').trim();
        return (
            '<div class="article-card">'
            + (title === '' ? '' : `<h3>${escapeHtml(title)}</h3>`)
            + `<div class="article-card-body">${content}</div>`
            + '</div>'
        );
    }

    if (name === 'spoiler') {
        const label = (attributes.label ?? '').trim() || '点击展开';
        return (
            '<details class="article-spoiler" open>'
            + `<summary>${escapeHtml(label)}</summary>`
            + `<div class="article-spoiler-body">${content}</div>`
            + '</details>'
        );
    }

    return body;
}

/**
 * Editor preview renderer: Markdown plus the theme-owned shortcode set.
 *
 * The production renderer lives in PHP; this mirror exists so the writing
 * area can show access gates, alerts, cards and spoilers before publishing.
 */
export function renderEditorPreview(value: string): string {
    const pattern = new RegExp(EDITOR_SHORTCODE.source, EDITOR_SHORTCODE.flags);
    const output: string[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(value)) !== null) {
        if (insideCodeFence(value, match.index)) {
            continue;
        }

        const name = (match[1] ?? '').toLowerCase();
        output.push(renderMarkdown(value.slice(cursor, match.index)));
        output.push(editorShortcode(name, shortcodeAttributes(match[2] ?? ''), match[3] ?? ''));
        cursor = match.index + match[0].length;
    }

    output.push(renderMarkdown(value.slice(cursor)));

    return output.join('\n');
}
