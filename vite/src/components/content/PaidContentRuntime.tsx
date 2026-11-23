import { useEffect, useRef, useState } from 'react';
import {
    CheckCircle2,
    Coins,
    CreditCard,
    LoaderCircle,
    ShieldCheck,
    Wallet,
} from 'lucide-react';
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
    checkPaidOrder,
    createPaidOrder,
    payPaidWithBalance,
    payPaidWithPoints,
    quoteFromButton,
} from '../../lib/paid';
import type { PaidClient, PaidOrder } from '../../lib/paid';
import { notifyError, notifyInfo, notifySuccess } from '../../lib/notify';

function reloadForUnlock(): void {
    window.setTimeout(() => window.location.reload(), 320);
}

function PaymentDialog({
    client,
    order,
    open,
    onOpenChange,
}: {
    client: PaidClient;
    order: PaidOrder;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [paying, setPaying] = useState<'balance' | 'points' | ''>('');
    const [checking, setChecking] = useState(false);
    const [gatewayStarted, setGatewayStarted] = useState(false);
    const [selected, setSelected] = useState<'balance' | 'points' | number | null>(null);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        setGatewayStarted(false);
        setChecking(false);
        setPaying('');
        return () => controller.current?.abort();
    }, [order.number, open]);

    useEffect(() => {
        const fallback: 'balance' | 'points' | number | null = order.balanceEnabled
            ? 'balance'
            : order.pointsEnabled
              ? 'points'
              : order.paymentOptions.length > 0
                ? 0
                : null;
        setSelected(fallback);
    }, [
        open,
        order.balanceEnabled,
        order.number,
        order.paymentOptions.length,
        order.pointsEnabled,
    ]);

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
                const next = await checkPaidOrder({
                    client,
                    orderNumber: order.number,
                    signal: request.signal,
                });
                if (cancelled) {
                    return;
                }
                if (next.status === 'paid') {
                    onOpenChange(false);
                    notifySuccess('付款已确认，正在解锁内容。');
                    reloadForUnlock();
                    return;
                }
                if (next.status === 'cancelled') {
                    onOpenChange(false);
                    notifyError('订单已取消，请刷新页面后重新购买。');
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
    }, [client, onOpenChange, open, order.number, gatewayStarted]);

    const payWithBalance = async () => {
        if (paying !== '') {
            return;
        }

        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setPaying('balance');
        try {
            const next = await payPaidWithBalance({
                client,
                orderNumber: order.number,
                signal: request.signal,
            });
            if (next.status !== 'paid') {
                throw new Error('余额支付尚未确认，请稍后重试');
            }
            onOpenChange(false);
            notifySuccess('支付成功，正在为你解锁内容。');
            reloadForUnlock();
        } catch (reason) {
            if (!request.signal.aborted) {
                notifyError(reason instanceof Error ? reason.message : '余额支付失败');
            }
        } finally {
            if (!request.signal.aborted) {
                setPaying('');
            }
        }
    };

    const payWithPoints = async () => {
        if (paying !== '') {
            return;
        }

        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setPaying('points');
        try {
            const next = await payPaidWithPoints({
                client,
                orderNumber: order.number,
                signal: request.signal,
            });
            if (next.status !== 'paid') {
                throw new Error('积分支付尚未确认，请稍后重试');
            }
            onOpenChange(false);
            notifySuccess('支付成功，正在为你解锁内容。');
            reloadForUnlock();
        } catch (reason) {
            if (!request.signal.aborted) {
                notifyError(reason instanceof Error ? reason.message : '积分支付失败');
            }
        } finally {
            if (!request.signal.aborted) {
                setPaying('');
            }
        }
    };

    const checkPayment = async () => {
        if (checking) {
            return;
        }

        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setChecking(true);
        try {
            const next = await checkPaidOrder({
                client,
                orderNumber: order.number,
                signal: request.signal,
            });
            if (next.status === 'paid') {
                onOpenChange(false);
                notifySuccess('付款已确认，正在解锁内容。');
                reloadForUnlock();
                return;
            }
            if (next.status === 'cancelled') {
                notifyError('订单已取消，请刷新页面后重新购买。');
                return;
            }
            notifyInfo('暂未收到付款结果，完成付款后再点一次。');
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

    const hasGateway = order.paymentOptions.length > 0;
    const pointsCost = order.pointsEnabled && order.pointsCost > 0 ? order.pointsCost : 0;
    const selectedGateway =
        typeof selected === 'number' ? order.paymentOptions[selected] ?? null : null;
    const busy = checking || paying !== '';
    const primaryLabel =
        selected === 'balance'
            ? `使用${order.balanceLabel}支付 ¥${order.amount}`
            : selected === 'points'
              ? `使用 ${pointsCost} ${order.pointsLabel}支付`
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
            setGatewayStarted(true);
            const popup = window.open(selectedGateway.url, '_blank');
            if (popup) {
                popup.opener = null;
            }
            if (!popup) {
                notifyInfo('浏览器拦截了付款窗口，请允许弹出窗口后再试。');
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[min(88dvh,760px)] gap-0 overflow-hidden p-0 sm:max-w-[470px]">
                <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pr-12 pt-5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-brand-soft text-brand">
                        <ShieldCheck className="size-5" strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <DialogTitle className="text-[17px] leading-6">解锁付费内容</DialogTitle>
                        <DialogDescription className="mt-1 text-[12px] leading-5 text-ink-mute">
                            付款确认后本页自动刷新并解锁；第三方支付可返回此处确认。
                        </DialogDescription>
                    </div>
                </div>

                <div className="grid gap-4 overflow-y-auto px-5 py-4">
                    <div className="rounded-[8px] border border-line bg-surface-2 p-4">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-[13px] font-medium leading-5 text-ink">
                                {order.title || '付费内容'}
                            </p>
                            <Badge variant="secondary" className="shrink-0">
                                待付款
                            </Badge>
                        </div>
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
                                或使用 {pointsCost.toLocaleString('zh-CN')} {order.pointsLabel}
                            </p>
                        ) : null}
                        <p className="mt-2 break-all font-mono text-[10.5px] leading-5 text-ink-faint">
                            订单 {order.number}
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <p className="text-[11px] font-medium text-ink">选择支付方式</p>
                        {order.balanceEnabled ? (
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
                                        {order.balanceLabel}支付
                                    </span>
                                    <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                                        从账户{order.balanceLabel}中即时扣除
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

                        {order.pointsEnabled ? (
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
                                        {order.pointsLabel}支付
                                    </span>
                                    <span className="mt-0.5 block text-[10.5px] text-ink-faint">
                                        按当前兑换比例即时扣除
                                    </span>
                                </span>
                                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">
                                    {pointsCost.toLocaleString('zh-CN')} {order.pointsLabel}
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

                        {order.paymentOptions.map((option, index) => (
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

                        {!order.balanceEnabled && !order.pointsEnabled && !hasGateway ? (
                            <p className="rounded-[6px] border border-dashed border-line bg-surface-2 px-3 py-4 text-[11px] leading-5 text-ink-faint">
                                当前没有可用的付款方式，请联系管理员配置支付通道。
                            </p>
                        ) : null}
                    </div>

                    <p className="flex items-start gap-2 rounded-[6px] bg-surface-2 px-3 py-2.5 text-[11px] leading-5 text-ink-faint">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {order.balanceEnabled || order.pointsEnabled
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
                            <CreditCard aria-hidden="true" />
                        ) : (
                            <ShieldCheck aria-hidden="true" />
                        )}
                        {busy ? '处理中…' : primaryLabel}
                    </Button>
                    <div className="flex w-full items-center justify-between gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                            稍后再说
                        </Button>
                        {hasGateway ? (
                            <Button
                                type="button"
                                variant="link"
                                size="sm"
                                onClick={() => void checkPayment()}
                                disabled={busy}
                            >
                                {checking ? (
                                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                                ) : (
                                    <CheckCircle2 aria-hidden="true" />
                                )}
                                {checking ? '查询中…' : '我已支付'}
                            </Button>
                        ) : (
                            <span className="pr-1 text-[10.5px] text-ink-faint">提交后自动解锁</span>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function PaidContentRuntime({ config }: { config: PaidClient }) {
    const [order, setOrder] = useState<PaidOrder | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const controller = useRef<AbortController | null>(null);

    useEffect(() => () => controller.current?.abort(), []);

    useEffect(() => {
        const onClick = async (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const button = target.closest<HTMLButtonElement>('[data-paid-buy]');
            if (!button) {
                return;
            }

            event.preventDefault();
            if (!config.loggedIn) {
                window.dispatchEvent(new Event('ttdf:open-auth'));
                return;
            }
            if (!config.enabled) {
                notifyError('付费内容暂不可用，请联系管理员。');
                return;
            }
            if (!config.storeReady) {
                notifyError('交易数据表尚未初始化，请管理员保存一次主题设置。');
                return;
            }
            if (button.disabled) {
                return;
            }

            const quote = quoteFromButton(button);
            if (!quote) {
                notifyError('购买信息已失效，请刷新页面后重试。');
                return;
            }

            controller.current?.abort();
            const request = new AbortController();
            controller.current = request;
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            try {
                const next = await createPaidOrder({
                    client: config,
                    quote,
                    signal: request.signal,
                });
                if (next.status === 'paid') {
                    notifySuccess('内容已购买，正在解锁。');
                    reloadForUnlock();
                    return;
                }
                if (next.status === 'cancelled') {
                    throw new Error('订单已取消，请刷新页面后重新购买');
                }
                setOrder(next);
                setDialogOpen(true);
            } catch (reason) {
                if (!request.signal.aborted) {
                    notifyError(reason instanceof Error ? reason.message : '创建订单失败');
                }
            } finally {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        };

        document.addEventListener('click', onClick);

        return () => document.removeEventListener('click', onClick);
    }, [config]);

    if (!order) {
        return null;
    }

    return (
        <PaymentDialog
            client={config}
            order={order}
            open={dialogOpen}
            onOpenChange={setDialogOpen}
        />
    );
}
