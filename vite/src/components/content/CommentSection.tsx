import { Children } from 'react';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { BadgeCheck, MessageCircle, MessageSquareText } from 'lucide-react';
import MarkdownToolbar from './MarkdownToolbar';
import { memeShortcode } from './MemePicker';
import type { MemeItem } from './MemePicker';
import UserAvatar from '../layout/UserAvatar';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import type { MemeConfig } from '../../types';

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

function safeAuthorUrl(value?: string): string {
    const url = (value ?? '').trim();
    if (
        url === ''
        || url.startsWith('//')
        || /[\u0000-\u0020\u007f\\]/.test(url)
    ) {
        return '';
    }

    return /^(?:https?:\/\/|\/(?!\/))/i.test(url) ? url : '';
}

function insertMemeMarkdown(
    textarea: HTMLTextAreaElement | null,
    onChange: (value: string) => void,
    item: MemeItem
): void {
    const snippet = memeShortcode(item);
    if (!textarea) {
        onChange(snippet);
        return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    onChange(
        textarea.value.slice(0, start) + snippet + textarea.value.slice(end)
    );
    window.requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + snippet.length;
        textarea.setSelectionRange(cursor, cursor);
    });
}

export interface CommentAuthor {
    name: string;
    avatar?: string;
    url?: string;
    groupLabel?: string;
    verified?: boolean;
    badge?: string;
}

export type CommentSortOrder = 'latest' | 'oldest';

interface CommentSectionProps {
    id?: string;
    title: string;
    count?: ReactNode;
    hint?: ReactNode;
    sortOrder?: CommentSortOrder;
    onSortChange?: (order: CommentSortOrder) => void;
    children: ReactNode;
    className?: string;
}

export function CommentSection({
    id,
    title,
    count,
    hint,
    sortOrder,
    onSortChange,
    children,
    className,
}: CommentSectionProps) {
    return (
        <section id={id} className={cx('comment-panel', className)}>
            <header className="comment-panel-head">
                <div className="comment-panel-heading">
                    <span className="comment-panel-icon" aria-hidden="true">
                        <MessageSquareText strokeWidth={1.8} />
                    </span>
                    <h2 className="comment-panel-title">{title}</h2>
                    {count !== undefined && count !== null && count !== '' ? (
                        <span className="comment-panel-count">{count}</span>
                    ) : null}
                </div>
                <div className="comment-panel-tools">
                    {hint ? <span className="comment-panel-hint">{hint}</span> : null}
                    {sortOrder && onSortChange ? (
                        <div
                            className="comment-sort"
                            role="group"
                            aria-label="评论排序"
                        >
                            <button
                                type="button"
                                className={
                                    sortOrder === 'latest'
                                        ? 'comment-sort-button is-active'
                                        : 'comment-sort-button'
                                }
                                aria-pressed={sortOrder === 'latest'}
                                onClick={() => onSortChange('latest')}
                            >
                                最新
                            </button>
                            <button
                                type="button"
                                className={
                                    sortOrder === 'oldest'
                                        ? 'comment-sort-button is-active'
                                        : 'comment-sort-button'
                                }
                                aria-pressed={sortOrder === 'oldest'}
                                onClick={() => onSortChange('oldest')}
                            >
                                最早
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>
            <div className="comment-panel-body">{children}</div>
        </section>
    );
}

interface CommentComposerProps {
    formRef?: RefObject<HTMLFormElement | null>;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    value: string;
    onChange: (value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    avatar?: {
        name: string;
        avatar?: string;
        fallbackImage?: string;
    };
    label?: string;
    placeholder?: string;
    submitLabel?: string;
    busyLabel?: string;
    busy?: boolean;
    disabled?: boolean;
    submitDisabled?: boolean;
    replyTo?: {
        label: string;
        onCancel: () => void;
    } | null;
    onImage?: () => void;
    quickReply?: ReactNode;
    guestFields?: ReactNode;
    verification?: ReactNode;
    footerNote?: ReactNode;
    meme?: MemeConfig | null;
    id?: string;
    className?: string;
}

export function CommentComposer({
    formRef,
    textareaRef,
    value,
    onChange,
    onSubmit,
    avatar,
    label = '评论内容',
    placeholder = '友善交流，支持 Markdown',
    submitLabel = '提交评论',
    busyLabel = '发送中…',
    busy = false,
    disabled = false,
    submitDisabled = false,
    replyTo,
    onImage,
    quickReply,
    guestFields,
    verification,
    footerNote,
    meme,
    id = 'comment-text',
    className,
}: CommentComposerProps) {
    const authorName = avatar?.name?.trim() || '访客';

    return (
        <form
            ref={formRef}
            id="comment-form"
            className={cx('comment-composer', className)}
            onSubmit={onSubmit}
        >
            <div className="comment-composer-layout">
                <UserAvatar
                    name={authorName}
                    avatar={avatar?.avatar}
                    fallbackImage={avatar?.fallbackImage}
                    className="comment-composer-avatar"
                />
                <div className="comment-composer-main">
                    {replyTo ? (
                        <div className="comment-composer-reply">
                            <span>
                                正在回复 <strong>@{replyTo.label}</strong>
                            </span>
                            <button type="button" onClick={replyTo.onCancel}>
                                取消
                            </button>
                        </div>
                    ) : null}

                    <div className="comment-composer-box">
                        <Textarea
                            ref={textareaRef}
                            id={id}
                            className="comment-composer-input"
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            aria-label={label}
                            placeholder={placeholder}
                            required
                            disabled={disabled || busy}
                        />
                        <div className="comment-composer-tools">
                            <MarkdownToolbar
                                target={textareaRef}
                                onChange={onChange}
                                onImage={onImage}
                                meme={meme}
                                onMemePick={(item) =>
                                    insertMemeMarkdown(
                                        textareaRef.current,
                                        onChange,
                                        item
                                    )
                                }
                                disabled={disabled || busy}
                            />
                            {quickReply}
                        </div>
                    </div>

                    {guestFields ? (
                        <div className="comment-composer-extra">{guestFields}</div>
                    ) : null}
                    {verification ? (
                        <div className="comment-composer-extra">{verification}</div>
                    ) : null}

                    <div className="comment-composer-footer">
                        <span className="comment-composer-note">
                            {footerNote ?? '请勿发布违法或侵权内容'}
                        </span>
                        <Button
                            type="submit"
                            className="comment-composer-submit"
                            disabled={
                                disabled
                                || busy
                                || submitDisabled
                                || value.trim() === ''
                            }
                        >
                            {busy ? busyLabel : submitLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </form>
    );
}

interface CommentEntryProps {
    commentId?: string | number;
    author: CommentAuthor;
    contentHtml: string;
    createdText: string;
    createdIso?: string;
    replyToLabel?: string;
    children?: ReactNode;
    depth?: number;
    onReply?: () => void;
    replyLabel?: string;
}

function AuthorName({ author }: { author: CommentAuthor }) {
    const name = author.name.trim() || '匿名';
    const url = safeAuthorUrl(author.url);

    return url ? (
        <a
            className="comment-author"
            href={url}
            target="_blank"
            rel="nofollow ugc noreferrer"
        >
            {name}
        </a>
    ) : (
        <span className="comment-author">{name}</span>
    );
}

function AuthorBadges({ author }: { author: CommentAuthor }) {
    return (
        <>
            {author.verified ? (
                <BadgeCheck
                    className="comment-verified"
                    strokeWidth={2.05}
                    aria-label={author.groupLabel || '认证用户'}
                />
            ) : null}
            {author.badge ? (
                <span className="comment-badge comment-badge-owner">
                    {author.badge}
                </span>
            ) : null}
            {author.groupLabel ? (
                <span className="comment-badge">{author.groupLabel}</span>
            ) : null}
        </>
    );
}

export function CommentEntry({
    commentId,
    author,
    contentHtml,
    createdText,
    createdIso,
    replyToLabel,
    children,
    depth = 0,
    onReply,
    replyLabel = '回复',
}: CommentEntryProps) {
    const hasChildren = Children.count(children) > 0;

    if (depth > 0) {
        return (
            <li
                id={commentId !== undefined ? `comment-${commentId}` : undefined}
                className="comment-reply-item"
            >
                <div className="comment-reply-body">
                    <div className="comment-reply-copy">
                        <span className="comment-reply-head">
                            <AuthorName author={author} />
                            <AuthorBadges author={author} />
                            {replyToLabel ? (
                                <span className="comment-reply-at">
                                    回复 @{replyToLabel}
                                </span>
                            ) : null}
                            <span className="comment-reply-colon">：</span>
                            <time
                                className="comment-reply-time"
                                dateTime={createdIso}
                            >
                                {createdText}
                            </time>
                        </span>
                        <div
                            className="comment-reply-content"
                            dangerouslySetInnerHTML={{ __html: contentHtml }}
                        />
                    </div>
                    {onReply ? (
                        <button
                            type="button"
                            className="comment-reply-action"
                            onClick={onReply}
                            title={replyLabel}
                            aria-label={replyLabel}
                        >
                            <MessageCircle strokeWidth={1.8} />
                        </button>
                    ) : null}
                </div>
                {hasChildren ? children : null}
            </li>
        );
    }

    return (
        <li
            id={commentId !== undefined ? `comment-${commentId}` : undefined}
            className="comment-item"
        >
            <div className="comment-item-shell">
                <UserAvatar
                    name={author.name.trim() || '匿名'}
                    avatar={author.avatar}
                    className="comment-avatar-react"
                />
                <div className="comment-item-main">
                    <div className="comment-item-head">
                        <div className="comment-item-author-row">
                            <AuthorName author={author} />
                            <AuthorBadges author={author} />
                        </div>
                        <time
                            className="comment-item-time"
                            dateTime={createdIso}
                        >
                            {createdText}
                        </time>
                    </div>

                    <div
                        className="comment-content"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />

                    {onReply ? (
                        <div className="comment-actions">
                            <button
                                type="button"
                                className="comment-action"
                                onClick={onReply}
                            >
                                <MessageCircle strokeWidth={1.8} />
                                <span>{replyLabel}</span>
                            </button>
                        </div>
                    ) : null}

                    {hasChildren ? (
                        <ul className="comment-replies">{children}</ul>
                    ) : null}
                </div>
            </div>
        </li>
    );
}

export function CommentEmpty({ image, text }: { image?: string; text: string }) {
    return (
        <div className="comment-empty">
            {image ? (
                <img src={image} alt="" loading="lazy" decoding="async" />
            ) : null}
            <p>{text}</p>
        </div>
    );
}

interface CommentLoginGateProps {
    onLogin?: () => void;
    onRegister?: () => void;
    loginUrl?: string;
    registerUrl?: string;
    registerEnabled?: boolean;
}

export function CommentLoginGate({
    onLogin,
    onRegister,
    loginUrl = '',
    registerUrl = '',
    registerEnabled = false,
}: CommentLoginGateProps) {
    return (
        <div className="comment-login-gate">
            <div className="comment-login-gate-panel">
                <span className="comment-login-gate-icon" aria-hidden="true">
                    <MessageSquareText strokeWidth={1.7} />
                </span>
                <p className="comment-login-gate-title">登录后参与讨论</p>
                <p className="comment-login-gate-text">
                    登录后可以回复、补充内容并接收后续动态。
                </p>
                <div className="comment-login-gate-actions">
                    {onLogin ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="comment-login-button"
                            onClick={onLogin}
                        >
                            登录
                        </Button>
                    ) : loginUrl !== '' ? (
                        <Button
                            asChild
                            variant="outline"
                            className="comment-login-button"
                        >
                            <a href={loginUrl}>登录</a>
                        </Button>
                    ) : null}

                    {registerEnabled && onRegister ? (
                        <Button
                            type="button"
                            className="comment-login-button comment-login-button-primary"
                            onClick={onRegister}
                        >
                            快速注册
                        </Button>
                    ) : registerEnabled && registerUrl !== '' ? (
                        <Button
                            asChild
                            className="comment-login-button comment-login-button-primary"
                        >
                            <a href={registerUrl}>快速注册</a>
                        </Button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
