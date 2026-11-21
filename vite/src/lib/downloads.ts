import { errorMessage, readPayload } from './user';

export interface DownloadConfig {
    enabled: boolean;
    url: string;
    paid: boolean;
    price: string;
}

export interface DownloadsClient {
    enabled: boolean;
    paymentEnabled: boolean;
    nonce: string;
    endpoints: {
        order: string;
        status: string;
        download: string;
        history: string;
    };
}

export interface DownloadOffer extends DownloadsClient {
    contentType: 'article' | 'topic';
    contentId: number;
    title: string;
    paid: boolean;
    price: string;
    currency: 'CNY';
    loggedIn: boolean;
    available: boolean;
    limit: number;
    used: number;
    remaining: number | null;
    purchased: boolean;
}

export interface DownloadOrder {
    number: string;
    status: 'pending' | 'paid' | 'free' | 'cancelled';
    amount: string;
    paymentUrl?: string;
    createdAt: number;
    paidAt: number;
    contentType: 'article' | 'topic';
    contentId: number;
    title: string;
    contentUrl: string;
    downloadCount: number;
}

interface DownloadRequest {
    client: DownloadsClient;
    endpoint: string;
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    signal?: AbortSignal;
}

export interface DownloadHistoryPage {
    items: DownloadOrder[];
    page: number;
    lastPage: number;
    total: number;
}

export interface DownloadResult {
    url: string;
    order: DownloadOrder;
    remaining: number | null;
}

export const DOWNLOAD_STATUS_LABELS: Record<DownloadOrder['status'], string> = {
    pending: '待付款',
    paid: '已付款',
    free: '免费领取',
    cancelled: '已取消',
};

export function safeDownloadUrl(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }

    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
        return '';
    }
}

export function downloadDate(timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '—';
    }

    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp * 1000));
}

async function requestDownload({
    client,
    endpoint,
    method = 'GET',
    body,
    signal,
}: DownloadRequest): Promise<Record<string, unknown>> {
    const response = await fetch(endpoint, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'X-Typecho-Token': client.nonce,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
        throw new Error(errorMessage(payload, '下载请求失败，请稍后再试'));
    }
    if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
        throw new Error('下载数据不完整，请稍后再试');
    }

    return payload.data as Record<string, unknown>;
}

function orderFrom(value: unknown): DownloadOrder {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('订单数据不完整，请刷新后重试');
    }

    const order = value as Partial<DownloadOrder>;
    if (
        typeof order.number !== 'string'
        || order.number === ''
        || !['pending', 'paid', 'free', 'cancelled'].includes(String(order.status))
        || !['article', 'topic'].includes(String(order.contentType))
        || !Number.isFinite(order.contentId)
    ) {
        throw new Error('订单数据不完整，请刷新后重试');
    }

    return {
        number: order.number,
        status: order.status as DownloadOrder['status'],
        amount: typeof order.amount === 'string' ? order.amount : '0.00',
        paymentUrl: safeDownloadUrl(order.paymentUrl),
        createdAt: Number(order.createdAt) || 0,
        paidAt: Number(order.paidAt) || 0,
        contentType: order.contentType as DownloadOrder['contentType'],
        contentId: Number(order.contentId),
        title: String(order.title ?? ''),
        contentUrl: safeDownloadUrl(order.contentUrl),
        downloadCount: Math.max(0, Number(order.downloadCount) || 0),
    };
}

export async function createDownloadOrder({
    client,
    contentType,
    contentId,
    signal,
}: {
    client: DownloadsClient;
    contentType: DownloadOrder['contentType'];
    contentId: number;
    signal?: AbortSignal;
}): Promise<DownloadOrder> {
    const data = await requestDownload({
        client,
        endpoint: client.endpoints.order,
        method: 'POST',
        body: { contentType, contentId },
        signal,
    });

    return orderFrom(data.order);
}

export async function checkDownloadOrder({
    client,
    orderNumber,
    signal,
}: {
    client: DownloadsClient;
    orderNumber: string;
    signal?: AbortSignal;
}): Promise<DownloadOrder> {
    const endpoint = new URL(client.endpoints.status, window.location.href);
    endpoint.searchParams.set('orderNumber', orderNumber);
    const data = await requestDownload({ client, endpoint: endpoint.href, signal });

    return orderFrom(data.order);
}

export async function resolveDownload({
    client,
    orderNumber,
    signal,
}: {
    client: DownloadsClient;
    orderNumber: string;
    signal?: AbortSignal;
}): Promise<DownloadResult> {
    const data = await requestDownload({
        client,
        endpoint: client.endpoints.download,
        method: 'POST',
        body: { orderNumber },
        signal,
    });
    const url = safeDownloadUrl(data.url);
    if (url === '') {
        throw new Error('下载链接暂不可用，请联系发布者');
    }

    return {
        url,
        order: orderFrom(data.order),
        remaining: typeof data.remaining === 'number' ? data.remaining : null,
    };
}

export async function fetchDownloadHistory({
    client,
    page,
    signal,
}: {
    client: DownloadsClient;
    page: number;
    signal?: AbortSignal;
}): Promise<DownloadHistoryPage> {
    const endpoint = new URL(client.endpoints.history, window.location.href);
    endpoint.searchParams.set('page', String(page));
    endpoint.searchParams.set('pageSize', '10');
    const data = await requestDownload({ client, endpoint: endpoint.href, signal });

    return {
        items: Array.isArray(data.items) ? data.items.map(orderFrom) : [],
        page: Math.max(1, Number(data.page) || page),
        lastPage: Math.max(1, Number(data.lastPage) || 1),
        total: Math.max(0, Number(data.total) || 0),
    };
}
