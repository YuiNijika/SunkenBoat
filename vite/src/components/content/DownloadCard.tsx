import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, Coins, CreditCard, ExternalLink, LoaderCircle, LockKeyhole, Wallet } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
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
    const [gatewayStarted, setGatewayStarted] = useState(false);
    const [selected, setSelected] = useState<'balance' | 'points' | number | null>(null);
    const controller = useRef<AbortController | null>(null);
    const paymentOptions = order.paymentOptions.filter((option) => safeDownloadUrl(option.url) !== '');

    useEffect(() => () => controller.current?.abort(), []);

    useEffect(() => {
        const fallback: 'balance' | 'points' | number | null = client.balanceEnabled
            ? 'balance'
            : client.pointsEnabled
              ? 'points'
              : paymentOptions.length > 0
                ? 0
                : null;
        setSelected(fallback);
    }, [client.balanceEnabled, client.pointsEnabled, open, order.number, paymentOptions.length]);

    useEffect(() => {
        if (!open || !gatewayStarted) {
            return;
        }

        let cancelled = false;
        let timer = 0;
        const deadline = Date.now() + 15 * 60 * 1000;
        const request = new AbortController();

        const detect = async () => {
            if (cancelled || Date.now() > deadline) {
                return;
            }

            try {
                const next = await checkDownloadOrder({
                    client,
                    orderNumber: order.number,
                    signal: request.signal,
                });
                if (cancelled) {
                    return;
                }
                if (next.status === 'paid') {
                    onOrderChange(next);
                    onOpenChange(false);
                    notifySuccess('付款已确认，现在可以下载了。');
                    return;
                }
                if (next.status === 'cancelled') {
                    onOpenChange(false);
                    notifyError('订单已取消，请重新下单。');
                    return;
                }
            } catch {
                // Keep polling through transient network errors.
            }

            if (!cancelled) {
                timer = window.setTimeout(detect, 4000);
            }
        };

        const onFocus = () => {
            window.clearTimeout(timer);
            void detect();
        };

        timer = window.setTimeout(detect, 3500);
        window.addEventListener('focus', onFocus);

        return () => {
            cancelled = true;
            request.abort();
            window.clearTimeout(timer);
            window.removeEventListener('focus', onFocus);
        };
    }, [client, onOpenChange, onOrderChange, open, order.number, gatewayStarted]);

    const checkPayment = async () => {
        if (checking) {
            return;
        }

        const popup = openDownloadWindow();
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
                await completeDownload({
                    client,
                    order: next,
                    popup,
                    signal: request.signal,
                    onOrderChange,
                    onReady: () => {
                        onOpenChange(false);
                    },
                });
            } else if (next.status === 'cancelled') {
                popup?.close();
                notifyError('订单已取消，请返回资源页重新下单。');
            } else {
                popup?.close();
                notifyInfo('暂未收到付款结果，请完成付款后再试。');
            }
        } catch (reason) {
            popup?.close();
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
        const popup = openDownloadWindow();
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
            await completeDownload({
                client,
                order: next,
                popup,
                signal: request.signal,
                onOrderChange,
                onReady: () => {
                    onOpenChange(false);
                },
            });
        } catch (reason) {
            popup?.close();
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
        const popup = openDownloadWindow();
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
            await completeDownload({
                client,
                order: next,
                popup,
                signal: request.signal,
                onOrderChange,
                onReady: () => {
                    onOpenChange(false);
                },
            });
        } catch (reason) {
            popup?.close();
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

    const openGateway = (url: string) => {
        setGatewayStarted(true);
        const popup = window.open(url, '_blank');
        if (popup) {
            popup.opener = null;
        }
        if (!popup) {
            notifyInfo('浏览器拦截了付款窗口，请允许弹出窗口后再试。');
        }
    };

    const pointsCost = client.pointsEnabled
        ? Math.max(1, Math.ceil(Number(order.amount) * client.pointsRate))
        : 0;
    const selectedGateway =
        typeof selected === 'number' ? paymentOptions[selected] ?? null : null;
    const busy = checking || payingBalance || payingPoints;
    const primaryLabel =
        selected === 'balance'
            ? `使用${client.balanceLabel}支付 ¥${order.amount}`
            : selected === 'points'
              ? `使用 ${pointsCost} ${client.pointsLabel}支付`
              : selectedGateway !== null
                ? `前往${selectedGateway.label}支付`
                : '暂无可用的付款方式';

    const paySelected = () => {
        if (busy || selected === null) {
            return;
        }
        if (selected === 'balance') {
            void payWithBalance();
            return;
        }
        if (selected === 'points') {
            void payWithPoints();
            return;
        }
        if (selectedGateway !== null) {
            openGateway(selectedGateway.url);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[min(88dvh,760px)] gap-0 overflow-hidden p-0 sm:max-w-[470px]">
                <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pr-12 pt-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-brand-soft text-brand">
                        <ArrowDownToLine className="size-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <DialogTitle className="text-[17px] leading-6">购买下载</DialogTitle>
                        <DialogDescription className="mt-1 text-[12px] leading-5 text-ink-mute">
                            付款确认后自动获取下载链接；第三方支付可返回此处手动确认。
                        </DialogDescription>
                    </div>
                </div>

                <div className="grid gap-4 overflow-y-auto px-5 py-4">
                    <div className="rounded-[8px] border border-line bg-surface-2 p-4">
                        <p className="break-words text-[13px] font-medium leading-5 text-ink">
                            {order.title}
                        </p>
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
                            <span className="text-[11px] text-ink-faint">应付金额</span>
                            <span className="flex items-baseline gap-0.5 text-ink">
                                <span className="text-xs">¥</span>
                                <strong className="text-[26px] font-semibold tabular-nums leading-none">
                                    {order.amount}
                                </strong>
                            </span>
                        </div>
                        {pointsCost > 0 ? (
                            <p className="mt-2 text-[11px] text-ink-faint">
                                或使用 {pointsCost.toLocaleString('zh-CN')} {client.pointsLabel}
                            </p>
                        ) : null}
                        <p className="mt-2 break-all font-mono text-[10.5px] leading-5 text-ink-faint">
                            订单 {order.number}
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <p className="text-[11px] font-medium text-ink">选择支付方式</p>
                        {client.balanceEnabled ? (
                            <button
                                type="button"
                                role="radio"
                                aria-checked={selected === 'balance'}
                                onClick={() => setSelected('balance')}
                                className={
                                    'flex w-full items-center gap-3 rounded-[8px] border px-3.5 py-3 text-left transition-colors '
                                    + (selected === 'balance'
                                        ? 'border-brand/40 bg-brand-soft'
                                        : 'border-line bg-surface hover:border-brand/30 hover:bg-surface-2')
                                }
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-surface-2 text-ink-mute">
                                    <Wallet className="size-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[12.5px] font-medium text-ink">
                                        {client.balanceLabel}支付
                                    </span>
                                    <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                                        从账户{client.balanceLabel}中即时扣除
                                    </span>
                                </span>
                                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">
                                    ¥{order.amount}
                                </span>
                                <span
                                    className={
                                        'grid size-4 shrink-0 place-items-center rounded-full border '
                                        + (selected === 'balance'
                                            ? 'border-brand bg-brand text-brand-contrast'
                                            : 'border-line bg-surface')
                                    }
                                    aria-hidden="true"
                                >
                                    {selected === 'balance' ? (
                                        <CheckCircle2 className="size-2.5" strokeWidth={3} />
                                    ) : null}
                                </span>
                            </button>
                        ) : null}

                        {client.pointsEnabled ? (
                            <button
                                type="button"
                                role="radio"
                                aria-checked={selected === 'points'}
                                onClick={() => setSelected('points')}
                                className={
                                    'flex w-full items-center gap-3 rounded-[8px] border px-3.5 py-3 text-left transition-colors '
                                    + (selected === 'points'
                                        ? 'border-brand/40 bg-brand-soft'
                                        : 'border-line bg-surface hover:border-brand/30 hover:bg-surface-2')
                                }
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-surface-2 text-ink-mute">
                                    <Coins className="size-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[12.5px] font-medium text-ink">
                                        {client.pointsLabel}支付
                                    </span>
                                    <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                                        按当前兑换比例即时扣除
                                    </span>
                                </span>
                                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">
                                    {pointsCost.toLocaleString('zh-CN')} {client.pointsLabel}
                                </span>
                                <span
                                    className={
                                        'grid size-4 shrink-0 place-items-center rounded-full border '
                                        + (selected === 'points'
                                            ? 'border-brand bg-brand text-brand-contrast'
                                            : 'border-line bg-surface')
                                    }
                                    aria-hidden="true"
                                >
                                    {selected === 'points' ? (
                                        <CheckCircle2 className="size-2.5" strokeWidth={3} />
                                    ) : null}
                                </span>
                            </button>
                        ) : null}

                        {paymentOptions.map((option, index) => (
                            <button
                                key={option.method + ':' + option.url}
                                type="button"
                                role="radio"
                                aria-checked={selected === index}
                                onClick={() => setSelected(index)}
                                className={
                                    'flex w-full items-center gap-3 rounded-[8px] border px-3.5 py-3 text-left transition-colors '
                                    + (selected === index
                                        ? 'border-brand/40 bg-brand-soft'
                                        : 'border-line bg-surface hover:border-brand/30 hover:bg-surface-2')
                                }
                            >
                                <span className="grid size-9 shrink-0 place-items-center rounded-[6px] bg-surface-2 text-ink-mute">
                                    <CreditCard className="size-4" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12.5px] font-medium text-ink">
                                        {option.label}
                                    </span>
                                    <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                                        在新窗口完成付款
                                    </span>
                                </span>
                                <ExternalLink className="size-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                                <span
                                    className={
                                        'grid size-4 shrink-0 place-items-center rounded-full border '
                                        + (selected === index
                                            ? 'border-brand bg-brand text-brand-contrast'
                                            : 'border-line bg-surface')
                                    }
                                    aria-hidden="true"
                                >
                                    {selected === index ? (
                                        <CheckCircle2 className="size-2.5" strokeWidth={3} />
                                    ) : null}
                                </span>
                            </button>
                        ))}

                        {!client.balanceEnabled &&
                        !client.pointsEnabled &&
                        paymentOptions.length === 0 ? (
                            <p className="rounded-[6px] border border-dashed border-line bg-surface-2 px-3 py-4 text-[11px] leading-5 text-ink-faint">
                                当前没有可用的付款方式，请联系发布者或管理员。
                            </p>
                        ) : null}
                    </div>

                    <p className="flex items-start gap-2 rounded-[6px] bg-surface-2 px-3 py-2.5 text-[11px] leading-5 text-ink-faint">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {client.balanceEnabled || client.pointsEnabled
                            ? '余额与积分即时到账；第三方支付完成后返回本窗口点击“我已支付”。'
                            : '第三方支付完成后返回本窗口点击“我已支付”确认结果。'}
                    </p>
                </div>

                <DialogFooter className="gap-2 border-t border-line px-5 py-4 sm:flex-col sm:space-x-0">
                    <Button
                        type="button"
                        className="h-11 w-full"
                        onClick={paySelected}
                        disabled={busy || selected === null}
                    >
                        {busy ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : selectedGateway !== null ? (
                            <ExternalLink aria-hidden="true" />
                        ) : (
                            <CreditCard aria-hidden="true" />
                        )}
                        {busy ? '处理中…' : primaryLabel}
                    </Button>
                    <div className="flex w-full items-center justify-between gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                            稍后支付
                        </Button>
                        {paymentOptions.length > 0 ? (
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={() => void checkPayment()}
                                disabled={checking}
                            >
                                {checking ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <CheckCircle2 aria-hidden="true" />
                                )}
                                {checking ? '查询中…' : '我已支付'}
                            </Button>
                        ) : (
                            <span className="pr-1 text-[10.5px] text-ink-faint">余额或积分即时到账</span>
                        )}
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
                        <Badge variant="secondary">
                            {offer.isAuthor
                                ? '作者资源'
                                : purchased
                                  ? '已购买'
                                  : offer.paid
                                    ? '付费资源'
                                    : '免费资源'}
                        </Badge>
                    </div>
                    <p className="mt-1 break-words text-xs text-ink-mute">{offer.title}</p>
                </div>
                {offer.paid ? <p className="text-xl font-semibold tabular-nums text-ink">¥{offer.price}</p> : null}
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="text-xs leading-5 text-ink-faint" aria-live="polite">
                    {unavailable
                        ? '资源暂不可下载，请联系发布者。'
                        : offer.isAuthor
                            ? '作者本人可直接下载，不占用免费次数。'
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
