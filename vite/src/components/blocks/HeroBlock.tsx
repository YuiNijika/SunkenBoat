import { ArrowRight, ArrowUpRight, Clock3, Eye, MessageCircle, Rss, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { FeaturedPost } from '../../types';

interface Props {
    variant?: string;
    eyebrow: string;
    title: string;
    lead: string;
    searchAction: string;
    searchPlaceholder: string;
    actions: { label: string; url: string; style: string }[];
    featured: FeaturedPost | null;
}

export default function HeroBlock({
    variant,
    eyebrow,
    title,
    lead,
    searchAction,
    searchPlaceholder,
    actions,
    featured,
}: Props) {
    const compact = variant === 'compact';
    const primary = actions.find((action) => action.style === 'primary') ?? actions[0];
    const secondary = actions.filter((action) => action !== primary);

    return (
        <section
            className="hero-canvas relative isolate overflow-hidden rounded-card border border-white/10 text-white shadow-pop"
            style={{
                backgroundImage:
                    'linear-gradient(118deg, var(--hero-from) 0%, var(--hero-to) 58%, #111827 100%)',
            }}
        >
            <span className="hero-dots pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
            <span
                className="pointer-events-none absolute -top-28 left-[18%] -z-10 size-72 rounded-full bg-white/10 blur-3xl"
                aria-hidden="true"
            />
            <span
                className="pointer-events-none absolute -right-24 -bottom-36 -z-10 size-96 rounded-full bg-black/20 blur-3xl"
                aria-hidden="true"
            />

            <div
                className={
                    'grid items-center gap-8 px-5 sm:px-8 lg:px-10 ' +
                    (compact ? 'py-8 lg:py-9' : 'py-9 lg:py-11') +
                    (featured && !compact ? ' lg:grid-cols-[minmax(0,1fr)_21rem]' : '')
                }
            >
                <div className="min-w-0">
                    {eyebrow ? (
                        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-[0.72rem] tracking-[0.12em] text-white/80">
                            <span className="size-1.5 rounded-full bg-white/80" aria-hidden="true" />
                            {eyebrow}
                        </p>
                    ) : null}

                    <h1
                        className={
                            'max-w-2xl font-semibold leading-[1.16] tracking-[-0.025em] ' +
                            (eyebrow ? 'mt-4 ' : '') +
                            (compact
                                ? 'text-[1.6rem] sm:text-[1.8rem]'
                                : 'text-[1.75rem] sm:text-[2rem] lg:text-[2.2rem]')
                        }
                    >
                        {title}
                    </h1>

                    {lead ? (
                        <p className="mt-4 max-w-xl text-[14px] leading-7 text-white/70 sm:text-[15px]">
                            {lead}
                        </p>
                    ) : null}

                    {searchAction ? (
                        <form
                            className="mt-6 flex max-w-[42rem] items-center gap-1.5 rounded-full border border-white/10 bg-surface p-1.5 pr-2 shadow-pop"
                            method="get"
                            action={searchAction}
                            role="search"
                        >
                            <Search
                                className="ml-2.5 size-4 shrink-0 text-ink-mute"
                                strokeWidth={1.8}
                                aria-hidden="true"
                            />
                            <Input
                                className="h-9 min-w-0 border-0 bg-transparent px-0 text-ink shadow-none focus-visible:ring-0"
                                type="search"
                                name="s"
                                placeholder={searchPlaceholder}
                                aria-label="搜索关键词"
                                autoComplete="off"
                            />
                            <Button type="submit" className="h-9 shrink-0 rounded-full px-5">
                                搜索
                            </Button>
                        </form>
                    ) : null}

                    {primary || secondary.length > 0 ? (
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                            {primary ? (
                                <Button
                                    asChild
                                    className="group h-9 rounded-full bg-white px-4 text-[#18202b] hover:bg-white/90"
                                >
                                    <a href={primary.url}>
                                        {primary.label}
                                        <ArrowRight
                                            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                                            strokeWidth={1.8}
                                        />
                                    </a>
                                </Button>
                            ) : null}

                            {secondary.map((action) => (
                                <Button
                                    key={action.url + action.label}
                                    asChild
                                    variant="ghost"
                                    className="h-9 rounded-full px-3 text-white/75 hover:bg-white/10 hover:text-white"
                                >
                                    <a href={action.url}>
                                        {action.style === 'ghost' ? (
                                            <Rss className="size-3.5" strokeWidth={1.8} />
                                        ) : null}
                                        {action.label}
                                    </a>
                                </Button>
                            ))}
                        </div>
                    ) : null}
                </div>

                {featured && !compact ? (
                    <a
                        className="group hidden overflow-hidden rounded-card border border-white/15 bg-white/[0.08] p-2.5 backdrop-blur-md transition-colors hover:bg-white/[0.12] lg:block"
                        href={featured.url}
                        aria-label={'阅读最新文章：' + featured.title}
                    >
                        {featured.thumb ? (
                            <div className="relative aspect-[16/8] overflow-hidden rounded-[7px] bg-white/10">
                                <img
                                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                                    src={featured.thumb}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                />
                                <span className="absolute top-2.5 left-2.5 rounded-full bg-black/45 px-2.5 py-1 text-[0.68rem] font-medium text-white backdrop-blur">
                                    最新发布
                                </span>
                            </div>
                        ) : null}

                        <div className={featured.thumb ? 'px-1.5 pt-3 pb-1' : 'px-2 py-3'}>
                            {!featured.thumb ? (
                                <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[0.66rem] text-white/72">
                                    <span className="size-1.5 rounded-full bg-white/80" aria-hidden="true" />
                                    最新发布
                                </span>
                            ) : null}
                            <h2 className="line-clamp-3 text-[1.02rem] font-semibold leading-[1.55] text-white">
                                {featured.title}
                            </h2>
                            {featured.excerpt ? (
                                <p className="mt-2 line-clamp-2 text-[0.76rem] leading-5 text-white/60">
                                    {featured.excerpt}
                                </p>
                            ) : null}

                            <div className="mt-3 flex items-center gap-3 border-t border-white/10 pt-2.5 text-[0.7rem] text-white/55">
                                <time dateTime={featured.date}>{featured.date}</time>
                                <span className="inline-flex items-center gap-1">
                                    <MessageCircle className="size-3" strokeWidth={1.8} />
                                    {featured.comments}
                                </span>
                                {featured.views > 0 ? (
                                    <span className="inline-flex items-center gap-1">
                                        <Eye className="size-3" strokeWidth={1.8} />
                                        {featured.views}
                                    </span>
                                ) : null}
                                <span className="inline-flex items-center gap-1">
                                    <Clock3 className="size-3" strokeWidth={1.8} />
                                    {featured.readingTime} 分钟
                                </span>
                                <ArrowUpRight
                                    className="ml-auto size-3.5 text-white/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                                    strokeWidth={1.8}
                                />
                            </div>
                        </div>
                    </a>
                ) : null}
            </div>
        </section>
    );
}
