import type { FormEvent, ReactNode, RefObject } from 'react';
import { BadgeCheck, MessageCircle } from 'lucide-react';
import MarkdownToolbar from './MarkdownToolbar';
import UserAvatar from '../layout/UserAvatar';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';

function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

export interface CommentAuthor {
    name: string;
    avatar?: string;
    url?: string;
    groupLabel?: string;
    verified?: boolean;
    badge?: string;
}

interface CommentSectionProps {
    id?: string;
    title: string;
    count?: ReactNode;
    hint?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function CommentSection({
    id,
    title,
    count,
    hint,
    children,
    className,
}: CommentSectionProps) {
    return (
        <section id={id} className={cx('surface-card overflow-hidden', className)}>
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="text-[14px] font-semibold text-ink">
                    {title}
                    {count !== undefined && count !== null && count !== '' ? (
                        <span className="ml-1 text-[12px] font-normal text-ink-faint">
                            {count}
                        </span>
                    ) : null}
                </h2>
                {hint ? (
                    <span className="text-[10.5px] text-ink-faint">{hint}</span>
                ) : null}
            </header>
            {children}
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
    footerNote?: ReactNode;
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
    footerNote,
    id = 'comment-text',
    className,
}: CommentComposerProps) {
    const authorName = avatar?.name?.trim() || '访客';

    return (
        <form
            ref={formRef}
            id="comment-form"
            className={cx('forum-composer px-3 py-3 sm:px-4 sm:py-4', className)}
            onSubmit={onSubmit}
        >
            <div className="flex items-start gap-3">
                <UserAvatar
                    name={authorName}
                    avatar={avatar?.avatar}
                    fallbackImage={avatar?.fallbackImage}
                    className="size-9 sm:size-10"
                />
                <div className="min-w-0 flex-1">
                    {replyTo ? (
                        <div className="mb-2 flex items-center gap-2 rounded-[5px] bg-brand-soft px-2.5 py-1.5 text-[11px] text-brand">
                            <span className="truncate">正在回复 {replyTo.label}</span>
                            <button
                                type="button"
                                className="ml-auto shrink-0"
                                onClick={replyTo.onCancel}
                            >
                                取消
                            </button>
                        </div>
                    ) : null}
                    <div className="rounded-[10px] border border-line bg-surface-2/60 p-2.5">
                        <Textarea
                            ref={textareaRef}
                            id={id}
                            className="min-h-[84px] resize-y border-0 bg-transparent p-1 text-[13px] shadow-none focus-visible:ring-0"
                            value={value}
                            onChange={(event) => onChange(event.target.value)}
                            aria-label={label}
                            placeholder={placeholder}
                            required
                            disabled={disabled || busy}
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-line pt-2">
                            <MarkdownToolbar
                                target={textareaRef}
                                onChange={onChange}
                                onImage={onImage}
                                disabled={disabled || busy}
                            />
                            {quickReply}
                            <span className="ml-auto hidden text-[10px] text-ink-faint sm:inline">
                                {footerNote ?? '请勿发布违法或侵权内容'}
                            </span>
                            <Button
                                type="submit"
                                className="h-8 rounded-[5px] px-3 text-[11.5px]"
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
                    {guestFields ? <div className="mt-2.5">{guestFields}</div> : null}
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
    childCount?: number;
    depth?: number;
    onReply?: () => void;
    replyLabel?: string;
}

export function CommentEntry({
    commentId,
    author,
    contentHtml,
    createdText,
    createdIso,
    replyToLabel,
    children,
    childCount = 0,
    depth = 0,
    onReply,
    replyLabel = '回复',
}: CommentEntryProps) {
    const authorName = author.name.trim() || '匿名';
    const authorText = author.url ? (
        <a
            className="truncate text-[12.5px] font-semibold text-ink hover:text-brand"
            href={author.url}
            rel="nofollow ugc noreferrer"
        >
            {authorName}
        </a>
    ) : (
        <span className="truncate text-[12.5px] font-semibold text-ink">
            {authorName}
        </span>
    );

    return (
        <li
            id={commentId !== undefined ? `comment-${commentId}` : undefined}
            className={cx(
                'px-4 py-4',
                depth > 0
                    ? 'ml-2 border-t border-line sm:ml-5'
                    : 'border-t border-line first:border-t-0'
            )}
        >
            <div className="flex items-start gap-3">
                <UserAvatar
                    name={authorName}
                    avatar={author.avatar}
                    className={depth > 0 ? 'size-8' : 'size-9'}
                />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {authorText}
                        {author.verified ? (
                            <BadgeCheck
                                className="size-3.5 text-[#4da3ff]"
                                strokeWidth={2.1}
                                aria-label={author.groupLabel || '认证用户'}
                            />
                        ) : null}
                        {author.badge ? (
                            <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium text-brand">
                                {author.badge}
                            </span>
                        ) : null}
                        {author.groupLabel ? (
                            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] text-ink-faint">
                                {author.groupLabel}
                            </span>
                        ) : null}
                        <time
                            className="ml-auto text-[10.5px] text-ink-faint"
                            dateTime={createdIso}
                        >
                            {createdText}
                        </time>
                    </div>
                    {replyToLabel ? (
                        <p className="mt-1 text-[11px] text-ink-faint">
                            回复 <span className="text-brand">@{replyToLabel}</span>
                        </p>
                    ) : null}
                    <div
                        className="prose forum-prose forum-reply-prose mt-1.5 text-[13px]"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                    <div className="mt-1.5 flex items-center gap-3 text-[10.5px] text-ink-faint">
                        {onReply ? (
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 hover:text-brand"
                                onClick={onReply}
                            >
                                <MessageCircle className="size-3" strokeWidth={1.8} />
                                {replyLabel}
                            </button>
                        ) : null}
                        {childCount > 0 ? <span>{childCount} 条回复</span> : null}
                    </div>
                    {children ? <ul className="mt-1">{children}</ul> : null}
                </div>
            </div>
        </li>
    );
}

export function CommentEmpty({ image, text }: { image?: string; text: string }) {
    return (
        <div className="forum-empty-replies border-t border-line px-4 py-8">
            {image ? (
                <img src={image} alt="" loading="lazy" decoding="async" />
            ) : null}
            <p>{text}</p>
        </div>
    );
}
