import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpRight, MessageCircle, Rss } from 'lucide-react';
import Toc from '../content/Toc';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import type { TocItem } from '../../lib/article';
import type { SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    widgets: WidgetsData;
    toc?: TocItem[];
    tocTitle?: string;
    modules?: string[];
}

function Panel({
    title,
    children,
    aside,
    contentClassName = '',
}: {
    title: string;
    children: ReactNode;
    aside?: ReactNode;
    contentClassName?: string;
}) {
    return (
        <Card className="surface-card gap-0 p-[15px]">
            <div className="relative mb-2.5 flex items-center gap-2 pb-2">
                <h2 className="text-[15px] font-medium leading-6 text-ink">{title}</h2>
                {aside ? <div className="ml-auto text-[11px] text-ink-faint">{aside}</div> : null}
                <span
                    className="absolute bottom-[3px] left-0 h-[3px] w-10 rounded-[5px] bg-brand shadow-[1px_1px_3px_-1px_var(--accent)]"
                    aria-hidden="true"
                />
            </div>
            <div className={contentClassName}>{children}</div>
        </Card>
    );
}

export default function SiteSidebar({
    site,
    widgets,
    toc = [],
    tocTitle = '',
    modules = ['toc', 'site-card', 'recent-posts', 'categories', 'tags'],
}: Props) {
    const { stats, recent, categories, tags } = widgets;
    const counters = [
        { label: '文章', value: stats.posts },
        { label: '评论', value: stats.comments },
        { label: '分类', value: stats.categories },
        { label: '标签', value: stats.tags },
    ];

    const panels: Record<string, ReactNode> = {
        toc:
            toc.length > 0 ? (
                <Panel title={tocTitle || '本页目录'}>
                    <Toc items={toc} title="" />
                </Panel>
            ) : null,
        'site-card': (
            <Card className="surface-card gap-0 overflow-hidden p-0">
                <div className="site-profile-cover relative h-[84px]" aria-hidden="true">
                    <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_38%)]" />
                </div>

                <div className="px-[15px] pb-[15px]">
                    <div className="-mt-7 flex items-end">
                        {site.logo ? (
                            <img
                                className="site-profile-avatar size-14 shrink-0 rounded-full bg-surface object-cover"
                                src={site.logo}
                                alt=""
                                width={56}
                                height={56}
                            />
                        ) : (
                            <span
                                className="site-profile-avatar grid size-14 shrink-0 place-items-center rounded-full bg-brand text-[18px] font-medium text-brand-contrast"
                                aria-hidden="true"
                            >
                                {(site.title || 'S').slice(0, 1)}
                            </span>
                        )}
                    </div>

                    <h2 className="mt-2.5 truncate text-[16px] font-medium leading-6 text-ink">
                        {site.title || 'SunkenBoat'}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-ink-mute">
                        {site.subtitle || site.description || '暂无站点简介。'}
                    </p>

                    {site.feedUrl ? (
                        <Button
                            asChild
                            variant="secondary"
                            className="mt-3 h-7 w-full rounded-[4px] bg-[rgba(136,136,136,0.08)] px-2 text-[11px] font-normal text-ink-mute hover:bg-brand-soft hover:text-brand"
                        >
                            <a href={site.feedUrl}>
                                <Rss className="size-3" strokeWidth={1.6} aria-hidden="true" />
                                RSS 订阅
                            </a>
                        </Button>
                    ) : null}

                    <dl className="mt-3 grid grid-cols-4 border-t border-line pt-3 text-center">
                        {counters.map((counter) => (
                            <div key={counter.label} className="min-w-0 px-1">
                                <dd className="text-[15px] font-semibold leading-5 text-ink">{counter.value}</dd>
                                <dt className="text-[11px] leading-4 text-ink-faint">{counter.label}</dt>
                            </div>
                        ))}
                    </dl>
                </div>
            </Card>
        ),
        'recent-posts':
            recent.length > 0 ? (
                <Panel title="最新文章" aside={<span>最近更新</span>} contentClassName="-mx-[5px]">
                    <ul>
                        {recent.map((post) => (
                            <li key={post.url} className="group flex gap-2.5 p-2.5">
                                <a
                                    className="relative block w-24 shrink-0 overflow-hidden rounded-[8px] bg-surface-3 aspect-[10/7]"
                                    href={post.url}
                                    tabIndex={-1}
                                    aria-hidden="true"
                                >
                                    {post.thumb ? (
                                        <img
                                            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                            src={post.thumb}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <span className="post-thumb-placeholder grid size-full place-items-center text-[12px] font-medium text-brand/70">
                                            {post.title.slice(0, 1)}
                                        </span>
                                    )}
                                </a>
                                <div className="min-w-0 flex-1">
                                    <a
                                        className="line-clamp-2 text-[14px] font-medium leading-[1.35] text-ink transition-colors group-hover:text-brand"
                                        href={post.url}
                                    >
                                        {post.title}
                                    </a>
                                    <div className="mt-1 flex items-center gap-2.5 text-[12px] text-ink-faint">
                                        <time dateTime={post.date}>{post.date}</time>
                                        <span className="inline-flex items-center gap-1">
                                            <MessageCircle className="size-3" strokeWidth={1.6} />
                                            {post.comments}
                                        </span>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Panel>
            ) : null,
        categories:
            categories.length > 0 ? (
                <Panel title="文章分类" aside={<span>{categories.length} 个</span>}>
                    <ul>
                        {categories.map((category) => (
                            <li key={category.url + category.label}>
                                <a
                                    className="group flex items-center justify-between gap-3 py-1.5 text-[14px] text-ink-soft transition-colors hover:text-brand"
                                    href={category.url}
                                >
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span className="size-1 rounded-full bg-line transition-colors group-hover:bg-brand" />
                                        <span className="truncate">{category.label}</span>
                                    </span>
                                    <span className="text-[12px] text-ink-faint">{category.count}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </Panel>
            ) : null,
        tags:
            tags.length > 0 ? (
                <Panel
                    title="热门标签"
                    aside={
                        <a className="inline-flex items-center gap-0.5 hover:text-brand" href={site.url}>
                            全部
                            <ArrowUpRight className="size-3" strokeWidth={1.6} />
                        </a>
                    }
                >
                    <ul className="flex flex-wrap gap-[5px]">
                        {tags.map((tag) => (
                            <li key={tag.url + tag.label}>
                                <Badge
                                    asChild
                                    variant="secondary"
                                    className="rounded-[4px] border-0 bg-[rgba(136,136,136,0.1)] px-[5px] py-[2px] text-[11px] font-normal leading-[1.44] text-ink-mute hover:bg-brand-soft hover:text-brand"
                                >
                                    <a href={tag.url}>#{tag.label}</a>
                                </Badge>
                            </li>
                        ))}
                    </ul>
                </Panel>
            ) : null,
    };

    return (
        <div className="grid gap-5">
            {modules.map((module) => (
                <Fragment key={module}>{panels[module] ?? null}</Fragment>
            ))}
        </div>
    );
}
