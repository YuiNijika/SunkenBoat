import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import PostMetrics from './PostMetrics';
import PostThumb from './PostThumb';
import type { PostSummary } from '../../types';

interface Props {
    post: PostSummary;
    variant: 'grid' | 'list';
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

export default function PostCard({ post, variant }: Props) {
    if (variant === 'grid') {
        return (
            <Card className="surface-card group flex flex-col gap-0 p-2.5 transition-shadow">
                <PostThumb post={post} layout="grid" />

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

                    <PostMetrics post={post} variant="card" compact />
                </div>
            </Card>
        );
    }

    const hasThumb = post.thumb !== '';

    return (
        <Card className="surface-card group flex flex-col gap-0 p-5 transition-shadow sm:flex-row">
            {hasThumb ? <PostThumb post={post} layout="list" /> : null}

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

                <PostMetrics post={post} variant="card" />
            </div>
        </Card>
    );
}
