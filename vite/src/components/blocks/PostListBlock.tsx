import Pagination from '../content/Pagination';
import PostCard from '../content/PostCard';
import PostMetrics from '../content/PostMetrics';
import PostThumb from '../content/PostThumb';
import SectionHeading from '../content/SectionHeading';
import type { CSSProperties } from 'react';
import type { PostSummary } from '../../types';

interface Props {
    variant?: string;
    title: string;
    anchor?: string;
    source?: 'articles' | 'forum' | 'mixed';
    posts: PostSummary[];
    paginationHtml: string;
    empty: string;
    limit?: number;
    columns?: number;
    showPagination?: boolean;
}

function LargeCard({ post }: { post: PostSummary }) {
    return (
        <article className="post-list-large group">
            <a className="post-list-large-media" href={post.url}>
                <PostThumb post={post} />
                <span className="post-list-large-tag">{post.categories[0]?.label ?? '文章'}</span>
            </a>
            <div className="post-list-large-body">
                <h3>
                    <a href={post.url}>{post.title}</a>
                </h3>
                {post.excerpt ? <p>{post.excerpt}</p> : null}
                <PostMetrics post={post} />
            </div>
        </article>
    );
}

function CompactRow({ post }: { post: PostSummary }) {
    return (
        <article className="post-list-row group">
            <a href={post.url} className="post-list-row-media">
                <PostThumb post={post} />
            </a>
            <div className="post-list-row-body">
                <h3>
                    <a href={post.url}>{post.title}</a>
                </h3>
                {post.excerpt ? <p>{post.excerpt}</p> : null}
                <PostMetrics post={post} />
            </div>
        </article>
    );
}

function HeadlineList({ posts }: { posts: PostSummary[] }) {
    return (
        <ul className="post-headline-list">
            {posts.map((post) => (
                <li key={post.url}>
                    <a href={post.url}>{post.title}</a>
                    {post.date ? <time dateTime={post.dateIso}>{post.date}</time> : null}
                </li>
            ))}
        </ul>
    );
}

function chunk<T>(items: T[], size: number): T[][] {
    const groups: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        groups.push(items.slice(index, index + size));
    }

    return groups;
}

export default function PostListBlock({
    variant,
    title,
    anchor,
    source = 'articles',
    posts,
    paginationHtml,
    empty,
    limit = 0,
    columns = 0,
    showPagination = true,
}: Props) {
    const items = limit > 0 ? posts.slice(0, limit) : posts;
    const mode = variant || 'list';

    const body = (() => {
        if (items.length === 0) {
            return <p className="surface-card card-pad text-sm text-ink-mute">{empty}</p>;
        }

        if (mode === 'feature') {
            const [lead, ...rest] = items;
            return (
                <div className="post-feature-layout">
                    {lead ? <LargeCard post={lead} /> : null}
                    <div className="post-feature-side">
                        {rest.slice(0, 4).map((post) => (
                            <CompactRow key={post.url} post={post} />
                        ))}
                    </div>
                </div>
            );
        }

        if (mode === 'showcase') {
            const top = items.slice(0, 3);
            const rest = items.slice(3, 9);
            return (
                <div className="post-showcase-layout">
                    <div className="post-showcase-top">
                        {top.map((post) => (
                            <LargeCard key={post.url} post={post} />
                        ))}
                    </div>
                    {rest.length > 0 ? (
                        <div className="post-showcase-rest">
                            {rest.map((post) => (
                                <CompactRow key={post.url} post={post} />
                            ))}
                        </div>
                    ) : null}
                </div>
            );
        }

        if (mode === 'split') {
            const rows = items.slice(0, 4);
            const lead = items[4] ?? items[0];
            return (
                <div className="post-split-layout">
                    <div className="post-split-list">
                        {rows.map((post) => (
                            <CompactRow key={post.url} post={post} />
                        ))}
                    </div>
                    {lead ? <LargeCard post={lead} /> : null}
                </div>
            );
        }

        if (mode === 'headline') {
            const groups = chunk(items.slice(0, 12), Math.max(1, Math.ceil(items.length / 3)));
            return (
                <div className="post-headline-layout">
                    {groups.slice(0, 3).map((group, index) => (
                        <HeadlineList key={index} posts={group} />
                    ))}
                </div>
            );
        }

        if (mode === 'compact') {
            return (
                <div className="post-compact-layout">
                    {items.map((post) => (
                        <CompactRow key={post.url} post={post} />
                    ))}
                </div>
            );
        }

        if (mode === 'mixed') {
            return (
                <div className="post-mixed-layout">
                    {chunk(items.slice(0, 15), 5).map((group, index) => {
                        const [lead, ...rest] = group;

                        return (
                            <div
                                key={lead?.url ?? index}
                                className={'post-mixed-band' + (index % 2 === 1 ? ' is-reversed' : '')}
                            >
                                {lead ? <LargeCard post={lead} /> : null}
                                <div className="post-mixed-side">
                                    {rest.map((post) => (
                                        <CompactRow key={post.url} post={post} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (mode === 'masonry') {
            return (
                <div
                    className="post-masonry-layout"
                    style={
                        columns >= 2 && columns <= 4
                            ? ({ '--masonry-cols': columns } as CSSProperties)
                            : undefined
                    }
                >
                    {items.map((post) => (
                        <PostCard key={post.url} post={post} variant="grid" />
                    ))}
                </div>
            );
        }

        const grid = mode === 'grid';
        const columnClass =
            columns >= 2 && columns <= 5 ? ` post-grid-cols-${columns}` : ' sm:grid-cols-2';

        return (
            <div className={grid ? 'grid gap-[15px]' + columnClass : 'grid gap-[15px]'}>
                {items.map((post) => (
                    <PostCard key={post.url} post={post} variant={grid ? 'grid' : 'list'} />
                ))}
            </div>
        );
    })();

    return (
        <section
            id={anchor || (source === 'forum' ? undefined : 'latest')}
            className="grid gap-[15px]"
        >
            <SectionHeading title={title} count={items.length} />
            {body}
            {showPagination ? <Pagination html={paginationHtml} label="文章分页" /> : null}
        </section>
    );
}
