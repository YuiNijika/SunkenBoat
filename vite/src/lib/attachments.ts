import type { MediaItem } from '../types';

export const MARKDOWN_MARKER = '<!--markdown-->';

export function stripMarkdownMarker(value: string): string {
    return value.startsWith(MARKDOWN_MARKER)
        ? value.slice(MARKDOWN_MARKER.length)
        : value;
}

export function attachmentAlt(item: MediaItem): string {
    const value = (item.title || item.name || '图片')
        .replace(/[[\]\r\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return value.slice(0, 120) || '图片';
}

export function attachmentReference(item: MediaItem): string {
    return `![${attachmentAlt(item)}][${item.id}]`;
}

export function attachmentIds(text: string): number[] {
    const ids: number[] = [];
    const pattern = /!\[[^\]]*\]\[(\d{1,12})\]/g;
    let match: RegExpExecArray | null = pattern.exec(text);

    while (match) {
        const id = Number(match[1]);
        if (Number.isFinite(id) && id > 0) {
            ids.push(id);
        }
        match = pattern.exec(text);
    }

    return [...new Set(ids)];
}

export function mergeAttachments(
    current: MediaItem[],
    items: MediaItem[]
): MediaItem[] {
    const map = new Map<number, MediaItem>();
    for (const item of current) {
        map.set(item.id, item);
    }
    for (const item of items) {
        map.set(item.id, item);
    }

    return [...map.values()];
}

export function attachmentsInText(text: string, items: MediaItem[]): MediaItem[] {
    const map = new Map(items.map((item) => [item.id, item]));
    return attachmentIds(text)
        .map((id) => map.get(id))
        .filter((item): item is MediaItem => item !== undefined);
}

export function resolveAttachmentPreview(text: string, items: MediaItem[]): string {
    const map = new Map(items.map((item) => [item.id, item]));
    let output = text.replace(
        /!\[([^\]]*)\]\[(\d{1,12})\]/g,
        (_match, alt: string, rawId: string) => {
            const item = map.get(Number(rawId));
            if (!item || item.url === '') {
                return alt;
            }

            const safeAlt = alt.replace(/[[\]\r\n]/g, ' ').trim();
            return `![${safeAlt}](${item.url})`;
        }
    );

    output = output.replace(/^\s{0,3}\[(\d{1,12})\]:[^\n]*(?:\n|$)/gm, '');

    return output;
}
