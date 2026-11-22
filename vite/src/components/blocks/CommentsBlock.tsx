import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CommentsData } from '../../types';
import {
    CommentLoginGate,
    CommentComposer,
    CommentEmpty,
    CommentEntry,
    CommentSection,
} from '../content/CommentSection';
import { memeShortcode } from '../content/MemePicker';
import type { MemeItem } from '../content/MemePicker';
import MarkdownToolbar from '../content/MarkdownToolbar';
import MediaLibrary from '../content/MediaLibrary';
import AuthDialog from '../layout/AuthDialog';
import { Button } from '../ui/button';
import { notifyError, notifySuccess } from '../../lib/notify';
import { refreshApp } from '../../lib/appNavigation';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import CaptchaField from '../layout/CaptchaField';
import type { CaptchaValue } from '../layout/CaptchaField';

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

function insertMemeMarkdown(
    textarea: HTMLTextAreaElement | null,
    setText: (value: string) => void,
    item: MemeItem
) {
    const snippet = memeShortcode(item);
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

function isOwnerComment(comment: ApiComment): boolean {
    return comment.authorId > 0 && comment.authorId === comment.ownerId;
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
                <CommentEmpty image={data.nullImage} text="暂时没有评论，欢迎在上方留言。" />
            )}

            {data.paginationHtml ? (
                <nav
                    className="pagination mt-6"
                    aria-label="评论分页"
                    dangerouslySetInnerHTML={{ __html: data.paginationHtml }}
                />
            ) : null}

            {data.allow && data.requireLogin && !data.loggedIn ? (
                <CommentLoginGate
                    loginUrl={data.loginUrl}
                    registerUrl={data.registerUrl}
                    registerEnabled={data.registerEnabled}
                />
            ) : data.allow ? (
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
                                    meme={data.meme}
                                    onMemePick={(item) =>
                                        insertMemeMarkdown(
                                            textareaRef.current,
                                            setText,
                                            item
                                        )
                                    }
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
    const [submitting, setSubmitting] = useState(false);
    const [parent, setParent] = useState(0);
    const [parentTarget, setParentTarget] = useState('');
    const [text, setText] = useState('');
    const [mediaOpen, setMediaOpen] = useState(false);
    const [author, setAuthor] = useState(data.remember.author);
    const [mail, setMail] = useState(data.remember.mail);
    const [url, setUrl] = useState(data.remember.url);
    const [captcha, setCaptcha] = useState<CaptchaValue | null>(null);
    const [expanded, setExpanded] = useState(!data.collapsed);
    const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const loadComments = async () => {
        if (!data.apiEnabled) {
            return;
        }

        setLoading(true);
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
            notifyError(
                error instanceof Error ? error.message : '评论接口请求失败'
            );
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
        if (data.requireLogin && !data.loggedIn) {
            if (data.auth) {
                setAuthMode('login');
            } else if (data.loginUrl !== '') {
                window.location.href = data.loginUrl;
            }
            return;
        }

        setParent(comment.coid);
        setParentTarget(comment.author || '匿名');
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textareaRef.current?.focus();
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!data.apiEnabled) {
            return;
        }

        setSubmitting(true);
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
                    ...(captcha ? { captcha } : {}),
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload || (payload.code !== 200 && payload.code !== 201)) {
                throw new Error(payload?.message || '评论提交失败');
            }

            setText('');
            setParent(0);
            setParentTarget('');
            setCaptcha(null);
            const status = String(payload.data?.status ?? '');
            notifySuccess(
                status === 'waiting'
                    ? '评论已提交，审核通过后会显示。'
                    : '评论已发布。'
            );
            await loadComments();
        } catch (error) {
            notifyError(error instanceof Error ? error.message : '评论提交失败');
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
        <CommentSection
            id="comments"
            title={title}
            count={data.countText}
            hint="友善交流，支持 Markdown"
        >
            {!data.apiEnabled ? (
                <LegacyComments data={data} />
            ) : (
                <>
                    {data.requireLogin && !data.loggedIn ? (
                        <CommentLoginGate
                            loginUrl={data.loginUrl}
                            registerUrl={data.registerUrl}
                            registerEnabled={
                                data.auth?.registerEnabled
                                ?? data.registerEnabled
                            }
                            onLogin={
                                data.auth
                                    ? () => setAuthMode('login')
                                    : undefined
                            }
                            onRegister={
                                data.auth
                                    ? () => setAuthMode('register')
                                    : undefined
                            }
                        />
                    ) : (
                    <CommentComposer
                        formRef={formRef}
                        textareaRef={textareaRef}
                        id="api-comment-text"
                        avatar={{
                            name: data.loggedIn ? data.screenName : author || '访客',
                            avatar: data.viewerAvatar,
                        }}
                        value={text}
                        onChange={setText}
                        onSubmit={submit}
                        busy={submitting}
                        meme={data.meme}
                        placeholder="写下你的想法…支持 Markdown 语法"
                        replyTo={
                            parent > 0
                                ? {
                                      label: parentTarget || `#${parent}`,
                                      onCancel: () => {
                                          setParent(0);
                                          setParentTarget('');
                                      },
                                  }
                                : null
                        }
                        onImage={
                            data.mediaEnabled ? () => setMediaOpen(true) : undefined
                        }
                        footerNote={
                            data.loggedIn ? (
                                <span>
                                    当前身份：
                                    <a
                                        className="text-ink-mute hover:text-brand"
                                        href={data.profileUrl}
                                    >
                                        {data.screenName}
                                    </a>
                                </span>
                            ) : null
                        }
                        guestFields={
                            data.loggedIn ? null : (
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <div className="grid gap-1.5">
                                        <Label
                                            htmlFor="api-comment-author"
                                            className="text-[11px] text-ink-mute"
                                        >
                                            名字
                                        </Label>
                                        <Input
                                            id="api-comment-author"
                                            className="h-8 text-[12px]"
                                            value={author}
                                            onChange={(event) =>
                                                setAuthor(event.target.value)
                                            }
                                            autoComplete="nickname"
                                            required
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label
                                            htmlFor="api-comment-mail"
                                            className="text-[11px] text-ink-mute"
                                        >
                                            邮箱
                                        </Label>
                                        <Input
                                            id="api-comment-mail"
                                            className="h-8 text-[12px]"
                                            type="email"
                                            value={mail}
                                            onChange={(event) =>
                                                setMail(event.target.value)
                                            }
                                            autoComplete="email"
                                            required={data.requireMail}
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label
                                            htmlFor="api-comment-url"
                                            className="text-[11px] text-ink-mute"
                                        >
                                            网站
                                        </Label>
                                        <Input
                                            id="api-comment-url"
                                            className="h-8 text-[12px]"
                                            type="url"
                                            value={url}
                                            onChange={(event) =>
                                                setUrl(event.target.value)
                                            }
                                            autoComplete="url"
                                            placeholder={
                                                data.requireUrl ? '' : '选填'
                                            }
                                            required={data.requireUrl}
                                        />
                                    </div>
                                </div>
                            )
                        }
                        verification={
                            <CaptchaField
                                config={data.captcha}
                                scene="comment"
                                onChange={setCaptcha}
                            />
                        }
                    />
                    )}
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
                    {data.auth ? (
                        <AuthDialog
                            open={authMode !== null}
                            onOpenChange={(nextOpen) => {
                                if (!nextOpen) {
                                    setAuthMode(null);
                                }
                            }}
                            api={data.auth}
                            checking={false}
                            initialMode={authMode ?? 'login'}
                            onAuthenticated={() => {
                                setAuthMode(null);
                                window.dispatchEvent(
                                    new Event('ttdf:auth-changed')
                                );
                                refreshApp();
                            }}
                        />
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
                        <ul className="border-t border-line" ref={listRef}>
                            {visibleRoots.map((comment) => {
                                const replies =
                                    threads.replies.get(comment.coid) ?? [];

                                return (
                                    <CommentEntry
                                        key={comment.coid}
                                        commentId={comment.coid}
                                        author={{
                                            name: comment.author || '匿名',
                                            avatar: comment.avatar,
                                            url: comment.url,
                                            badge: isOwnerComment(comment)
                                                ? '博主'
                                                : undefined,
                                        }}
                                        createdText={formatCommentTime(
                                            comment.created
                                        )}
                                        createdIso={comment.created}
                                        contentHtml={
                                            comment.html || comment.text
                                        }
                                        childCount={replies.length}
                                        onReply={() => handleReply(comment)}
                                    >
                                        {replies.map((reply) => (
                                            <CommentEntry
                                                key={reply.coid}
                                                commentId={reply.coid}
                                                depth={1}
                                                author={{
                                                    name:
                                                        reply.author || '匿名',
                                                    avatar: reply.avatar,
                                                    url: reply.url,
                                                    badge: isOwnerComment(reply)
                                                        ? '博主'
                                                        : undefined,
                                                }}
                                                createdText={formatCommentTime(
                                                    reply.created
                                                )}
                                                createdIso={reply.created}
                                                replyToLabel={threads.authors.get(
                                                    reply.parent
                                                )}
                                                onReply={() =>
                                                    handleReply(reply)
                                                }
                                                contentHtml={
                                                    reply.html || reply.text
                                                }
                                            />
                                        ))}
                                    </CommentEntry>
                                );
                            })}
                        </ul>
                    ) : (
                        <CommentEmpty
                            image={data.nullImage}
                            text="暂时没有评论，欢迎在上方留言。"
                        />
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
        </CommentSection>
    );
}
