import { safeDownloadUrl } from './downloads';
import { errorMessage, readPayload } from './user';

export interface PaidClient {
    enabled: boolean;
    storeReady: boolean;
    contentType: 'article' | 'topic';
    contentId: number;
    loggedIn: boolean;
    nonce: string;
    balanceEnabled: boolean;
    pointsEnabled: boolean;
    pointsRate: number;
    labels: {
        balance: string;
        points: string;
    };
    endpoints: {
        order: string;
        balance: string;
        points: string;
        status: string;
    };
}

export interface PaidPaymentOption {
    method: string;
    label: string;
    url: string;
}

export interface PaidQuote {
    blockKey: string;
    sign: string;
    price: string;
    title: string;
    modes: string;
    returnUrl: string;
    contentType: 'article' | 'topic';
    contentId: number;
}

export interface PaidOrder {
    number: string;
    status: 'pending' | 'paid' | 'cancelled';
    amount: string;
    amountCents: number;
    pointsCost: number;
    title: string;
    blockKey: string;
    modes: Array<'balance' | 'points' | 'gateway'>;
    balanceEnabled: boolean;
    pointsEnabled: boolean;
    pointsRate: number;
    balanceLabel: string;
    pointsLabel: string;
    paymentOptions: PaidPaymentOption[];
    createdAt: number;
    paidAt: number;
}

interface PaidRequest {
    client: PaidClient;
    endpoint: string;
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    signal?: AbortSignal;
}

function modesFrom(value: unknown): PaidOrder['modes'] {
    if (!Array.isArray(value)) {
        return [];
    }

    const modes: PaidOrder['modes'] = [];
    for (const item of value) {
        if (
            (item === 'balance' || item === 'points' || item === 'gateway')
            && !modes.includes(item)
        ) {
            modes.push(item);
        }
    }

    return modes;
}

function orderFrom(value: unknown): PaidOrder {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('订单数据不完整，请刷新后重试');
    }

    const order = value as Partial<PaidOrder>;
    if (
        typeof order.number !== 'string'
        || !/^SK[0-9]{14}[A-F0-9]{16}$/.test(order.number)
        || !['pending', 'paid', 'cancelled'].includes(String(order.status))
    ) {
        throw new Error('订单数据不完整，请刷新后重试');
    }

    const paymentOptions: PaidPaymentOption[] = [];
    const seen = new Set<string>();
    if (Array.isArray(order.paymentOptions)) {
        for (const item of order.paymentOptions) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const option = item as Partial<PaidPaymentOption>;
            const method = String(option.method ?? '').trim();
            const url = safeDownloadUrl(option.url);
            if (
                !/^[a-z][a-z0-9-]{0,63}$/.test(method)
                || url === ''
                || seen.has(method + '\n' + url)
            ) {
                continue;
            }
            seen.add(method + '\n' + url);
            paymentOptions.push({
                method,
                label: String(option.label ?? method).trim() || method,
                url,
            });
        }
    }

    return {
        number: order.number,
        status: order.status as PaidOrder['status'],
        amount: typeof order.amount === 'string' ? order.amount : '0.00',
        amountCents: Math.max(0, Number(order.amountCents) || 0),
        pointsCost: Math.max(0, Number(order.pointsCost) || 0),
        title: String(order.title ?? ''),
        blockKey: String(order.blockKey ?? ''),
        modes: modesFrom(order.modes),
        balanceEnabled: order.balanceEnabled === true,
        pointsEnabled: order.pointsEnabled === true,
        pointsRate: Math.max(1, Number(order.pointsRate) || 100),
        balanceLabel: String(order.balanceLabel ?? '余额'),
        pointsLabel: String(order.pointsLabel ?? '积分'),
        paymentOptions,
        createdAt: Number(order.createdAt) || 0,
        paidAt: Number(order.paidAt) || 0,
    };
}

async function requestPaid({
    client,
    endpoint,
    method = 'GET',
    body,
    signal,
}: PaidRequest): Promise<Record<string, unknown>> {
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
        throw new Error(errorMessage(payload, '付费操作失败，请稍后再试'));
    }
    if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
        throw new Error('付费数据不完整，请稍后再试');
    }

    return payload.data as Record<string, unknown>;
}

export function quoteFromButton(button: HTMLButtonElement): PaidQuote | null {
    const blockKey = button.dataset.paidKey?.trim() ?? '';
    const sign = button.dataset.paidSign?.trim().toLowerCase() ?? '';
    const price = button.dataset.paidPrice?.trim() ?? '';
    const title = button.dataset.paidTitle?.trim() ?? '';
    const modes = button.dataset.paidModes?.trim() ?? '';
    const returnUrl = safeDownloadUrl(button.dataset.paidReturn ?? '');
    const contentType = button.dataset.paidContentType?.trim();
    const contentId = Number(button.dataset.paidContentId ?? 0);

    if (
        !/^[a-f0-9]{40}$/.test(blockKey)
        || !/^[a-f0-9]{64}$/.test(sign)
        || !/^(0|[1-9][0-9]{0,5})(?:\.[0-9]{2})?$/.test(price)
        || title === ''
        || modes === ''
        || returnUrl === ''
        || (contentType !== 'article' && contentType !== 'topic')
        || !Number.isInteger(contentId)
        || contentId <= 0
    ) {
        return null;
    }

    return {
        blockKey,
        sign,
        price,
        title,
        modes,
        returnUrl,
        contentType,
        contentId,
    };
}

export async function createPaidOrder({
    client,
    quote,
    signal,
}: {
    client: PaidClient;
    quote: PaidQuote;
    signal?: AbortSignal;
}): Promise<PaidOrder> {
    const data = await requestPaid({
        client,
        endpoint: client.endpoints.order,
        method: 'POST',
        body: {
            blockKey: quote.blockKey,
            sign: quote.sign,
            price: quote.price,
            title: quote.title,
            modes: quote.modes,
            returnUrl: quote.returnUrl,
            contentType: quote.contentType,
            contentId: quote.contentId,
        },
        signal,
    });

    return orderFrom(data.order);
}

export async function checkPaidOrder({
    client,
    orderNumber,
    signal,
}: {
    client: PaidClient;
    orderNumber: string;
    signal?: AbortSignal;
}): Promise<PaidOrder> {
    const endpoint = new URL(client.endpoints.status, window.location.href);
    endpoint.searchParams.set('orderNumber', orderNumber);
    const data = await requestPaid({ client, endpoint: endpoint.href, signal });

    return orderFrom(data.order);
}

export async function payPaidWithBalance({
    client,
    orderNumber,
    signal,
}: {
    client: PaidClient;
    orderNumber: string;
    signal?: AbortSignal;
}): Promise<PaidOrder> {
    const data = await requestPaid({
        client,
        endpoint: client.endpoints.balance,
        method: 'POST',
        body: { orderNumber },
        signal,
    });

    return orderFrom(data.order);
}

export async function payPaidWithPoints({
    client,
    orderNumber,
    signal,
}: {
    client: PaidClient;
    orderNumber: string;
    signal?: AbortSignal;
}): Promise<PaidOrder> {
    const data = await requestPaid({
        client,
        endpoint: client.endpoints.points,
        method: 'POST',
        body: { orderNumber },
        signal,
    });

    return orderFrom(data.order);
}
