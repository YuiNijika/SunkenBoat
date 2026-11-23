import { CalendarDays, Clock3, Eye, MessageCircle, UserRound } from 'lucide-react';
import type { PostSummary } from '../../types';

interface Props {
    post: PostSummary;
    variant?: 'simple' | 'card';
    compact?: boolean;
}

export default function PostMetrics({ post, variant = 'simple', compact = false }: Props) {
    if (variant === 'simple') {
        return (
            <div className="post-list-meta">
                {post.date ? (
                    <span>
                        <CalendarDays aria-hidden="true" />
                        <time dateTime={post.dateIso}>{post.date}</time>
                    </span>
                ) : null}
                <span>
                    <MessageCircle aria-hidden="true" />
                    {post.comments}
                </span>
                {post.views > 0 ? (
                    <span>
                        <Eye aria-hidden="true" />
                        {post.views}
                    </span>
                ) : null}
            </div>
        );
    }

    const size = compact ? 'text-[12px]' : 'text-[13px]';
    const icon = compact ? 'size-3' : 'size-3.5';

    return (
        <div className={'mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-ink-faint ' + size}>
            {post.date ? (
                <span className="inline-flex items-center gap-1">
                    <CalendarDays className={icon} strokeWidth={1.6} aria-hidden="true" />
                    <time dateTime={post.dateIso}>{post.date}</time>
                </span>
            ) : null}
            {post.author ? (
                <span className="inline-flex items-center gap-1">
                    <UserRound className={icon} strokeWidth={1.6} aria-hidden="true" />
                    <span className="max-w-24 truncate">{post.author}</span>
                </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
                <MessageCircle className={icon} strokeWidth={1.6} aria-hidden="true" />
                {post.comments}
            </span>
            {post.views > 0 ? (
                <span className="inline-flex items-center gap-1">
                    <Eye className={icon} strokeWidth={1.6} aria-hidden="true" />
                    {post.views}
                </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
                <Clock3 className={icon} strokeWidth={1.6} aria-hidden="true" />
                {post.readingTime} 分钟
            </span>
        </div>
    );
}
