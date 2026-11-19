import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp, MessageCircle, Reply } from 'lucide-react';
import type { CommentsData } from '../../types';
import MarkdownToolbar from '../content/MarkdownToolbar';
import MediaLibrary from '../content/MediaLibrary';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface ApiComment {
    coid: number;
    cid: number;
    author: string;
    avatar: string;
    url: string;
    text: string;
    html: string;
    parent: number;
    created: string;
    authorId: number;
    ownerId: number;
}

interface Props {
    data: CommentsData;
}

function EmptyComments({ image, text }: { image: string; text: string }) {
    return (
        <div className="comments-empty">
            {image !== '' ? (
                <img
                    className="comments-empty-image"
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                />
            ) : null}
            <p>{text}</p>
        </div>
    );
}

function highlightIn(root: HTMLElement | null): void {
    if (!root) {
        return;
    }

    void import('../../lib/highlight')
        .then(({ highlightCode }) => highlightCode(root))
        .catch(() => undefined);
}

function formatCommentTime(value: string): string {
    if (!value) {
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

function insertMediaMarkdown(
    textarea: HTMLTextAreaElement | null,
    setText: (value: string) => void,
    title: string,
    url: string
) {
    const alt = title.replace(/[[\]]/g, '').trim();
    const snippet = `\n![${alt}](${url})\n`;
    if (!textarea) {
        setText(snippet);
        return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const next = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
    setText(next);
    window.requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + snippet.length;
        textarea.setSelectionRange(cursor, cursor);
    });
}

function Avatar({ comment }: { comment: ApiComment }) {
    if (comment.avatar) {
        return (
            <img
                className="comment-avatar-img"
                src={comment.avatar}
                alt=""
                width={45}
                height={45}
                loading="lazy"
                decoding="async"
            />
        );
    }

    return (
        <span className="comment-avatar-img comment-avatar-fallback" aria-hidden="true">
            {(comment.author.trim().slice(0, 1) || '访').toUpperCase()}
        </span>
    );
}

function CommentItem({
    comment,
    replyTo,
    isReply,
    onReply,
}: {
    comment: ApiComment;
    replyTo?: string;
    isReply?: boolean;
    onReply: (comment: ApiComment) => void;
}) {
    const isOwner = comment.authorId > 0 && comment.authorId === comment.ownerId;

    return (
        <li
            className={isReply ? 'comment-item comment-item-reply' : 'comment-item'}
            itemScope
            itemType="http://schema.org/UserComments"
        >
            <div className="comment-inner">
                <div className="comment-avatar">
                    <Avatar comment={comment} />
                </div>

                <div className="comment-main">
                    <header className="comment-head">
                        {comment.url ? (
                            <a
                                className="comment-author"
                                href={comment.url}
                                rel="nofollow ugc noreferrer"
                                itemProp="creator"
                            >
                                {comment.author || '匿名'}
                            </a>
                        ) : (
                            <cite className="comment-author" itemProp="creator">
                                {comment.author || '匿名'}
                            </cite>
                        )}

                        {isOwner ? <span className="comment-role">博主</span> : null}

                        <a className="comment-time" href={`#comment-${comment.coid}`}>
                            <time dateTime={comment.created} itemProp="commentTime">
                                {formatCommentTime(comment.created)}
                            </time>
                        </a>

                    </header>

                    <div className="comment-content-row">
                        <div className="comment-content" itemProp="commentText">
                            {replyTo ? (
                                <p className="comment-mention">
                                    回复 <span>@{replyTo}</span>
                                </p>
                            ) : null}
                            <div
                                className="comment-body"
                                dangerouslySetInnerHTML={{ __html: comment.html || comment.text }}
                            />
                        </div>
                        <button
                            type="button"
                            className="comment-reply-btn"
                            aria-label={`回复 ${comment.author || '匿名'}`}
                            onClick={() => onReply(comment)}
                        >
                            <Reply className="size-3" strokeWidth={1.8} aria-hidden="true" />
                            回复
                        </button>
                    </div>
                </div>
            </div>
        </li>
    );
}

function LegacyComments({ data }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [text, setText] = useState('');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [expanded, setExpanded] = useState(!data.collapsed);
    const listRef = useRef<HTMLDivElement>(null);
    const rootCount = useMemo(() => {
        if (data.listHtml === '' || typeof DOMParser === 'undefined') {
            return 0;
        }

        const document = new DOMParser().parseFromString(data.listHtml, 'text/html');
        const list = document.querySelector('.comment-list');
        if (!list) {
            return 0;
        }

        return Array.from(list.children).filter((element) =>
            element.classList.contains('comment-item')
        ).length;
    }, [data.listHtml]);

    useEffect(() => {
        highlightIn(listRef.current);
    }, [data.listHtml, expanded]);

    return (
        <>
            {data.listHtml ? (
                <>
                    <div
                        className={
                            'comment-legacy' +
                            (data.collapsed && !expanded ? ' is-collapsed' : '')
                        }
                        ref={listRef}
                        dangerouslySetInnerHTML={{ __html: data.listHtml }}
                    />
                    {rootCount > 3 ? (
                        <div className="comments-more">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-expanded={expanded}
                                onClick={() => setExpanded((current) => !current)}
                            >
                                {expanded ? (
                                    <ChevronUp aria-hidden="true" />
                                ) : (
                                    <ChevronDown aria-hidden="true" />
                                )}
                                {expanded ? '收起评论' : `查看更多评论（${rootCount - 3}）`}
                            </Button>
                        </div>
                    ) : null}
                </>
            ) : (
                <EmptyComments image={data.nullImage} text="暂时没有评论，欢迎在上方留言。" />
            )}

            {data.paginationHtml ? (
                <nav
                    className="pagination mt-6"
                    aria-label="评论分页"
                    dangerouslySetInnerHTML={{ __html: data.paginationHtml }}
                />
            ) : null}

            {data.allow ? (
                <div id={data.respondId} className="respond comment-respond mt-6">
                    {data.cancelReplyHtml ? (
                        <div
                            className="cancel-comment-reply mb-3 text-sm text-ink-mute"
                            dangerouslySetInnerHTML={{ __html: data.cancelReplyHtml }}
                        />
                    ) : null}

                    <form method="post" action={data.action} id="comment-form" className="comment-form">
                        <div className="comment-field">
                            <div className="comment-field-head">
                                <Label htmlFor="comment-text">评论内容</Label>
                                <span className="comment-field-hint">
                                    支持 Markdown：代码块、链接与图片
                                </span>
                            </div>
                            <div className="markdown-editor">
                                <MarkdownToolbar
                                    target={textareaRef}
                                    onChange={setText}
                                    onImage={data.mediaEnabled ? () => setMediaOpen(true) : undefined}
                                />
                                <Textarea
                                    ref={textareaRef}
                                    id="comment-text"
                                    name="text"
                                    className="markdown-input"
                                    rows={5}
                                    required
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    placeholder="写下你的想法…支持 Markdown 语法"
                                />
                            </div>
                        </div>

                        {data.loggedIn ? (
                            <p className="comment-identity">
                                当前身份：
                                <a href={data.profileUrl}>{data.screenName}</a>
                                <span aria-hidden="true">·</span>
                                <a href={data.logoutUrl}>退出</a>
                            </p>
                        ) : (
                            <div className="comment-guest-grid">
                                <div className="comment-field">
                                    <Label htmlFor="comment-author">名字</Label>
                                    <Input
                                        type="text"
                                        id="comment-author"
                                        name="author"
                                        defaultValue={data.remember.author}
                                        autoComplete="nickname"
                                        required
                                    />
                                </div>
                                <div className="comment-field">
                                    <Label htmlFor="comment-mail">邮箱</Label>
                                    <Input
                                        type="email"
                                        id="comment-mail"
                                        name="mail"
                                        defaultValue={data.remember.mail}
                                        autoComplete="email"
                                        required={data.requireMail}
                                    />
                                </div>
                                <div className="comment-field">
                                    <Label htmlFor="comment-url">网站</Label>
                                    <Input
                                        type="url"
                                        id="comment-url"
                                        name="url"
                                        defaultValue={data.remember.url}
                                        autoComplete="url"
                                        placeholder={data.requireUrl ? '' : '选填'}
                                        required={data.requireUrl}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="comment-submit">
                            <Button type="submit">提交评论</Button>
                        </div>
                    </form>
                    <MediaLibrary
                        open={mediaOpen}
                        onOpenChange={setMediaOpen}
                        mediaEndpoint={data.mediaEndpoint}
                        uploadPurpose="article"
                        onSelect={(item) => {
                            insertMediaMarkdown(textareaRef.current, setText, item.title, item.url);
                            setMediaOpen(false);
                        }}
                    />
                </div>
            ) : null}
        </>
    );
}

export default function CommentsBlock({ data }: Props) {
    const title = data.title || '评论';
    const [comments, setComments] = useState<ApiComment[]>([]);
    const [loading, setLoading] = useState(data.apiEnabled);
    const [apiError, setApiError] = useState('');
    const [notice, setNotice] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [parent, setParent] = useState(0);
    const [parentTarget, setParentTarget] = useState('');
    const [text, setText] = useState('');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [author, setAuthor] = useState(data.remember.author);
    const [mail, setMail] = useState(data.remember.mail);
    const [url, setUrl] = useState(data.remember.url);
    const [expanded, setExpanded] = useState(!data.collapsed);
    const formRef = useRef<HTMLFormElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLOListElement>(null);

    const loadComments = async () => {
        if (!data.apiEnabled) {
            return;
        }

        setLoading(true);
        setApiError('');
        try {
            const endpoint = new URL(data.apiUrl, window.location.href);
            endpoint.searchParams.set('cid', String(data.cid));
            endpoint.searchParams.set('page', '1');
            endpoint.searchParams.set('pageSize', String(data.pageSize || 20));
            const response = await fetch(endpoint.toString(), {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload || !Array.isArray(payload.data)) {
                throw new Error(payload?.message || '评论接口请求失败');
            }
            setComments(payload.data);
        } catch (error) {
            setApiError(error instanceof Error ? error.message : '评论接口请求失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadComments();
    }, [data.apiEnabled, data.apiUrl, data.cid]);

    useEffect(() => {
        highlightIn(listRef.current);
    }, [comments, expanded]);

    const threads = useMemo(() => {
        const byId = new Map(comments.map((comment) => [comment.coid, comment]));
        const rootOf = (comment: ApiComment): ApiComment => {
            let current = comment;
            const seen = new Set<number>([comment.coid]);

            while (current.parent > 0) {
                const parentComment = byId.get(current.parent);
                if (!parentComment || seen.has(parentComment.coid)) {
                    break;
                }
                seen.add(parentComment.coid);
                current = parentComment;
            }

            return current;
        };
        const roots: ApiComment[] = [];
        const replies = new Map<number, ApiComment[]>();

        for (const comment of comments) {
            if (comment.parent <= 0 || !byId.has(comment.parent)) {
                roots.push(comment);
                continue;
            }

            const root = rootOf(comment);
            if (root.coid === comment.coid) {
                roots.push(comment);
                continue;
            }

            const list = replies.get(root.coid) ?? [];
            list.push(comment);
            replies.set(root.coid, list);
        }

        roots.sort((left, right) => left.created.localeCompare(right.created));
        for (const list of replies.values()) {
            list.sort((left, right) => left.created.localeCompare(right.created));
        }

        return {
            roots,
            replies,
            authors: new Map(comments.map((comment) => [comment.coid, comment.author || '匿名'])),
        };
    }, [comments]);

    const handleReply = (comment: ApiComment) => {
        setParent(comment.coid);
        setParentTarget(comment.author || '匿名');
        setNotice('');
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textareaRef.current?.focus();
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!data.apiEnabled) {
            return;
        }

        setSubmitting(true);
        setApiError('');
        setNotice('');
        try {
            const response = await fetch(data.apiUrl, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cid: data.cid,
                    text,
                    parent,
                    author,
                    mail,
                    url,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload || (payload.code !== 200 && payload.code !== 201)) {
                throw new Error(payload?.message || '评论提交失败');
            }

            setText('');
            setParent(0);
            setParentTarget('');
            const status = String(payload.data?.status ?? '');
            setNotice(
                status === 'waiting'
                    ? '评论已提交，审核通过后会显示。'
                    : '评论已发布。'
            );
            await loadComments();
        } catch (error) {
            setApiError(error instanceof Error ? error.message : '评论提交失败');
        } finally {
            setSubmitting(false);
        }
    };

    if (!data.allow) {
        return null;
    }

    const previewCount = 3;
    const visibleRoots = expanded ? threads.roots : threads.roots.slice(0, previewCount);
    const hiddenCount = threads.roots.length - visibleRoots.length;

    return (
        <Card className="surface-card comments-card" id="comments">
            <header className="comments-head">
                <div className="comments-title">
                    <span className="comments-title-icon">
                        <MessageCircle className="size-4" strokeWidth={1.6} aria-hidden="true" />
                    </span>
                    <h2>{title}</h2>
                </div>
                {data.countText ? <span className="comments-count">{data.countText}</span> : null}
            </header>

            {!data.apiEnabled ? (
                <LegacyComments data={data} />
            ) : (
                <>
                    <form ref={formRef} onSubmit={submit} className="comment-form comment-form-api">
                        {parent > 0 ? (
                            <div className="comment-replying">
                                <span>
                                    正在回复 <strong>@{parentTarget || `#${parent}`}</strong>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setParent(0);
                                        setParentTarget('');
                                    }}
                                >
                                    取消回复
                                </button>
                            </div>
                        ) : null}

                        <div className="comment-field">
                            <div className="comment-field-head">
                                <Label htmlFor="api-comment-text">评论内容</Label>
                                <span className="comment-field-hint">
                                    支持 Markdown：代码块、链接与图片
                                </span>
                            </div>
                            <div className="markdown-editor">
                                <MarkdownToolbar
                                    target={textareaRef}
                                    onChange={setText}
                                    onImage={data.mediaEnabled ? () => setMediaOpen(true) : undefined}
                                    disabled={submitting}
                                />
                                <Textarea
                                    ref={textareaRef}
                                    id="api-comment-text"
                                    className="markdown-input"
                                    rows={5}
                                    required
                                    value={text}
                                    onChange={(event) => setText(event.target.value)}
                                    placeholder="写下你的想法…支持 Markdown 语法"
                                />
                            </div>
                        </div>

                        {data.loggedIn ? (
                            <p className="comment-identity">
                                当前身份：
                                <a href={data.profileUrl}>{data.screenName}</a>
                            </p>
                        ) : (
                            <div className="comment-guest-grid">
                                <div className="comment-field">
                                    <Label htmlFor="api-comment-author">名字</Label>
                                    <Input
                                        id="api-comment-author"
                                        value={author}
                                        onChange={(event) => setAuthor(event.target.value)}
                                        autoComplete="nickname"
                                        required
                                    />
                                </div>
                                <div className="comment-field">
                                    <Label htmlFor="api-comment-mail">邮箱</Label>
                                    <Input
                                        id="api-comment-mail"
                                        type="email"
                                        value={mail}
                                        onChange={(event) => setMail(event.target.value)}
                                        autoComplete="email"
                                        required={data.requireMail}
                                    />
                                </div>
                                <div className="comment-field">
                                    <Label htmlFor="api-comment-url">网站</Label>
                                    <Input
                                        id="api-comment-url"
                                        type="url"
                                        value={url}
                                        onChange={(event) => setUrl(event.target.value)}
                                        autoComplete="url"
                                        placeholder={data.requireUrl ? '' : '选填'}
                                        required={data.requireUrl}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="comment-submit">
                            <Button type="submit" disabled={submitting}>
                                {submitting ? '提交中…' : '提交评论'}
                            </Button>
                        </div>
                    </form>
                    <MediaLibrary
                        open={mediaOpen}
                        onOpenChange={setMediaOpen}
                        mediaEndpoint={data.mediaEndpoint}
                        uploadPurpose="article"
                        onSelect={(item) => {
                            insertMediaMarkdown(textareaRef.current, setText, item.title, item.url);
                            setMediaOpen(false);
                        }}
                    />

                    {apiError ? (
                        <p className="comment-alert comment-alert-error" role="alert">
                            {apiError}
                        </p>
                    ) : null}
                    {notice ? (
                        <p className="comment-alert comment-alert-success" role="status">
                            {notice}
                        </p>
                    ) : null}

                    {loading ? (
                        <div className="comment-skeleton" aria-busy="true" aria-label="正在加载评论">
                            {[1, 2, 3].map((item) => (
                                <div key={item} className="comment-skeleton-item">
                                    <span className="comment-skeleton-avatar" />
                                    <div className="comment-skeleton-main">
                                        <span className="comment-skeleton-line comment-skeleton-line-sm" />
                                        <span className="comment-skeleton-line" />
                                        <span className="comment-skeleton-line comment-skeleton-line-md" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : threads.roots.length > 0 ? (
                        <ol className="comment-list" ref={listRef}>
                            {visibleRoots.map((comment) => (
                                <li key={comment.coid} className="comment-thread">
                                    <ol className="comment-list">
                                        <CommentItem comment={comment} onReply={handleReply} />
                                        {(threads.replies.get(comment.coid) ?? []).length > 0 ? (
                                            <li className="comment-children">
                                                <ol className="comment-list">
                                                    {(threads.replies.get(comment.coid) ?? []).map((reply) => (
                                                        <CommentItem
                                                            key={reply.coid}
                                                            comment={reply}
                                                            replyTo={threads.authors.get(reply.parent)}
                                                            isReply
                                                            onReply={handleReply}
                                                        />
                                                    ))}
                                                </ol>
                                            </li>
                                        ) : null}
                                    </ol>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <EmptyComments image={data.nullImage} text="暂时没有评论，欢迎在上方留言。" />
                    )}

                    {threads.roots.length > previewCount ? (
                        <div className="comments-more">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-expanded={expanded}
                                onClick={() => setExpanded((current) => !current)}
                            >
                                {expanded ? (
                                    <ChevronUp aria-hidden="true" />
                                ) : (
                                    <ChevronDown aria-hidden="true" />
                                )}
                                {expanded ? '收起评论' : `查看更多评论（${hiddenCount}）`}
                            </Button>
                        </div>
                    ) : null}
                </>
            )}
        </Card>
    );
}
