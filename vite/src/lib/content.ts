import type { ApiPayload } from './user';
import type { MediaItem } from '../types';

export interface TermItem {
    mid: number;
    name: string;
    slug?: string;
    count?: number;
}

export interface ContentItem {
    cid: number;
    title: string;
    slug: string;
    kind: string;
    status: string;
    permalink: string;
    created: string;
    modified: string;
    commentsNum: number;
    text: string;
    allowComment: boolean;
    categories: TermItem[];
    tags: TermItem[];
    fields?: Record<string, string>;
    attachments?: MediaItem[];
}

export interface CommentItem {
    coid: number;
    cid: number;
    author: string;
    text: string;
    html: string;
    status: string;
    parent: number;
    created: string;
}

export function contentListFrom(payload: ApiPayload | null): ContentItem[] {
    return Array.isArray(payload?.data) ? (payload.data as ContentItem[]) : [];
}

export function termsFrom(payload: ApiPayload | null): TermItem[] {
    return Array.isArray(payload?.data) ? (payload.data as TermItem[]) : [];
}

export function commentsFrom(payload: ApiPayload | null): CommentItem[] {
    return Array.isArray(payload?.data) ? (payload.data as CommentItem[]) : [];
}

export function formatDate(value: string): string {
    if (value === '') {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

export function formatDateTime(value: string): string {
    if (value === '') {
        return '';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date);
}
