import Pagination from '../content/Pagination';
import PostCard from '../content/PostCard';
import SectionHeading from '../content/SectionHeading';
import type { PostSummary } from '../../types';

interface Props {
    variant?: string;
    title: string;
    posts: PostSummary[];
    paginationHtml: string;
    empty: string;
}

export default function PostListBlock({ variant, title, posts, paginationHtml, empty }: Props) {
    const grid = variant === 'grid';

    return (
        <section id="latest" className="grid gap-[15px]">
            <SectionHeading title={title} count={posts.length} />

            {posts.length > 0 ? (
                <div className={grid ? 'grid gap-[15px] sm:grid-cols-2' : 'grid gap-[15px]'}>
                    {posts.map((post) => (
                        <PostCard key={post.url} post={post} variant={grid ? 'grid' : 'list'} />
                    ))}
                </div>
            ) : (
                <p className="surface-card card-pad text-sm text-ink-mute">{empty}</p>
            )}

            <Pagination html={paginationHtml} label="文章分页" />
        </section>
    );
}
