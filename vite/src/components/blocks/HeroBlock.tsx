import {
    ArrowRight,
    ArrowUpRight,
    Rss,
    Search,
    Sparkles,
} from 'lucide-react';
import { useId } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cssUrl, safeCssUrl } from '../../lib/css';

export interface HeroCardData {
    title: string;
    text: string;
    url: string;
    badge: string;
}

interface Props {
    variant?: string;
    width?: 'content' | 'half' | 'full';
    eyebrow: string;
    title: string;
    lead: string;
    background?: 'color' | 'image' | 'video';
    color?: string;
    image?: string;
    imageFit?: 'cover' | 'contain' | 'fill';
    imageEffect?: 'none' | 'fixed' | 'zoom' | 'pan';
    imagePosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
    video?: string;
    videoPoster?: string;
    height?: '' | 'sm' | 'md' | 'lg' | 'screen';
    overlay?: number;
    align?: 'left' | 'center';
    hot?: string[];
    searchAction: string;
    searchPlaceholder: string;
    actions: { label: string; url: string; style: string }[];
    cards?: HeroCardData[];
    cardStyle?: 'glass' | 'solid';
}

export default function HeroBlock({
    variant,
    width = 'content',
    eyebrow,
    title,
    lead,
    background = 'color',
    color = '#10141c',
    image = '',
    imageFit = 'cover',
    imageEffect = 'none',
    imagePosition = 'center',
    video = '',
    videoPoster = '',
    height = '',
    overlay = 55,
    align = 'center',
    hot = [],
    searchAction,
    searchPlaceholder,
    actions,
    cards = [],
    cardStyle = 'glass',
}: Props) {
    const headingId = `hero-title-${useId().replace(/:/g, '')}`;
    const compact = variant === 'compact';
    const primary = actions.find((action) => action.style === 'primary') ?? actions[0];
    const secondary = actions.filter((action) => action !== primary);
    const imageUrl = safeCssUrl(image);
    const hasImage = background === 'image' && imageUrl !== null;
    const hasVideo = background === 'video' && video !== '';
    const hasMedia = hasImage || hasVideo;
    const cardRows = cards.filter((card) => card.title !== '' || card.text !== '').slice(0, 4);
    const className = [
        'hero-block hero-v2',
        `hero-block-${width}`,
        compact ? 'is-compact' : '',
        hasImage ? 'is-image' : '',
        hasImage ? `is-image-fit-${imageFit}` : '',
        hasImage ? `is-image-effect-${imageEffect}` : '',
        hasImage ? `is-image-pos-${imagePosition}` : '',
        hasVideo ? 'is-video' : '',
        hasMedia ? 'has-media' : 'is-color',
        align === 'center' ? 'is-center' : 'is-left',
        cardRows.length > 0 ? 'has-cards' : '',
        height !== '' ? `is-height-${height}` : '',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className={`hero-stack${cardRows.length > 0 ? ' has-cards' : ''}`}>
            <section
                className={className}
                data-width={width}
                style={hasMedia ? undefined : { background: color }}
                aria-labelledby={headingId}
            >
                {hasImage ? (
                    imageEffect === 'fixed' ? (
                        <span
                            className="hero-bg hero-bg-fixed"
                            style={{ backgroundImage: cssUrl(imageUrl) }}
                            aria-hidden="true"
                        />
                    ) : (
                        <img
                            className="hero-bg"
                            src={imageUrl ?? undefined}
                            alt=""
                            loading="eager"
                            decoding="async"
                        />
                    )
                ) : null}
                {hasVideo ? (
                    <video
                        className="hero-bg hero-video"
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        poster={videoPoster || undefined}
                        aria-hidden="true"
                    >
                        <source src={video} />
                    </video>
                ) : null}
                {hasMedia ? (
                    <span
                        className="hero-overlay"
                        style={{ opacity: Math.max(0, Math.min(90, overlay)) / 100 }}
                        aria-hidden="true"
                    />
                ) : null}
                <div className="hero-block-inner">
                    <div className="hero-layout">
                        <div className="hero-copy">
                            {eyebrow ? (
                                <p className="hero-eyebrow">
                                    <Sparkles
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                    {eyebrow}
                                </p>
                            ) : null}

                            <h1 id={headingId} className="hero-title">
                                {title}
                            </h1>

                            {lead ? <p className="hero-lead">{lead}</p> : null}

                            {searchAction ? (
                                <form
                                    className="hero-search"
                                    method="get"
                                    action={searchAction}
                                    role="search"
                                >
                                    <Input
                                        className="hero-search-input"
                                        type="search"
                                        name="s"
                                        placeholder={searchPlaceholder}
                                        aria-label="搜索关键词"
                                        autoComplete="off"
                                    />
                                    <Button
                                        type="submit"
                                        className="hero-search-submit"
                                        aria-label="搜索"
                                    >
                                        <Search strokeWidth={1.9} aria-hidden="true" />
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
                    </div>
                </div>
            </section>

            {cardRows.length > 0 ? (
                <div className="hero-cards-wrap">
                    <div className={`hero-cards hero-cards-${cardStyle}`}>
                        {cardRows.map((card, index) => {
                            const body = (
                                <>
                                    <span className="hero-card-icon" aria-hidden="true">
                                        <Sparkles className="size-4" strokeWidth={1.8} />
                                    </span>
                                    <span className="hero-card-copy">
                                        <span className="hero-card-title">
                                            {card.title}
                                            {card.badge ? (
                                                <em className="hero-card-badge">{card.badge}</em>
                                            ) : null}
                                        </span>
                                        {card.text ? (
                                            <span className="hero-card-text">{card.text}</span>
                                        ) : null}
                                    </span>
                                </>
                            );

                            return card.url !== '' ? (
                                <a
                                    key={`${card.title}-${index}`}
                                    className="hero-card"
                                    href={card.url}
                                >
                                    {body}
                                    <ArrowUpRight
                                        className="hero-card-arrow"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                </a>
                            ) : (
                                <div key={`${card.title}-${index}`} className="hero-card">
                                    {body}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
