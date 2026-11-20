import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
    Image as ImageIcon,
    LoaderCircle,
    Search,
    Trash2,
    Upload,
} from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { notifyError, notifySuccess } from '../../lib/notify';
import { errorMessage, readPayload } from '../../lib/user';
import type { MediaItem, UploadPurpose, UserApiEndpoints } from '../../types';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    api?: UserApiEndpoints;
    mediaEndpoint?: string;
    uploadPurpose?: UploadPurpose;
    allowDelete?: boolean;
    title?: string;
    description?: string;
    onSelect: (item: MediaItem) => void;
}

interface MediaPayload {
    items?: unknown;
    page?: unknown;
    total?: unknown;
    lastPage?: unknown;
}

function itemsFrom(payload: { data?: unknown } | null): MediaPayload {
    const data = payload?.data;
    return data && typeof data === 'object' ? (data as MediaPayload) : {};
}

function mediaItems(payload: { data?: unknown } | null): MediaItem[] {
    const rows = itemsFrom(payload).items;
    return Array.isArray(rows) ? (rows as MediaItem[]) : [];
}

function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
        return '未知大小';
    }

    if (value < 1024) {
        return `${value} B`;
    }

    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaLibrary({
    open,
    onOpenChange,
    api,
    mediaEndpoint,
    uploadPurpose,
    allowDelete = true,
    title = '媒体库',
    description,
    onSelect,
}: Props) {
    const [items, setItems] = useState<MediaItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [keyword, setKeyword] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [copied, setCopied] = useState<number | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const requestId = useRef(0);
    const endpointUrl = mediaEndpoint ?? api?.content.media ?? '';

    const load = useCallback(
        async (nextPage: number, search: string) => {
            const current = ++requestId.current;
            setLoading(true);

            try {
                if (endpointUrl === '') {
                    throw new Error('媒体库接口未启用');
                }

                const endpoint = new URL(endpointUrl, window.location.href);
                endpoint.searchParams.set('page', String(Math.max(1, nextPage)));
                endpoint.searchParams.set('pageSize', '24');
                if (search.trim() !== '') {
                    endpoint.searchParams.set('search', search.trim());
                }

                const response = await fetch(endpoint.toString(), {
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        ...(uploadPurpose ? { 'X-Upload-Purpose': uploadPurpose } : {}),
                    },
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取媒体库失败'));
                }
                if (current !== requestId.current) {
                    return;
                }

                const meta = itemsFrom(payload);
                setItems(mediaItems(payload));
                setPage(Number(meta.page) > 0 ? Number(meta.page) : 1);
                setTotal(Number(meta.total) > 0 ? Number(meta.total) : 0);
                setLastPage(Number(meta.lastPage) > 0 ? Number(meta.lastPage) : 1);
            } catch (reason) {
                if (current === requestId.current) {
                    notifyError(
                        reason instanceof Error ? reason.message : '读取媒体库失败'
                    );
                }
            } finally {
                if (current === requestId.current) {
                    setLoading(false);
                }
            }
        },
        [endpointUrl, uploadPurpose]
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = window.setTimeout(() => {
            void load(1, keyword);
        }, 250);

        return () => window.clearTimeout(timer);
    }, [open, keyword, load]);

    const upload = async (files: File[]) => {
        const images = files.filter((file) => file.type.startsWith('image/'));
        if (images.length === 0 || uploading) {
            return;
        }

        setUploading(true);

        try {
            for (const file of images) {
                const body = new FormData();
                body.append('file', file);
                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        ...(uploadPurpose ? { 'X-Upload-Purpose': uploadPurpose } : {}),
                    },
                    body,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '图片上传失败'));
                }
            }

            await load(1, keyword);
            notifySuccess(`已上传 ${images.length} 张图片。`);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '图片上传失败');
        } finally {
            setUploading(false);
            if (fileInput.current) {
                fileInput.current.value = '';
            }
        }
    };

    const remove = async () => {
        if (!deleteTarget || deleting) {
            return;
        }

        setDeleting(true);

        try {
            const response = await fetch(`${endpointUrl}/${deleteTarget.id}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    ...(uploadPurpose ? { 'X-Upload-Purpose': uploadPurpose } : {}),
                },
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '删除图片失败'));
            }

            setDeleteTarget(null);
            notifySuccess(`「${deleteTarget.title}」已删除。`);
            const nextPage = items.length === 1 && page > 1 ? page - 1 : page;
            await load(nextPage, keyword);
        } catch (reason) {
            notifyError(reason instanceof Error ? reason.message : '删除图片失败');
        } finally {
            setDeleting(false);
        }
    };

    const copy = async (item: MediaItem) => {
        try {
            await navigator.clipboard.writeText(item.url);
            setCopied(item.id);
            notifySuccess('图片地址已复制。');
            window.setTimeout(() => setCopied(null), 1500);
        } catch {
            notifyError('复制失败，请手动选择图片地址。');
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        <DialogDescription>
                            {description ?? `共 ${total} 张图片 · 点击图片选择 · 支持拖拽上传`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative min-w-[180px] flex-1">
                            <Search
                                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                                aria-hidden="true"
                            />
                            <Input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                placeholder="按文件名搜索"
                                className="pl-8"
                                aria-label="搜索媒体库"
                            />
                        </div>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => void upload(Array.from(event.target.files ?? []))}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={uploading}
                            onClick={() => fileInput.current?.click()}
                        >
                            {uploading ? (
                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                            ) : (
                                <Upload aria-hidden="true" />
                            )}
                            {uploading ? '上传中…' : '上传图片'}
                        </Button>
                    </div>

                    <div
                        className="min-h-[260px] overflow-y-auto pr-1"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            void upload(Array.from(event.dataTransfer.files ?? []));
                        }}
                    >
                        {loading ? (
                            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                                {Array.from({ length: 8 }).map((_, index) => (
                                    <Skeleton key={index} className="aspect-[4/3] rounded-lg" />
                                ))}
                            </div>
                        ) : items.length === 0 ? (
                            <div className="grid min-h-[240px] place-content-center justify-items-center gap-2 text-center">
                                <ImageIcon className="size-9 text-ink-faint" strokeWidth={1.4} aria-hidden="true" />
                                <p className="text-sm text-ink-mute">
                                    {keyword.trim() !== ''
                                        ? '没有匹配的图片，换个关键词试试。'
                                        : '还没有图片，上传一张开始使用。'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                                {items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="group relative overflow-hidden rounded-lg border border-line bg-surface-2"
                                    >
                                        <button
                                            type="button"
                                            className="block w-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                            title={`${item.title} · ${formatBytes(item.size)}`}
                                            onClick={() => {
                                                onSelect(item);
                                                onOpenChange(false);
                                            }}
                                        >
                                            <img
                                                src={item.url}
                                                alt={item.title}
                                                loading="lazy"
                                                className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                                            />
                                        </button>

                                        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="icon-xs"
                                                aria-label={`复制 ${item.title} 的链接`}
                                                onClick={() => void copy(item)}
                                            >
                                                {copied === item.id ? (
                                                    <Check aria-hidden="true" />
                                                ) : (
                                                    <Copy aria-hidden="true" />
                                                )}
                                            </Button>
                                            {allowDelete ? (
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="icon-xs"
                                                    aria-label={`删除 ${item.title}`}
                                                    onClick={() => setDeleteTarget(item)}
                                                >
                                                    <Trash2 aria-hidden="true" />
                                                </Button>
                                            ) : null}
                                        </div>

                                        <div className="border-t border-line px-2 py-1.5">
                                            <p className="truncate text-[11px] font-medium text-ink">
                                                {item.title}
                                            </p>
                                            <p className="mt-0.5 truncate text-[10px] text-ink-faint">
                                                {formatBytes(item.size)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {lastPage > 1 ? (
                        <div className="flex items-center justify-center gap-2 text-sm text-ink-mute">
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                disabled={page <= 1 || loading}
                                aria-label="上一页"
                                onClick={() => void load(page - 1, keyword)}
                            >
                                <ChevronLeft aria-hidden="true" />
                            </Button>
                            <span className="tabular-nums">
                                {page} / {lastPage}
                            </span>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                disabled={page >= lastPage || loading}
                                aria-label="下一页"
                                onClick={() => void load(page + 1, keyword)}
                            >
                                <ChevronRight aria-hidden="true" />
                            </Button>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={(next) => {
                    if (!next) {
                        setDeleteTarget(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除这张图片？</AlertDialogTitle>
                        <AlertDialogDescription>
                            「{deleteTarget?.title ?? ''}」删除后，引用该地址的内容会失效。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleting}
                            onClick={(event) => {
                                event.preventDefault();
                                void remove();
                            }}
                        >
                            {deleting ? '删除中…' : '确认删除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
