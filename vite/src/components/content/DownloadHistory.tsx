import { useEffect, useState } from 'react';
import { ArrowDownToLine, ChevronLeft, ChevronRight, ClipboardList, LoaderCircle, RefreshCw } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { DownloadOrderActions } from './DownloadCard';
import { downloadDate, DOWNLOAD_STATUS_LABELS, fetchDownloadHistory } from '../../lib/downloads';
import type { DownloadHistoryPage, DownloadOrder, DownloadsClient } from '../../lib/downloads';
import { notifyError } from '../../lib/notify';

export default function DownloadHistory({ client }: { client: DownloadsClient }) {
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<DownloadHistoryPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError('');
        void fetchDownloadHistory({ client, page, signal: controller.signal }).then((data) => {
            if (!controller.signal.aborted) {
                setResult(data);
            }
        }).catch((reason) => {
            if (!controller.signal.aborted) {
                const message = reason instanceof Error ? reason.message : '读取下载记录失败';
                setError(message);
                notifyError(message);
            }
        }).finally(() => {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        });

        return () => controller.abort();
    }, [client.endpoints.history, client.nonce, page, revision]);

    const updateOrder = (order: DownloadOrder) => {
        setResult((current) => current ? {
            ...current,
            items: current.items.map((item) => item.number === order.number ? order : item),
        } : current);
    };

    return (
        <section className="grid min-w-0 gap-4" aria-label="订单与下载记录" aria-busy={loading}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                        <ClipboardList className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                        订单&下载
                    </h2>
                    <p className="mt-1 text-xs text-ink-faint">查看免费领取、购买订单和下载记录。</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setRevision((current) => current + 1)} disabled={loading}>
                    <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
                    刷新
                </Button>
            </div>
            {loading && result === null ? (
                <div className="grid min-h-40 place-items-center rounded-lg border border-line" role="status">
                    <span className="flex items-center gap-2 text-sm text-ink-mute">
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                        正在读取下载记录…
                    </span>
                </div>
            ) : error !== '' ? (
                <div className="grid gap-3 rounded-lg border border-line p-5">
                    <p className="text-sm text-ink-mute" role="alert">{error}</p>
                    <div><Button type="button" variant="outline" size="sm" onClick={() => setRevision((current) => current + 1)}>重新加载</Button></div>
                </div>
            ) : result && result.items.length > 0 ? (
                <>
                    <div className="grid min-w-0 gap-3">
                        {result.items.map((order) => (
                            <article key={order.number} className="grid min-w-0 gap-3 rounded-lg border border-line p-4">
                                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 basis-40">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant={order.status === 'paid' || order.status === 'free' ? 'secondary' : 'outline'}>
                                                {DOWNLOAD_STATUS_LABELS[order.status]}
                                            </Badge>
                                            <span className="text-xs text-ink-faint">{order.contentType === 'topic' ? '帖子资源' : '文章资源'}</span>
                                        </div>
                                        <h3 className="mt-2 break-words text-sm font-medium text-ink">
                                            {order.contentUrl !== '' ? <a href={order.contentUrl} className="hover:text-brand">{order.title || '未命名资源'}</a> : order.title || '未命名资源'}
                                        </h3>
                                    </div>
                                    <p className="shrink-0 text-base font-semibold tabular-nums text-ink">
                                        {order.status === 'free' ? '免费' : `¥${order.amount}`}
                                    </p>
                                </div>
                                <dl className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
                                    <div className="min-w-0 sm:col-span-2">
                                        <dt className="mb-1 text-ink-faint">订单号</dt>
                                        <dd className="break-all font-mono text-ink-mute">{order.number}</dd>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                        <dt className="text-ink-faint">创建时间</dt>
                                        <dd className="text-ink-mute">{downloadDate(order.createdAt)}</dd>
                                    </div>
                                    <div className="flex items-center gap-2 text-ink-mute">
                                        <ArrowDownToLine className="size-3.5 shrink-0" aria-hidden="true" />
                                        <dt>下载次数</dt>
                                        <dd className="tabular-nums">{order.downloadCount}</dd>
                                    </div>
                                </dl>
                                <div className="border-t border-line pt-3">
                                    <DownloadOrderActions client={client} order={order} onOrderChange={updateOrder} />
                                </div>
                            </article>
                        ))}
                    </div>
                    <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="下载记录分页">
                        <p className="text-xs text-ink-faint">共 {result.total} 个订单 · 第 {result.page} / {result.lastPage} 页</p>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>
                                <ChevronLeft aria-hidden="true" />
                                上一页
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={loading || page >= result.lastPage} onClick={() => setPage((current) => current + 1)}>
                                下一页
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </div>
                    </nav>
                </>
            ) : (
                <div className="grid min-h-40 place-items-center rounded-lg border border-dashed border-line p-5 text-center">
                    <div className="grid justify-items-center gap-3">
                        <ArrowDownToLine className="size-8 text-ink-faint" strokeWidth={1.2} aria-hidden="true" />
                        <p className="text-sm text-ink-mute">还没有下载订单</p>
                        <p className="text-xs text-ink-faint">领取或购买资源后，可在这里查看。</p>
                    </div>
                </div>
            )}
        </section>
    );
}
