import { Search } from 'lucide-react';
import PostMeta from '../content/PostMeta';
import { ShareButton } from '../content/ShareSheet';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { openSearch } from '../../lib/search';
import type { PostCategory, SearchScope, ShareConfig } from '../../types';

interface ArchiveHeaderProps {
    title: string;
    description: string;
    count: number;
    searchLabel: string;
    searchScope: SearchScope | null;
}

export function ArchiveHeaderBlock({
    title,
    description,
    count,
    searchLabel,
    searchScope,
}: ArchiveHeaderProps) {
    return (
        <Card className="surface-card gap-0 p-5">
            <div className="flex flex-wrap items-end justify-between gap-5">
                <div className="min-w-0">
                    <p className="section-label">内容归档</p>
                    <h1 className="mt-2 truncate text-[22px] font-medium leading-[1.4] text-ink">
                        {title}
                    </h1>
                    {description ? (
                        <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-ink-mute">{description}</p>
                    ) : null}
                </div>

                <div className="flex items-center gap-2">
                    {searchScope !== null && searchScope.slug !== '' ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-[4px]"
                            onClick={() => openSearch(searchScope)}
                        >
                            <Search className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                            {searchLabel || '搜索当前分类'}
                        </Button>
                    ) : null}
                    {count > 0 ? (
                        <div className="rounded-[4px] bg-[rgba(136,136,136,0.1)] px-[9px] py-[4.5px] text-right">
                            <p className="text-[15px] font-medium leading-[1.44] text-ink">{count}</p>
                            <p className="text-[11px] leading-[1.44] text-ink-faint">篇文章</p>
                        </div>
                    ) : null}
                </div>
            </div>
        </Card>
    );
}

interface PostHeaderProps {
    title: string;
    share?: ShareConfig;
    meta: {
        date: string;
        dateIso: string;
        author: string;
        commentsText: string;
        views: number;
        viewsText: string;
        likes: number;
        likesText: string;
        categories: PostCategory[];
    } | null;
    embedded?: boolean;
}

export function PostHeaderBlock({ title, meta, share, embedded = false }: PostHeaderProps) {
    const metaRow = meta ? (
        <div
            className={
                embedded
                    ? 'mt-3 flex flex-wrap items-center justify-between gap-2'
                    : 'mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3'
            }
        >
            <div className="min-w-0">
                <PostMeta
                    date={meta.date}
                    dateIso={meta.dateIso}
                    author={meta.author}
                    commentsText={meta.commentsText}
                    views={meta.views}
                    viewsText={meta.viewsText}
                    likes={meta.likes}
                    likesText={meta.likesText}
                    categories={meta.categories}
                />
            </div>
            <ShareButton config={share} title={title} />
        </div>
    ) : null;

    if (embedded) {
        return (
            <header className="mb-4 border-b border-line pb-4 sm:mb-5">
                <p className="text-[12px] font-normal text-brand">文章</p>
                <h1 className="mt-2 text-[24px] font-medium leading-[1.4] text-ink sm:text-[28px]">
                    {title}
                </h1>
                {metaRow}
            </header>
        );
    }

    return (
        <Card className="surface-card gap-0 p-5">
            <Badge
                variant="secondary"
                className="w-fit rounded-[4px] border-0 bg-brand-soft px-[7px] py-[3px] text-[11px] font-medium leading-[1.5] text-brand"
            >
                文章
            </Badge>
            <h1 className="mt-3 text-[24px] font-medium leading-[1.4] text-ink sm:text-[28px]">
                {title}
            </h1>
            {metaRow}
        </Card>
    );
}

interface PageHeaderProps {
    variant?: string;
    eyebrow: string;
    title: string;
}

export function PageHeaderBlock({ variant, eyebrow, title }: PageHeaderProps) {
    const compact = variant === 'compact';

    return (
        <Card className="surface-card gap-0 p-5">
            <p className="section-label">
                {eyebrow || '独立页面'}
            </p>
            <h1
                className={
                    'font-medium leading-[1.4] text-ink ' +
                    (compact ? 'mt-1.5 text-[20px]' : 'mt-2 text-[22px] sm:text-[24px]')
                }
            >
                {title}
            </h1>
        </Card>
    );
}
