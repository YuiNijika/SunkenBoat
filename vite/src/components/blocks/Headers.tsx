import PostMeta from '../content/PostMeta';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import type { PostCategory } from '../../types';

interface ArchiveHeaderProps {
    title: string;
    description: string;
    count: number;
}

export function ArchiveHeaderBlock({ title, description, count }: ArchiveHeaderProps) {
    return (
        <Card className="surface-card gap-0 p-5">
            <div className="flex flex-wrap items-end justify-between gap-5">
                <div className="min-w-0">
                    <p className="text-[12px] font-normal text-ink-faint">内容归档</p>
                    <h1 className="mt-1.5 truncate text-[22px] font-medium leading-[1.4] text-ink">
                        {title}
                    </h1>
                    {description ? (
                        <p className="mt-2 max-w-2xl text-[14px] leading-[1.7] text-ink-mute">{description}</p>
                    ) : null}
                </div>

                {count > 0 ? (
                    <div className="rounded-[4px] bg-[rgba(136,136,136,0.1)] px-[9px] py-[4.5px] text-right">
                        <p className="text-[15px] font-medium leading-[1.44] text-ink">{count}</p>
                        <p className="text-[11px] leading-[1.44] text-ink-faint">篇文章</p>
                    </div>
                ) : null}
            </div>
        </Card>
    );
}

interface PostHeaderProps {
    title: string;
    meta: {
        date: string;
        dateIso: string;
        author: string;
        commentsText: string;
        views: number;
        viewsText: string;
        categories: PostCategory[];
    };
}

export function PostHeaderBlock({ title, meta }: PostHeaderProps) {
    return (
        <Card className="surface-card gap-0 p-5">
            <Badge
                variant="secondary"
                className="rounded-[4px] border-0 bg-brand-soft px-[5px] py-[2px] text-[11px] font-normal leading-[1.44] text-brand"
            >
                文章
            </Badge>
            <h1 className="mt-3 text-[24px] font-medium leading-[1.4] text-ink sm:text-[28px]">
                {title}
            </h1>
            <div className="mt-3 border-t border-line pt-3">
                <PostMeta
                    date={meta.date}
                    dateIso={meta.dateIso}
                    author={meta.author}
                    commentsText={meta.commentsText}
                    views={meta.views}
                    viewsText={meta.viewsText}
                    categories={meta.categories}
                />
            </div>
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
        <Card
            className={
                'surface-card gap-0 ' +
                (compact ? 'p-5' : 'p-5 sm:p-6')
            }
        >
            <p className="text-[12px] font-normal text-brand">
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
