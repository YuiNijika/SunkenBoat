import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Coins, CreditCard, ExternalLink, LoaderCircle, LockKeyhole, Wallet } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import {
    checkDownloadOrder,
    createDownloadOrder,
    payDownloadWithBalance,
    payDownloadWithPoints,
    resolveDownload,
    safeDownloadUrl,
} from '../../lib/downloads';
import type { DownloadOffer, DownloadOrder, DownloadsClient } from '../../lib/downloads';
import { notifyError, notifyInfo, notifySuccess } from '../../lib/notify';

function openDownloadWindow(): Window | null {
    const popup = window.open('about:blank', '_blank');
    if (popup) {
        popup.opener = null;
    }

    return popup;
}

async function completeDownload({
    client,
    order,
    popup,
    signal,
    onOrderChange,
    onReady,
    onRemainingChange,
}: {
    client: DownloadsClient;
    order: DownloadOrder;
    popup: Window | null;
    signal: AbortSignal;
    onOrderChange: (order: DownloadOrder) => void;
    onReady: (url: string) => void;
    onRemainingChange?: (remaining: number | null) => void;
}): Promise<void> {
    try {
        const result = await resolveDownload({ client, orderNumber: order.number, signal });
        onOrderChange(result.order);
        onReady(result.url);
        onRemainingChange?.(result.remaining);
        if (popup && !popup.closed) {
            popup.location.replace(result.url);
        }
        notifySuccess(popup && !popup.closed ? '下载链接已打开。' : '下载链接已准备好，请点击打开。');
    } catch (reason) {
        popup?.close();
        throw reason;
    }
}

function PaymentDialog({
    client,
    order,
    open,
    onOpenChange,
    onOrderChange,
}: {
    client: DownloadsClient;
    order: DownloadOrder;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onOrderChange: (order: DownloadOrder) => void;
}) {
    const [checking, setChecking] = useState(false);
    const [payingBalance, setPayingBalance] = useState(false);
    const [payingPoints, setPayingPoints] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const paymentOptions = order.paymentOptions.filter((option) => safeDownloadUrl(option.url) !== '');

    useEffect(() => () => controller.current?.abort(), []);

    const checkPayment = async () => {
        if (checking) {
            return;
        }

        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setChecking(true);
        try {
            const next = await checkDownloadOrder({
                client,
                orderNumber: order.number,
                signal: request.signal,
            });
            onOrderChange(next);
            if (next.status === 'paid') {
                notifySuccess('支付成功，可以下载资源了。');
                onOpenChange(false);
            } else if (next.status === 'cancelled') {
                notifyError('订单已取消，请返回资源页重新下单。');
            } else {
                notifyInfo('暂未收到付款结果，请完成付款后再试。');
            }
        } catch (reason) {
            if (!request.signal.aborted) {
                notifyError(reason instanceof Error ? reason.message : '查询付款状态失败');
            }
        } finally {
            if (!request.signal.aborted) {
                setChecking(false);
            }
        }
    };

    const payWithBalance = async () => {
        if (payingBalance) {
            return;
        }
        setPayingBalance(true);
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        try {
            const next = await payDownloadWithBalance({
                client,
                orderNumber: order.number,
                signal: request.signal,
            });
            onOrderChange(next);
            notifySuccess('余额支付成功，可以下载资源了。');
            onOpenChange(false);
        } catch (reason) {
            if (!request.signal.aborted) {
                notifyError(reason instanceof Error ? reason.message : '余额支付失败');
            }
        } finally {
            if (!request.signal.aborted) {
                setPayingBalance(false);
            }
        }
    };

    const payWithPoints = async () => {
        if (payingPoints) {
            return;
        }
        setPayingPoints(true);
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        try {
            const next = await payDownloadWithPoints({
                client,
                orderNumber: order.number,
                signal: request.signal,
            });
            onOrderChange(next);
            notifySuccess(`${client.pointsLabel}支付成功，可以下载资源了。`);
            onOpenChange(false);
        } catch (reason) {
            if (!request.signal.aborted) {
                notifyError(
                    reason instanceof Error ? reason.message : `${client.pointsLabel}支付失败`
                );
            }
        } finally {
            if (!request.signal.aborted) {
                setPayingPoints(false);
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>购买下载</DialogTitle>
                    <DialogDescription>完成付款后，返回这里确认付款结果并获取资源。</DialogDescription>
                </DialogHeader>
                <div className="grid min-w-0 gap-3 rounded-lg border border-line p-4">
                    <p className="break-words text-sm font-medium text-ink">{order.title}</p>
                    <dl className="grid min-w-0 gap-2 text-xs">
                        <div className="flex flex-wrap justify-between gap-2">
                            <dt className="text-ink-faint">应付金额</dt>
                            <dd className="text-lg font-semibold tabular-nums text-ink">¥{order.amount}</dd>
                        </div>
                        {client.pointsEnabled ? (
                            <div className="flex flex-wrap justify-between gap-2">
                                <dt className="text-ink-faint">{client.pointsLabel}抵扣</dt>
                                <dd className="tabular-nums text-ink">
                                    {Math.max(
                                        1,
                                        Math.ceil(
                                            Number(order.amount) * client.pointsRate
                                        )
                                    ).toLocaleString('zh-CN')}{' '}
                                    {client.pointsLabel}
                                </dd>
                            </div>
                        ) : null}
                        <div className="grid min-w-0 gap-1 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
                            <dt className="text-ink-faint">订单号</dt>
                            <dd className="break-all font-mono text-ink-mute sm:text-right">{order.number}</dd>
                        </div>
                    </dl>
                </div>
                {paymentOptions.length === 0 && !client.balanceEnabled && !client.pointsEnabled ? (
                    <p className="text-sm text-ink-mute">支付链接暂不可用，请返回资源页重新下单。</p>
                ) : paymentOptions.length === 0 ? (
                    <p className="text-sm text-ink-mute">
                        可使用账户余额或{client.pointsLabel}直接结算，支付成功后立即解锁资源。
                    </p>
                ) : paymentOptions.length > 1 ? (
                    <p className="text-sm text-ink-mute">可选择一种付款方式完成支付，付款后返回这里确认结果。</p>
                ) : null}
                <DialogFooter>
                    <div className="flex w-full flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => void checkPayment()} disabled={checking}>
                            {checking ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
                            {checking ? '查询中…' : '我已支付'}
                        </Button>
                        {client.balanceEnabled ? (
                            <Button type="button" onClick={() => void payWithBalance()} disabled={payingBalance}>
                                {payingBalance ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Wallet aria-hidden="true" />}
                                {payingBalance ? '支付中…' : `用${client.balanceLabel}支付`}
                            </Button>
                        ) : null}
                        {client.pointsEnabled ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void payWithPoints()}
                                disabled={payingPoints}
                            >
                                {payingPoints ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <Coins aria-hidden="true" />
                                )}
                                {payingPoints
                                    ? '支付中…'
                                    : `用 ${Math.max(
                                          1,
                                          Math.ceil(Number(order.amount) * client.pointsRate)
                                      )} ${client.pointsLabel}支付`}
                            </Button>
                        ) : null}
                        {paymentOptions.map((option) => (
                            <Button asChild key={option.method + '\n' + option.url}>
                                <a href={option.url} target="_blank" rel="noopener noreferrer" data-ttdf-reload>
                                    <CreditCard aria-hidden="true" />
                                    {option.method === 'default' ? option.label : `前往${option.label}付款`}
                                    <ExternalLink aria-hidden="true" />
                                </a>
                            </Button>
                        ))}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DownloadOrderActions({
    client,
    order,
    onOrderChange,
}: {
    client: DownloadsClient;
    order: DownloadOrder;
    onOrderChange: (order: DownloadOrder) => void;
}) {
    const [busy, setBusy] = useState(false);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [readyUrl, setReadyUrl] = useState('');
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);

    const download = async () => {
        if (busy) {
            return;
        }

        const popup = openDownloadWindow();
        const request = new AbortController();
        controller.current = request;
        setBusy(true);
        setReadyUrl('');
        try {
            await completeDownload({
                client,
                order,
                popup,
                signal: request.signal,
                onOrderChange,
                onReady: setReadyUrl,
            });
        } catch (reason) {
            if (!request.signal.aborted) {
                notifyError(reason instanceof Error ? reason.message : '下载失败，请稍后再试');
            }
        } finally {
            if (!request.signal.aborted) {
                setBusy(false);
            }
        }
    };

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
            {order.status === 'pending' ? (
                <Button type="button" size="sm" onClick={() => setPaymentOpen(true)}>
                    <CreditCard aria-hidden="true" />
                    继续付款
                </Button>
            ) : order.status === 'paid' || order.status === 'free' ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void download()} disabled={busy}>
                    {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowDownToLine aria-hidden="true" />}
                    {busy ? '准备中…' : '下载资源'}
                </Button>
            ) : null}
            {readyUrl !== '' ? (
                <Button asChild size="sm" variant="link">
                    <a href={readyUrl} target="_blank" rel="noopener noreferrer" data-ttdf-reload>
                        打开下载链接
                        <ExternalLink aria-hidden="true" />
                    </a>
                </Button>
            ) : null}
            <PaymentDialog
                client={client}
                order={order}
                open={paymentOpen}
                onOpenChange={setPaymentOpen}
                onOrderChange={onOrderChange}
            />
        </div>
    );
}

export default function DownloadCard({ offer }: { offer: DownloadOffer }) {
    const [order, setOrder] = useState<DownloadOrder | null>(null);
    const [busy, setBusy] = useState(false);
    const [remaining, setRemaining] = useState(offer.remaining);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [readyUrl, setReadyUrl] = useState('');
    const controller = useRef<AbortController | null>(null);
    const purchased = offer.purchased || order?.status === 'paid';
    const exhausted = !offer.paid && remaining !== null && remaining <= 0;
    const unavailable =
        !offer.available
        || (offer.paid
            && !purchased
            && !offer.paymentEnabled
            && !offer.balanceEnabled
            && !offer.pointsEnabled);

    useEffect(() => {
        setOrder(null);
        setRemaining(offer.remaining);
        setReadyUrl('');
        setPaymentOpen(false);
        setBusy(false);
        return () => controller.current?.abort();
    }, [offer.contentType, offer.contentId, offer.remaining]);

    const start = async () => {
        if (!offer.loggedIn) {
            window.dispatchEvent(new Event('ttdf:open-auth'));
            return;
        }
        if (busy || unavailable || exhausted) {
            return;
        }

        const popup = !offer.paid || purchased ? openDownloadWindow() : null;
        const request = new AbortController();
        controller.current = request;
        setBusy(true);
        setReadyUrl('');
        try {
            const next = order?.status === 'paid'
                ? order
                : await createDownloadOrder({
                    client: offer,
                    contentType: offer.contentType,
                    contentId: offer.contentId,
                    signal: request.signal,
                });
            setOrder(next);
            if (next.status === 'pending') {
                popup?.close();
                setPaymentOpen(true);
                return;
            }
            if (next.status !== 'paid' && next.status !== 'free') {
                throw new Error('订单暂不可下载，请重新下单');
            }

            await completeDownload({
                client: offer,
                order: next,
                popup,
                signal: request.signal,
                onOrderChange: setOrder,
                onReady: setReadyUrl,
                onRemainingChange: setRemaining,
            });
        } catch (reason) {
            popup?.close();
            if (!request.signal.aborted) {
                notifyError(reason instanceof Error ? reason.message : '获取资源失败，请稍后再试');
            }
        } finally {
            if (!request.signal.aborted) {
                setBusy(false);
            }
        }
    };

    if (!offer.enabled) {
        return null;
    }

    const label = !offer.loggedIn
        ? '登录后下载'
        : exhausted
            ? '今日次数已用完'
            : offer.paid && !purchased
                ? '购买下载'
                : '下载资源';

    return (
        <section className="surface-card card-pad grid min-w-0 gap-4" aria-label="资源下载">
            <div className="flex min-w-0 flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-mute">
                    {offer.paid ? <LockKeyhole className="size-5" strokeWidth={1.7} aria-hidden="true" /> : <ArrowDownToLine className="size-5" strokeWidth={1.7} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-ink">资源下载</h2>
                        <Badge variant="secondary">{purchased ? '已购买' : offer.paid ? '付费资源' : '免费资源'}</Badge>
                    </div>
                    <p className="mt-1 break-words text-xs text-ink-mute">{offer.title}</p>
                </div>
                {offer.paid ? <p className="text-xl font-semibold tabular-nums text-ink">¥{offer.price}</p> : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs leading-5 text-ink-faint" aria-live="polite">
                    {unavailable
                        ? '资源暂不可下载，请联系发布者。'
                        : offer.paid
                            ? purchased ? '已解锁，可重复下载。' : '付款成功后即可获取下载链接。'
                            : offer.limit > 0
                                ? offer.loggedIn ? `今日免费次数剩余 ${remaining ?? Math.max(0, offer.limit - offer.used)} / ${offer.limit}` : `每人每天可免费下载 ${offer.limit} 次`
                                : '免费下载，下载记录可在用户中心查看。'}
                </p>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {readyUrl !== '' ? (
                        <Button asChild variant="outline" size="sm">
                            <a href={readyUrl} target="_blank" rel="noopener noreferrer" data-ttdf-reload>
                                打开下载链接
                                <ExternalLink aria-hidden="true" />
                            </a>
                        </Button>
                    ) : null}
                    <Button type="button" onClick={() => void start()} disabled={busy || (offer.loggedIn && (unavailable || exhausted))}>
                        {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <ArrowDownToLine aria-hidden="true" />}
                        {busy ? '准备中…' : label}
                    </Button>
                </div>
            </div>
            {order ? (
                <PaymentDialog
                    client={offer}
                    order={order}
                    open={paymentOpen}
                    onOpenChange={setPaymentOpen}
                    onOrderChange={setOrder}
                />
            ) : null}
        </section>
    );
}
