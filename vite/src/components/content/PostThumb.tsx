import type { PostSummary } from '../../types';

type Layout = 'plain' | 'grid' | 'list';

interface Props {
    post: PostSummary;
    layout?: Layout;
}

export default function PostThumb({ post, layout = 'plain' }: Props) {
    const fallback = (post.categories[0]?.label ?? post.title ?? '文').trim().slice(0, 1);

    if (layout === 'plain') {
        return (
            <span className="post-list-thumb">
                {post.thumb ? (
                    <img src={post.thumb} alt="" loading="lazy" decoding="async" />
                ) : (
                    <span className="post-list-thumb-fallback" aria-hidden="true">
                        {fallback}
                    </span>
                )}
            </span>
        );
    }

    const frame =
        layout === 'grid'
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
