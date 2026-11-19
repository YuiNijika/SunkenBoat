import { CalendarDays, Eye, Heart, MessageCircle, UserRound } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { PostCategory } from '../../types';

interface Props {
    date: string;
    dateIso: string;
    author: string;
    commentsText: string;
    views?: number;
    viewsText?: string;
    likes?: number;
    likesText?: string;
    categories: PostCategory[];
}

export default function PostMeta({
    date,
    dateIso,
    author,
    commentsText,
    views = 0,
    viewsText = '',
    likes = 0,
    likesText = '',
    categories,
}: Props) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-faint">
            {date ? (
                <time className="inline-flex items-center gap-1.5" dateTime={dateIso}>
                    <CalendarDays className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {date}
                </time>
            ) : null}

            {author ? (
                <span className="inline-flex items-center gap-1.5">
                    <UserRound className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {author}
                </span>
            ) : null}

            {commentsText ? (
                <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {commentsText}
                </span>
            ) : null}

            {views > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                    <Eye className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {viewsText || views} 次阅读
                </span>
            ) : null}

            {likes > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                    <Heart className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    {likesText || likes} 点赞
                </span>
            ) : null}

            {categories.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1.5">
                    {categories.map((category) => (
                        <Badge
                            key={category.url + category.label}
                            asChild
                            variant="secondary"
                            className="rounded-[4px] border-0 bg-brand-soft px-[5px] py-[2px] text-[11px] font-normal leading-[1.44] text-brand hover:bg-brand hover:text-brand-contrast"
                        >
                            <a href={category.url}>{category.label}</a>
                        </Badge>
                    ))}
                </span>
            ) : null}
        </div>
    );
}
