export interface TocItem {
    id: string;
    label: string;
    level: number;
}

export interface ParsedArticle {
    html: string;
    toc: TocItem[];
}

function slugify(text: string, index: number): string {
    const base = text
        .trim()
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    return base !== '' ? base : `section-${index + 1}`;
}

/**
 * Typecho renders the body HTML; heading anchors and the table of contents are
 * derived from it so editors do not have to maintain ids by hand.
 *
 * The result is deterministic, so the article body and the sidebar TOC can
 * parse the same string independently and still agree on every id.
 */
export function parseArticle(html: string): ParsedArticle {
    if (typeof DOMParser === 'undefined') {
        return { html, toc: [] };
    }

    const doc = new DOMParser().parseFromString(`<div id="ttdf-article">${html}</div>`, 'text/html');
    const root = doc.getElementById('ttdf-article');
    if (!root) {
        return { html, toc: [] };
    }

    const used = new Set<string>();
    const toc: TocItem[] = [];

    root.querySelectorAll('h2, h3').forEach((heading, index) => {
        const text = (heading.textContent ?? '').trim();
        let id = slugify(text, index);
        let attempt = 2;
        while (used.has(id)) {
            id = `${slugify(text, index)}-${attempt}`;
            attempt += 1;
        }

        used.add(id);
        heading.id = id;
        toc.push({
            id,
            label: text !== '' ? text : `第 ${index + 1} 节`,
            level: heading.tagName === 'H3' ? 3 : 2,
        });
    });

    return { html: root.innerHTML, toc };
}
