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
    DialogHeader,
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
    const controller = useRef<AbortController | null>(null);

    useEffect(() => {
        setGatewayStarted(false);
        setChecking(false);
        setPaying('');
        return () => controller.current?.abort();
    }, [order.number, open]);

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[min(88dvh,760px)] overflow-y-auto sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-md bg-brand-soft text-brand">
                            <ShieldCheck className="size-4" aria-hidden="true" />
                        </span>
                        解锁付费内容
                    </DialogTitle>
                    <DialogDescription>
                        选择一种付款方式。付款确认后，本页内容会自动刷新并解锁。
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                    <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">
                                    {order.title || '付费内容'}
                                </p>
                                <p className="mt-1 text-[11px] text-ink-faint">
                                    订单 {order.number}
                                </p>
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                                待付款
                            </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1 border-t border-line pt-3">
                            <p className="flex items-baseline gap-0.5 text-ink">
                                <span className="text-xs">¥</span>
                                <strong className="text-2xl font-semibold tabular-nums leading-none">
                                    {order.amount}
                                </strong>
                            </p>
                            {pointsCost > 0 ? (
                                <p className="pb-0.5 text-xs text-ink-mute">
                                    或 {pointsCost} {order.pointsLabel}
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <p className="text-xs font-medium text-ink">可用付款方式</p>
                        {order.balanceEnabled ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 justify-between"
                                onClick={() => void payWithBalance()}
                                disabled={paying !== ''}
                            >
                                <span className="flex items-center gap-2">
                                    <Wallet className="size-4" aria-hidden="true" />
                                    {order.balanceLabel}支付
                                </span>
                                <span className="text-[11px] font-normal text-ink-faint">
                                    ¥{order.amount}
                                </span>
                                {paying === 'balance' ? (
                                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                                ) : null}
                            </Button>
                        ) : null}
                        {order.pointsEnabled ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-11 justify-between"
                                onClick={() => void payWithPoints()}
                                disabled={paying !== ''}
                            >
                                <span className="flex items-center gap-2">
                                    <Coins className="size-4" aria-hidden="true" />
                                    {order.pointsLabel}支付
                                </span>
                                <span className="text-[11px] font-normal text-ink-faint">
                                    {pointsCost} {order.pointsLabel}
                                </span>
                                {paying === 'points' ? (
                                    <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                                ) : null}
                            </Button>
                        ) : null}
                        {order.paymentOptions.map((option) => (
                            <Button
                                key={option.method + option.url}
                                asChild
                                variant="outline"
                                className="h-11 justify-between"
                            >
                                <a
                                    href={option.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setGatewayStarted(true)}
                                >
                                    <span className="flex items-center gap-2">
                                        <CreditCard className="size-4" aria-hidden="true" />
                                        {option.label}
                                    </span>
                                    <span className="text-[11px] font-normal text-ink-faint">
                                        新窗口付款
                                    </span>
                                </a>
                            </Button>
                        ))}
                        {!order.balanceEnabled && !order.pointsEnabled && !hasGateway ? (
                            <p className="rounded-lg border border-dashed border-line bg-surface-2 px-3 py-4 text-xs leading-6 text-ink-faint">
                                当前没有可用的付款方式，请联系管理员配置支付通道。
                            </p>
                        ) : null}
                    </div>

                    <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-[11px] leading-5 text-ink-faint">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        余额和积分会即时扣除。第三方支付完成后，请回到本对话框点击“我已支付”确认结果。
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:space-x-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        稍后再说
                    </Button>
                    {hasGateway ? (
                        <Button
                            type="button"
                            variant={gatewayStarted ? 'default' : 'secondary'}
                            onClick={() => void checkPayment()}
                            disabled={checking || paying !== ''}
                        >
                            {checking ? (
                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                            ) : (
                                <CheckCircle2 aria-hidden="true" />
                            )}
                            {checking ? '查询中…' : '我已支付'}
                        </Button>
                    ) : null}
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
