import { CalendarDays, Clock3, Eye, MessageCircle, UserRound } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import type { PostSummary } from '../../types';

interface Props {
    post: PostSummary;
    variant: 'grid' | 'list';
}

function Thumb({ post, kind }: { post: PostSummary; kind: 'grid' | 'list' }) {
    const fallback = (post.categories[0]?.label ?? post.title ?? '文').trim().slice(0, 1);
    const frame =
        kind === 'grid'
            ? 'aspect-[10/7] w-full'
            : 'aspect-[10/7] w-full sm:w-[190px]';

    return (
        <span className={'relative block shrink-0 overflow-hidden rounded-[8px] bg-surface-3 ' + frame}>
            {post.thumb ? (
                <img
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    src={post.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                />
            ) : (
                <span className="post-thumb-placeholder grid size-full place-items-center" aria-hidden="true">
                    <span className="text-[18px] font-medium text-brand/70">{fallback}</span>
                </span>
            )}
        </span>
    );
}

function Badges({ post, compact = false }: { post: PostSummary; compact?: boolean }) {
    const categories = post.categories.filter((category) => category.label !== '');
    const tags = post.tags.filter((tag) => tag.label !== '').slice(0, compact ? 2 : 3);

    return (
        <div className="mb-1.5 flex flex-wrap items-center gap-[5px]">
            {categories.slice(0, 2).map((category) => (
                <Badge
                    key={category.url + category.label}
                    asChild
                    variant="secondary"
                    className={
                        'rounded-[4px] border-0 bg-brand-soft px-[5px] py-[2px] font-normal leading-[1.44] text-brand hover:bg-brand hover:text-brand-contrast ' +
                        'text-[11px]'
                    }
                >
                    <a href={category.url}>{category.label}</a>
                </Badge>
            ))}
            {tags.map((tag) => (
                <Badge
                    key={tag.url + tag.label}
                    asChild
                    variant="secondary"
                    className={
                        'rounded-[4px] border-0 bg-surface-3 px-[5px] py-[2px] font-normal leading-[1.44] text-ink-mute hover:bg-brand-soft hover:text-brand ' +
                        'text-[11px]'
                    }
                >
                    <a href={tag.url}>#{tag.label}</a>
                </Badge>
            ))}
        </div>
    );
}

function Metrics({ post, compact = false }: { post: PostSummary; compact?: boolean }) {
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

export default function PostCard({ post, variant }: Props) {
    if (variant === 'grid') {
        return (
            <Card className="surface-card group flex flex-col gap-0 p-2.5 transition-shadow">
                <Thumb post={post} kind="grid" />

                <div className="flex flex-1 flex-col px-2.5 pt-2.5 pb-1">
                    <Badges post={post} compact />

                    <h2 className="line-clamp-1 text-[14px] font-medium leading-[1.4] text-ink">
                        <a className="transition-colors hover:text-brand" href={post.url}>
                            {post.title}
                        </a>
                    </h2>

                    {post.excerpt ? (
                        <p className="mt-1.5 line-clamp-1 text-[14px] leading-5 text-ink-mute">{post.excerpt}</p>
                    ) : null}

                    <Metrics post={post} compact />
                </div>
            </Card>
        );
    }

    const hasThumb = post.thumb !== '';

    return (
        <Card className="surface-card group flex flex-col gap-0 p-5 transition-shadow sm:flex-row">
            {hasThumb ? <Thumb post={post} kind="list" /> : null}

            <div className={'flex min-w-0 flex-1 flex-col ' + (hasThumb ? 'sm:ml-5' : '')}>
                <Badges post={post} />

                <h2 className="mb-[5px] line-clamp-1 text-[18px] font-medium leading-[1.4] text-ink">
                    <a className="transition-colors hover:text-brand" href={post.url}>
                        {post.title}
                    </a>
                </h2>

                {post.excerpt ? (
                    <p className="mb-1.5 line-clamp-1 text-[14px] leading-5 text-ink-mute">{post.excerpt}</p>
                ) : null}

                <Metrics post={post} />
            </div>
        </Card>
    );
}
