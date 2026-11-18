import { useEffect, useMemo, useState } from 'react';
import {
    ExternalLink,
    FileText,
    MessageSquare,
    Pencil,
    Plus,
    Trash2,
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
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { errorMessage, readPayload } from '../../lib/user';
import {
    commentsFrom,
    contentListFrom,
    formatDate,
    formatDateTime,
} from '../../lib/content';
import type { CommentItem, ContentItem } from '../../lib/content';
import type { UserApiEndpoints, UserProfile } from '../../types';

interface Props {
    api: UserApiEndpoints;
    profile: UserProfile;
}

type Feedback = { tone: 'success' | 'error'; text: string };
type Tab = 'posts' | 'comments';

const STATUS_LABELS: Record<string, string> = {
    approved: '已通过',
    waiting: '待审核',
    spam: '垃圾评论',
};

export default function ContentManager({ api, profile }: Props) {
    const [tab, setTab] = useState<Tab>('posts');
    const [items, setItems] = useState<ContentItem[]>([]);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [contentMap, setContentMap] = useState<Record<number, ContentItem>>({});
    const [loading, setLoading] = useState(api.content.enabled);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentsLoaded, setCommentsLoaded] = useState(false);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [pendingDelete, setPendingDelete] = useState<ContentItem | null>(null);
    const [deleting, setDeleting] = useState(0);

    const enabled = api.content.enabled;
    const editorUrl = api.pages.editor;

    useEffect(() => {
        if (!enabled) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        let active = true;
        setLoading(true);

        void (async () => {
            try {
                const endpoint = new URL(api.content.contents, window.location.href);
                endpoint.searchParams.set('type', 'post');
                endpoint.searchParams.set('authorId', String(profile.uid));
                endpoint.searchParams.set('page', '1');
                endpoint.searchParams.set('pageSize', '50');

                const response = await fetch(endpoint.toString(), {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取文章列表失败'));
                }

                if (active) {
                    setItems(contentListFrom(payload));
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取文章列表失败',
                    });
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [enabled, api.content.contents, profile.uid]);

    useEffect(() => {
        if (!enabled || tab !== 'comments' || commentsLoaded) {
            return;
        }

        const controller = new AbortController();
        let active = true;
        setCommentsLoading(true);

        void (async () => {
            try {
                const endpoint = new URL(api.content.comments, window.location.href);
                endpoint.searchParams.set('page', '1');
                endpoint.searchParams.set('pageSize', '50');
                const response = await fetch(endpoint.toString(), {
                    credentials: 'same-origin',
                    headers: { Accept: 'application/json' },
                    signal: controller.signal,
                });
                const payload = await readPayload(response);
                if (!response.ok) {
                    throw new Error(errorMessage(payload, '读取历史评论失败'));
                }

                const rows = commentsFrom(payload);
                const cids = [...new Set(rows.map((comment) => comment.cid).filter((cid) => cid > 0))];
                const entries = await Promise.all(
                    cids.map(async (cid) => {
                        try {
                            const detail = await fetch(`${api.content.item}/${cid}`, {
                                credentials: 'same-origin',
                                headers: { Accept: 'application/json' },
                                signal: controller.signal,
                            });
                            if (!detail.ok) {
                                return null;
                            }
                            const detailPayload = await readPayload(detail);
                            return detailPayload?.data && typeof detailPayload.data === 'object'
                                ? ([cid, detailPayload.data as ContentItem] as const)
                                : null;
                        } catch {
                            return null;
                        }
                    })
                );

                if (active) {
                    setComments(rows);
                    setContentMap(
                        Object.fromEntries(
                            entries.filter((entry): entry is readonly [number, ContentItem] => entry !== null)
                        )
                    );
                    setCommentsLoaded(true);
                }
            } catch (reason) {
                if (reason instanceof DOMException && reason.name === 'AbortError') {
                    return;
                }

                if (active) {
                    setFeedback({
                        tone: 'error',
                        text: reason instanceof Error ? reason.message : '读取历史评论失败',
                    });
                }
            } finally {
                if (active) {
                    setCommentsLoading(false);
                }
            }
        })();

        return () => {
            active = false;
            controller.abort();
        };
    }, [
        enabled,
        tab,
        commentsLoaded,
        api.content.comments,
        api.content.item,
    ]);

    const commentCount = useMemo(
        () => (commentsLoaded ? comments.length : profile.comments ?? 0),
        [comments.length, commentsLoaded, profile.comments]
    );

    const openEditor = (cid = 0) => {
        window.location.assign(cid > 0 ? `${editorUrl}?cid=${cid}` : editorUrl);
    };

    const remove = async () => {
        if (!pendingDelete || deleting > 0) {
            return;
        }

        const target = pendingDelete;
        setDeleting(target.cid);

        try {
            const response = await fetch(`${api.content.posts}/${target.cid}`, {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            const payload = await readPayload(response);
            if (!response.ok) {
                throw new Error(errorMessage(payload, '删除文章失败'));
            }

            setItems((current) => current.filter((item) => item.cid !== target.cid));
            setFeedback({ tone: 'success', text: `《${target.title}》已删除。` });
            setPendingDelete(null);
        } catch (reason) {
            setFeedback({
                tone: 'error',
                text: reason instanceof Error ? reason.message : '删除文章失败',
            });
        } finally {
            setDeleting(0);
        }
    };

    if (!profile.canWrite) {
        return (
            <div className="content-empty">
                <p className="text-[14px] font-medium">当前账号没有发布权限</p>
                <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                    只有管理员与编辑可以在前台发布文章，请联系站点管理员调整用户组。
                </p>
            </div>
        );
    }

    if (!enabled) {
        return (
            <div className="content-empty">
                <p className="text-[14px] font-medium">内容发布暂不可用</p>
                <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                    站点尚未启用前台内容接口，请联系管理员在主题设置中开启。
                </p>
            </div>
        );
    }

    return (
        <div className="content-manager">
            <div className="content-manager-head">
                <div>
                    <p className="text-[14px] font-medium">内容管理</p>
                    <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                        管理文章草稿与发布状态，也可以查看自己留下的历史评论。
                    </p>
                </div>
                <Button type="button" size="sm" onClick={() => openEditor()}>
                    <Plus aria-hidden="true" />
                    写文章
                </Button>
            </div>

            <div className="content-tabs" role="tablist" aria-label="内容管理视图">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'posts'}
                    className={tab === 'posts' ? 'is-active' : ''}
                    onClick={() => setTab('posts')}
                >
                    <FileText aria-hidden="true" />
                    文章
                    <span>{items.length}</span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'comments'}
                    className={tab === 'comments' ? 'is-active' : ''}
                    onClick={() => setTab('comments')}
                >
                    <MessageSquare aria-hidden="true" />
                    历史评论
                    <span>{commentCount}</span>
                </button>
            </div>

            {feedback ? (
                <p
                    className={
                        'content-feedback ' +
                        (feedback.tone === 'error'
                            ? 'content-feedback-error'
                            : 'content-feedback-success')
                    }
                    role={feedback.tone === 'error' ? 'alert' : 'status'}
                >
                    {feedback.text}
                </p>
            ) : null}

            {tab === 'posts' ? (
                loading ? (
                    <div className="content-skeleton" aria-busy="true" aria-label="正在加载文章">
                        {[1, 2, 3].map((item) => (
                            <span key={item} className="content-skeleton-row" />
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="content-empty">
                        <FileText
                            className="mx-auto size-7 text-ink-faint"
                            strokeWidth={1.5}
                            aria-hidden="true"
                        />
                        <p className="mt-3 text-[13px] font-medium">还没有写过文章</p>
                        <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                            点击“写文章”开始第一篇内容。
                        </p>
                    </div>
                ) : (
                    <ul className="content-list">
                        {items.map((item) => (
                            <li key={item.cid} className="content-list-item">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-[13px] font-medium">
                                            {item.title || '未命名文章'}
                                        </p>
                                        <Badge variant={item.status === 'publish' ? 'default' : 'secondary'}>
                                            {item.status === 'publish' ? '已发布' : '草稿'}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
                                        <span>{formatDate(item.created)}</span>
                                        <span>{item.commentsNum} 条评论</span>
                                        {item.categories.length > 0 ? (
                                            <span className="truncate">
                                                {item.categories.map((category) => category.name).join(' / ')}
                                            </span>
                                        ) : null}
                                    </p>
                                </div>

                                <div className="content-list-actions">
                                    {item.permalink !== '' && item.status === 'publish' ? (
                                        <Button asChild variant="ghost" size="icon-sm" aria-label="查看文章">
                                            <a href={item.permalink} target="_blank" rel="noreferrer">
                                                <ExternalLink aria-hidden="true" />
                                            </a>
                                        </Button>
                                    ) : null}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`编辑 ${item.title}`}
                                        onClick={() => openEditor(item.cid)}
                                    >
                                        <Pencil aria-hidden="true" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`删除 ${item.title}`}
                                        onClick={() => setPendingDelete(item)}
                                    >
                                        <Trash2 aria-hidden="true" />
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )
            ) : commentsLoading ? (
                <div className="content-skeleton" aria-busy="true" aria-label="正在加载历史评论">
                    {[1, 2, 3].map((item) => (
                        <span key={item} className="content-skeleton-row" />
                    ))}
                </div>
            ) : comments.length === 0 ? (
                <div className="content-empty">
                    <MessageSquare
                        className="mx-auto size-7 text-ink-faint"
                        strokeWidth={1.5}
                        aria-hidden="true"
                    />
                    <p className="mt-3 text-[13px] font-medium">还没有历史评论</p>
                    <p className="mt-1 text-[12px] leading-5 text-ink-mute">
                        你参与过的评论会显示在这里。
                    </p>
                </div>
            ) : (
                <ul className="comment-history">
                    {comments.map((comment) => {
                        const content = contentMap[comment.cid];
                        return (
                            <li key={comment.coid} className="comment-history-item">
                                <div className="comment-history-head">
                                    <a
                                        href={content?.permalink || api.pages.content}
                                        className="comment-history-title"
                                    >
                                        {content?.title || `文章 #${comment.cid}`}
                                    </a>
                                    <Badge
                                        variant={comment.status === 'approved' ? 'secondary' : 'outline'}
                                    >
                                        {STATUS_LABELS[comment.status] ?? comment.status}
                                    </Badge>
                                    <time dateTime={comment.created}>
                                        {formatDateTime(comment.created)}
                                    </time>
                                </div>
                                <p className="comment-history-text">
                                    {comment.text.replace(/\s+/g, ' ').trim() || '（空评论）'}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            )}

            <AlertDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingDelete(null);
                    }
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>删除这篇文章？</AlertDialogTitle>
                        <AlertDialogDescription>
                            《{pendingDelete?.title ?? ''}》删除后无法恢复，相关评论也会一并移除。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting > 0}>取消</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleting > 0}
                            onClick={(event) => {
                                event.preventDefault();
                                void remove();
                            }}
                        >
                            {deleting > 0 ? '删除中…' : '确认删除'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
