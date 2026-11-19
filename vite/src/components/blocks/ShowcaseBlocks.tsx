import {
    ArrowDownToLine,
    ArrowRight,
    ArrowUpRight,
    BadgeCheck,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    FileText,
    Globe,
    Layers,
    MessageCircle,
    Play,
    Plus,
    ShieldCheck,
    Sparkles,
    Star,
    Users,
    Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import PostCard from '../content/PostCard';
import type { CSSProperties } from 'react';
import type {
    AuthorGridBlock as AuthorGridData,
    ButtonGroupBlock as ButtonGroupData,
    HeadingBlock as HeadingData,
    InfoCardsBlock as InfoCardsData,
    LogoCloudBlock as LogoCloudData,
    MediaSplitBlock as MediaSplitData,
    PostTabsBlock as PostTabsData,
    PostAuthorBlock as PostAuthorData,
    ProductGridBlock as ProductGridData,
    PromoGridBlock as PromoGridData,
    PartnerScrollBlock as PartnerScrollData,
} from '../../types';

function BlockIntro({ title, text }: { title: string; text: string }) {
    if (title === '' && text === '') {
        return null;
    }

    return (
        <div className="max-w-2xl">
            {title !== '' ? (
                <h2 className="text-[18px] font-semibold leading-7 text-ink">{title}</h2>
            ) : null}
            {text !== '' ? (
                <p className="mt-1.5 text-[12.5px] leading-6 text-ink-mute">{text}</p>
            ) : null}
        </div>
    );
}

export function PromoGridBlock({ variant, title, text, items }: PromoGridData) {
    if (items.length === 0) {
        return null;
    }

    const mode = variant === 'duo' || variant === 'trio' ? variant : 'feature';

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <div className={`promo-grid is-${mode}`}>
                {items.map((item, index) => {
                    const body = (
                        <>
                            {item.image !== '' ? (
                                <img
                                    className="promo-card-image"
                                    src={item.image}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                />
                            ) : null}
                            <span className="promo-card-overlay" aria-hidden="true" />
                            <span className="promo-card-body">
                                {item.badge !== '' ? (
                                    <span className="promo-card-badge">{item.badge}</span>
                                ) : null}
                                <span className="promo-card-title">{item.title || `推荐 ${index + 1}`}</span>
                                {item.text !== '' ? (
                                    <span className="promo-card-text">{item.text}</span>
                                ) : null}
                                <span className="promo-card-more">
                                    查看详情
                                    <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                </span>
                            </span>
                        </>
                    );

                    return item.url !== '' ? (
                        <a key={`${item.title}-${index}`} className="promo-card" href={item.url}>
                            {body}
                        </a>
                    ) : (
                        <div key={`${item.title}-${index}`} className="promo-card">
                            {body}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export function PostTabsBlock({ title, text, columns, tabs }: PostTabsData) {
    const available = tabs.filter((tab) => tab.posts.length > 0);
    const [active, setActive] = useState(0);

    if (available.length === 0) {
        return null;
    }

    const current = available[Math.min(active, available.length - 1)];
    const columnClass =
        columns >= 2 && columns <= 4 ? ` post-grid-cols-${columns}` : ' post-grid-cols-3';

    return (
        <section className="post-tabs-block">
            <div className="post-tabs-head">
                <div className="min-w-0">
                    <BlockIntro title={title} text={text} />
                </div>
                <div className="post-tabs-nav" role="tablist" aria-label={title || '内容分类'}>
                    {available.map((tab, index) => (
                        <button
                            key={tab.label + index}
                            type="button"
                            role="tab"
                            aria-selected={index === active}
                            className={'post-tabs-tab' + (index === active ? ' is-active' : '')}
                            onClick={() => setActive(index)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {current.url !== '' ? (
                    <a className="post-tabs-more" href={current.url}>
                        查看更多
                        <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    </a>
                ) : null}
            </div>
            <div
                className={'grid gap-[15px]' + columnClass}
                role="tabpanel"
                aria-label={current.label}
            >
                {current.posts.map((post) => (
                    <PostCard key={post.url} post={post} variant="grid" />
                ))}
            </div>
        </section>
    );
}

export function AuthorGridBlock({ title, text, columns, items }: AuthorGridData) {
    if (items.length === 0) {
        return null;
    }

    const style = {
        '--author-cols': Math.max(1, Math.min(4, columns)),
    } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <ul className="author-grid" style={style}>
                {items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="author-tile surface-card">
                        <div className="author-tile-head">
                            {item.avatar !== '' ? (
                                <img
                                    className="author-tile-avatar"
                                    src={item.avatar}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                />
                            ) : (
                                <span className="author-tile-avatar is-fallback" aria-hidden="true">
                                    {(item.name || 'U').slice(0, 1)}
                                </span>
                            )}
                            <div className="min-w-0">
                                <p className="author-tile-name">
                                    {item.name}
                                    {item.badge !== '' ? (
                                        <BadgeCheck
                                            className="size-3.5 shrink-0 text-brand"
                                            strokeWidth={2}
                                            aria-label={item.badge}
                                        />
                                    ) : null}
                                </p>
                                {item.badge !== '' ? (
                                    <p className="author-tile-badge">{item.badge}</p>
                                ) : null}
                            </div>
                        </div>
                        {item.bio !== '' ? <p className="author-tile-bio">{item.bio}</p> : null}
                        <div className="author-tile-meta">
                            <span>
                                <FileText className="size-3" strokeWidth={1.7} aria-hidden="true" />
                                {item.posts} 篇文章
                            </span>
                            <span>
                                <MessageCircle className="size-3" strokeWidth={1.7} aria-hidden="true" />
                                {item.comments} 条评论
                            </span>
                        </div>
                        {item.url !== '' ? (
                            <a className="author-tile-link" href={item.url}>
                                进入主页
                                <ArrowUpRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                            </a>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function ProductGridBlock({ title, text, columns, items }: ProductGridData) {
    if (items.length === 0) {
        return null;
    }

    const style = {
        '--product-cols': Math.max(2, Math.min(5, columns)),
    } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <ul className="product-grid" style={style}>
                {items.map((item, index) => (
                    <li key={`${item.title}-${index}`}>
                        <a className="product-card surface-card" href={item.url || '#'}>
                            <span className="product-media">
                                {item.image !== '' ? (
                                    <img
                                        src={item.image}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                    />
                                ) : (
                                    <span className="product-media-fallback" aria-hidden="true">
                                        {(item.title || 'R').slice(0, 1)}
                                    </span>
                                )}
                                {item.badge !== '' ? (
                                    <span className="product-badge">{item.badge}</span>
                                ) : null}
                            </span>
                            <span className="product-body">
                                <span className="product-title">{item.title}</span>
                                {item.text !== '' ? (
                                    <span className="product-text">{item.text}</span>
                                ) : null}
                                <span className="product-price-row">
                                    {item.price !== '' ? (
                                        <span className="product-price">{item.price}</span>
                                    ) : null}
                                    {item.originalPrice !== '' ? (
                                        <span className="product-price-original">
                                            {item.originalPrice}
                                        </span>
                                    ) : null}
                                </span>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function LogoCloudBlock({ title, text, columns, items }: LogoCloudData) {
    if (items.length === 0) {
        return null;
    }

    const style = {
        '--logo-cols': Math.max(2, Math.min(6, columns)),
    } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <ul className="logo-cloud" style={style}>
                {items.map((item, index) => {
                    const body = (
                        <>
                            {item.image !== '' ? (
                                <img src={item.image} alt={item.name} loading="lazy" decoding="async" />
                            ) : (
                                <span className="logo-cloud-text">{item.name}</span>
                            )}
                        </>
                    );

                    return (
                        <li key={`${item.name}-${index}`}>
                            {item.url !== '' ? (
                                <a href={item.url} aria-label={item.name}>
                                    {body}
                                </a>
                            ) : (
                                <span>{body}</span>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export function HeadingBlock({ variant, eyebrow, title, text }: HeadingData) {
    const mode = ['plain', 'bar', 'center', 'boxed'].includes(variant ?? '') ? variant : 'plain';

    return (
        <section className={`heading-block is-${mode}`}>
            {eyebrow !== '' ? <p className="section-label">{eyebrow}</p> : null}
            {title !== '' ? <h2 className="heading-block-title">{title}</h2> : null}
            {text !== '' ? <p className="heading-block-text">{text}</p> : null}
        </section>
    );
}

const BUTTON_ICONS = {
    arrow: ArrowRight,
    plus: Plus,
    download: ArrowDownToLine,
    external: ExternalLink,
};

export function ButtonGroupBlock({ variant, title, text, items }: ButtonGroupData) {
    if (items.length === 0) {
        return null;
    }

    const mode = ['inline', 'center', 'stack'].includes(variant ?? '') ? variant : 'inline';

    return (
        <section className={`button-group-block is-${mode}`}>
            {title !== '' || text !== '' ? <BlockIntro title={title} text={text} /> : null}
            <div className="button-group">
                {items.map((item, index) => {
                    const Icon = item.icon !== '' ? BUTTON_ICONS[item.icon as keyof typeof BUTTON_ICONS] : null;

                    return (
                        <a
                            key={`${item.label}-${index}`}
                            className={`button-group-item is-${item.style}`}
                            href={item.url}
                        >
                            {item.label}
                            {Icon ? <Icon className="size-3.5" strokeWidth={1.8} aria-hidden="true" /> : null}
                        </a>
                    );
                })}
            </div>
        </section>
    );
}

const INFO_ICONS = {
    sparkles: Sparkles,
    shield: ShieldCheck,
    zap: Zap,
    book: BookOpen,
    users: Users,
    message: MessageCircle,
    star: Star,
    globe: Globe,
    layers: Layers,
};

export function InfoCardsBlock({ title, text, columns, items }: InfoCardsData) {
    if (items.length === 0) {
        return null;
    }

    const style = {
        '--info-cols': Math.max(2, Math.min(4, columns)),
    } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <ul className="info-card-grid" style={style}>
                {items.map((item, index) => {
                    const Icon = INFO_ICONS[item.icon as keyof typeof INFO_ICONS] ?? Sparkles;
                    const body = (
                        <>
                            <span className="info-card-head">
                                <span className="info-card-icon" aria-hidden="true">
                                    <Icon className="size-4" strokeWidth={1.8} />
                                </span>
                                {item.tag !== '' ? <span className="info-card-tag">{item.tag}</span> : null}
                            </span>
                            <span className="info-card-title">{item.title}</span>
                            {item.text !== '' ? <span className="info-card-text">{item.text}</span> : null}
                            {item.url !== '' ? (
                                <span className="info-card-more">
                                    了解更多
                                    <ArrowUpRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                </span>
                            ) : null}
                        </>
                    );

                    return (
                        <li key={`${item.title}-${index}`} className="info-card surface-card">
                            {item.url !== '' ? (
                                <a className="info-card-link" href={item.url}>
                                    {body}
                                </a>
                            ) : (
                                body
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export function PartnerScrollBlock({
    variant,
    title,
    text,
    columns,
    speed,
    items,
}: PartnerScrollData) {
    if (items.length === 0) {
        return null;
    }

    const mode = ['marquee', 'grid', 'plain'].includes(variant ?? '') ? variant : 'marquee';
    const style = {
        '--partner-cols': Math.max(2, Math.min(6, columns)),
        '--partner-speed': `${Math.max(8, speed)}s`,
    } as CSSProperties;

    const tile = (item: (typeof items)[number], key: string) => {
        const body = (
            <>
                {item.image !== '' ? (
                    <img src={item.image} alt={item.name} loading="lazy" decoding="async" />
                ) : (
                    <span className="partner-name">{item.name}</span>
                )}
            </>
        );

        return (
            <li key={key} className="partner-item">
                {item.url !== '' ? (
                    <a href={item.url} aria-label={item.name}>
                        {body}
                    </a>
                ) : (
                    <span>{body}</span>
                )}
            </li>
        );
    };

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <div className={`partner-scroll is-${mode}`} style={style}>
                {mode === 'marquee' ? (
                    <ul className="partner-track">
                        {items.map((item, index) => tile(item, `a-${item.name}-${index}`))}
                        {items.map((item, index) => tile(item, `b-${item.name}-${index}`))}
                    </ul>
                ) : (
                    <ul className="partner-list">
                        {items.map((item, index) => tile(item, `${item.name}-${index}`))}
                    </ul>
                )}
            </div>
        </section>
    );
}

export function MediaSplitBlock({
    title,
    text,
    kind,
    media,
    poster,
    slides,
    columns,
    items,
}: MediaSplitData) {
    const [index, setIndex] = useState(0);
    const hasSlides = kind === 'slides' && slides.length > 0;

    useEffect(() => {
        if (!hasSlides || slides.length < 2) {
            return;
        }

        const timer = window.setInterval(() => {
            setIndex((current) => (current + 1) % slides.length);
        }, 5200);

        return () => window.clearInterval(timer);
    }, [hasSlides, slides.length]);

    if (media === '' && slides.length === 0 && items.length === 0) {
        return null;
    }

    const active = slides[Math.min(index, Math.max(0, slides.length - 1))];
    const style = {
        '--media-split-cols': Math.max(2, Math.min(3, columns)),
    } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <BlockIntro title={title} text={text} />
            <div className="media-split" style={style}>
                <div className="media-split-main surface-card">
                    {kind === 'video' && media !== '' ? (
                        <video src={media} poster={poster !== '' ? poster : undefined} controls preload="metadata" />
                    ) : hasSlides && active ? (
                        <>
                            {active.url !== '' ? (
                                <a className="media-split-slide" href={active.url}>
                                    {active.image !== '' ? <img src={active.image} alt="" loading="lazy" /> : null}
                                    <span className="media-split-caption">
                                        {active.title !== '' ? <strong>{active.title}</strong> : null}
                                        {active.description !== '' ? <span>{active.description}</span> : null}
                                    </span>
                                </a>
                            ) : (
                                <div className="media-split-slide">
                                    {active.image !== '' ? <img src={active.image} alt="" loading="lazy" /> : null}
                                    <span className="media-split-caption">
                                        {active.title !== '' ? <strong>{active.title}</strong> : null}
                                        {active.description !== '' ? <span>{active.description}</span> : null}
                                    </span>
                                </div>
                            )}
                            {slides.length > 1 ? (
                                <div className="media-split-controls">
                                    <button
                                        type="button"
                                        aria-label="上一张"
                                        onClick={() => setIndex((index - 1 + slides.length) % slides.length)}
                                    >
                                        <ChevronLeft className="size-4" strokeWidth={1.8} />
                                    </button>
                                    <span>
                                        {index + 1} / {slides.length}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label="下一张"
                                        onClick={() => setIndex((index + 1) % slides.length)}
                                    >
                                        <ChevronRight className="size-4" strokeWidth={1.8} />
                                    </button>
                                </div>
                            ) : null}
                        </>
                    ) : media !== '' ? (
                        <img src={media} alt="" loading="lazy" decoding="async" />
                    ) : (
                        <span className="media-split-fallback" aria-hidden="true">
                            <Play className="size-6" strokeWidth={1.6} />
                        </span>
                    )}
                </div>
                <div className="media-split-cards">
                    {items.map((item, position) => (
                        <article key={`${item.title}-${position}`} className="media-split-card surface-card">
                            <div className="media-split-card-media">
                                {item.kind === 'video' && item.media !== '' ? (
                                    <video src={item.media} controls preload="metadata" />
                                ) : item.media !== '' ? (
                                    <img src={item.media} alt="" loading="lazy" decoding="async" />
                                ) : (
                                    <span className="media-split-fallback" aria-hidden="true">
                                        <Play className="size-5" strokeWidth={1.6} />
                                    </span>
                                )}
                            </div>
                            <div className="media-split-card-body">
                                <p className="media-split-card-title">
                                    {item.url !== '' ? <a href={item.url}>{item.title}</a> : item.title}
                                </p>
                                {item.text !== '' ? <p className="media-split-card-text">{item.text}</p> : null}
                            </div>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function PostAuthorBlock({ title, showAuthor, showPosts, author, posts }: PostAuthorData) {
    return (
        <section className="post-author-block">
            {showAuthor ? (
                <div className="post-author-card surface-card">
                    {author.avatar !== '' ? (
                        <img
                            className="post-author-avatar"
                            src={author.avatar}
                            alt=""
                            loading="lazy"
                            decoding="async"
                        />
                    ) : (
                        <span className="post-author-avatar is-fallback" aria-hidden="true">
                            {(author.name || 'A').slice(0, 1)}
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="post-author-name">{author.name}</p>
                            {author.badge !== '' ? <span className="chip">{author.badge}</span> : null}
                        </div>
                        {author.bio !== '' ? <p className="post-author-bio">{author.bio}</p> : null}
                        <div className="post-author-meta">
                            <span>{author.posts} 篇文章</span>
                            {author.comments > 0 ? <span>{author.comments} 条评论</span> : null}
                        </div>
                    </div>
                    {author.url !== '' ? (
                        <a className="post-author-link" href={author.url}>
                            作者主页
                            <ArrowUpRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        </a>
                    ) : null}
                </div>
            ) : null}
            {showPosts && posts.length > 0 ? (
                <div className="grid gap-[15px]">
                    {title !== '' ? (
                        <h2 className="text-[15px] font-medium leading-6 text-ink">{title}</h2>
                    ) : null}
                    <div className="grid gap-[12px]">
                        {posts.map((post) => (
                            <PostCard key={post.url} post={post} variant="list" />
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
