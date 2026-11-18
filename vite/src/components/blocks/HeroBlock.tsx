import {
    ArrowRight,
    ArrowUpRight,
    Clock3,
    MessageCircle,
    Rss,
    Search,
    Sparkles,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { FeaturedPost } from '../../types';

interface Props {
    variant?: string;
    width?: 'content' | 'half' | 'full';
    eyebrow: string;
    title: string;
    lead: string;
    image?: string;
    height?: '' | 'sm' | 'md' | 'lg' | 'screen';
    overlay?: number;
    align?: 'left' | 'center';
    hot?: string[];
    showFeatured?: boolean;
    searchAction: string;
    searchPlaceholder: string;
    actions: { label: string; url: string; style: string }[];
    featured: FeaturedPost | null;
}

export default function HeroBlock({
    variant,
    width = 'content',
    eyebrow,
    title,
    lead,
    image = '',
    height = '',
    overlay = 55,
    align = 'center',
    hot = [],
    showFeatured = true,
    searchAction,
    searchPlaceholder,
    actions,
    featured,
}: Props) {
    const compact = variant === 'compact';
    const primary = actions.find((action) => action.style === 'primary') ?? actions[0];
    const secondary = actions.filter((action) => action !== primary);
    const featuredPost = showFeatured ? featured : null;
    const hasImage = image !== '';
    const className = [
        'hero-block',
        `hero-block-${width}`,
        compact ? 'is-compact' : '',
        hasImage ? 'is-image' : '',
        align === 'center' ? 'is-center' : '',
        featuredPost ? 'has-featured' : '',
        height !== '' ? `is-height-${height}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <section
            className={className}
            data-width={width}
            aria-labelledby="hero-title"
        >
            {hasImage ? (
                <>
                    <img className="hero-bg" src={image} alt="" loading="eager" decoding="async" />
                    <span
                        className="hero-overlay"
                        style={{ opacity: Math.max(0, Math.min(90, overlay)) / 100 }}
                        aria-hidden="true"
                    />
                </>
            ) : null}
            <div className="hero-block-inner">
                <div className={`hero-layout${featuredPost ? ' has-featured' : ''}`}>
                    <div className="hero-copy">
                        {eyebrow ? (
                            <p className="hero-eyebrow">
                                <Sparkles className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                {eyebrow}
                            </p>
                        ) : null}

                        <h1 id="hero-title" className="hero-title">
                            {title}
                        </h1>

                        {lead ? <p className="hero-lead">{lead}</p> : null}

                        {searchAction ? (
                            <form className="hero-search" method="get" action={searchAction} role="search">
                                <Search
                                    className="size-4 shrink-0 text-ink-mute"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                                <Input
                                    className="h-10 min-w-0 border-0 bg-transparent px-0 text-ink shadow-none focus-visible:ring-0"
                                    type="search"
                                    name="s"
                                    placeholder={searchPlaceholder}
                                    aria-label="搜索关键词"
                                    autoComplete="off"
                                />
                                <Button type="submit" className="h-10 shrink-0 rounded-full px-5">
                                    搜索
                                </Button>
                            </form>
                        ) : null}

                        {hot.length > 0 ? (
                            <p className="hero-hot">
                                <span>热门搜索</span>
                                {hot.map((keyword) => (
                                    <a
                                        key={keyword}
                                        href={`${searchAction}?s=${encodeURIComponent(keyword)}`}
                                    >
                                        {keyword}
                                    </a>
                                ))}
                            </p>
                        ) : null}

                        {primary || secondary.length > 0 ? (
                            <div className="hero-actions">
                                {primary ? (
                                    <Button
                                        asChild
                                        className="group h-10 rounded-full bg-white px-5 text-[#18202b] hover:bg-white/90"
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
                                        className="h-10 rounded-full px-4 text-white/78 hover:bg-white/10 hover:text-white"
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

                    {featuredPost ? (
                        <a
                            className="hero-featured group"
                            href={featuredPost.url}
                            aria-label={`阅读最新文章：${featuredPost.title}`}
                        >
                            <div className="hero-featured-media">
                                {featuredPost.thumb ? (
                                    <img
                                        src={featuredPost.thumb}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <span className="hero-featured-placeholder" aria-hidden="true">
                                        {featuredPost.title.slice(0, 1)}
                                    </span>
                                )}
                                <span className="hero-featured-tag">最新发布</span>
                            </div>
                            <div className="hero-featured-body">
                                <h2>{featuredPost.title}</h2>
                                {featuredPost.excerpt ? <p>{featuredPost.excerpt}</p> : null}
                                <div className="hero-featured-meta">
                                    <time dateTime={featuredPost.date}>{featuredPost.date}</time>
                                    <span>
                                        <MessageCircle className="size-3" strokeWidth={1.8} />
                                        {featuredPost.comments}
                                    </span>
                                    <span>
                                        <Clock3 className="size-3" strokeWidth={1.8} />
                                        {featuredPost.readingTime} 分钟
                                    </span>
                                    <ArrowUpRight
                                        className="ml-auto size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                                        strokeWidth={1.8}
                                    />
                                </div>
                            </div>
                        </a>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
