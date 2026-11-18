import { useState } from 'react';
import {
    AlertCircle,
    ArrowRight,
    ArrowUpRight,
    CheckCircle2,
    ChevronDown,
    Info,
    Mail,
    Sparkles,
    TriangleAlert,
} from 'lucide-react';
import { Button } from '../ui/button';
import ImageLightbox from '../content/ImageLightbox';
import type { LightboxImage } from '../content/ImageLightbox';
import type {
    AlertBlock as AlertBlockData,
    AuthorCardBlock as AuthorCardData,
    FaqBlock as FaqBlockData,
    FeatureGridBlock as FeatureGridData,
    GalleryBlock as GalleryBlockData,
    NoticeBlock as NoticeBlockData,
    QuoteBlock as QuoteBlockData,
    StatsBlock as StatsBlockData,
    StepsBlock as StepsBlockData,
    SubscribeBlock as SubscribeBlockData,
    TableBlock as TableBlockData,
    TimelineBlock as TimelineBlockData,
} from '../../types';

const ALERT_ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: TriangleAlert,
    danger: AlertCircle,
};

const GRID_COLUMNS: Record<string, string> = {
    two: 'sm:grid-cols-2',
    three: 'sm:grid-cols-2 lg:grid-cols-3',
    four: 'sm:grid-cols-2 lg:grid-cols-4',
};

function SectionIntro({ eyebrow, title, text }: { eyebrow?: string; title?: string; text?: string }) {
    if (!eyebrow && !title && !text) {
        return null;
    }

    return (
        <div className="max-w-2xl">
            {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
            {title ? <h2 className="mt-2 text-[20px] font-semibold leading-8 text-ink">{title}</h2> : null}
            {text ? <p className="mt-2 text-[13px] leading-6 text-ink-mute">{text}</p> : null}
        </div>
    );
}

export function AlertBlock({ variant, title, text, action }: AlertBlockData) {
    const tone = variant && variant in ALERT_ICONS ? variant : 'info';
    const Icon = ALERT_ICONS[tone as keyof typeof ALERT_ICONS];

    return (
        <div
            className={`alert-block is-${tone}`}
            role={tone === 'danger' ? 'alert' : 'status'}
        >
            <div className="flex items-start gap-3">
                <span className="alert-block-icon" aria-hidden="true">
                    <Icon className="size-4" strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                    {title ? <p className="text-[14px] font-semibold text-ink">{title}</p> : null}
                    {text ? (
                        <p className="alert-block-text mt-1 text-[13px] leading-6 text-ink-soft">{text}</p>
                    ) : null}
                </div>
                {action.url !== '' ? (
                    <Button asChild variant="outline" size="sm" className="shrink-0 bg-surface">
                        <a href={action.url}>
                            {action.label || '查看'}
                            <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        </a>
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

export function NoticeBlock({ variant, eyebrow, title, text, action }: NoticeBlockData) {
    const tone = variant === 'accent' || variant === 'dark' ? variant : 'soft';

    return (
        <section className={`notice-block is-${tone}`}>
            <div className="notice-block-inner">
                <div className="min-w-0">
                    {eyebrow ? <p className="notice-eyebrow">{eyebrow}</p> : null}
                    {title ? <p className="notice-title">{title}</p> : null}
                    {text ? <p className="notice-text">{text}</p> : null}
                </div>
                {action.url !== '' ? (
                    <Button asChild size="sm" className="notice-action shrink-0">
                        <a href={action.url}>
                            {action.label || '查看详情'}
                            <ArrowUpRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        </a>
                    </Button>
                ) : null}
            </div>
        </section>
    );
}

export function QuoteBlock({ variant, text, cite, sourceUrl }: QuoteBlockData) {
    return (
        <blockquote className={`quote-block surface-card ${variant === 'large' ? 'is-large' : ''}`}>
            <span className="quote-mark" aria-hidden="true">
                “
            </span>
            <p className="quote-text">{text}</p>
            {cite ? (
                <footer className="quote-cite">
                    <span aria-hidden="true">— </span>
                    {sourceUrl !== '' ? (
                        <a href={sourceUrl} className="hover:text-brand">
                            {cite}
                        </a>
                    ) : (
                        cite
                    )}
                </footer>
            ) : null}
        </blockquote>
    );
}

export function FeatureGridBlock({ variant, eyebrow, title, text, items }: FeatureGridData) {
    return (
        <section className="grid gap-4">
            <SectionIntro eyebrow={eyebrow} title={title} text={text} />
            <div className={`grid gap-3 ${GRID_COLUMNS[variant ?? 'three'] ?? GRID_COLUMNS.three}`}>
                {items.map((item, index) => {
                    const body = (
                        <>
                            <span className="feature-icon" aria-hidden="true">
                                <Sparkles className="size-4" strokeWidth={1.8} />
                            </span>
                            <p className="mt-3 text-[14px] font-semibold text-ink">
                                {item.title || `特性 ${index + 1}`}
                            </p>
                            {item.text ? (
                                <p className="mt-1.5 text-[12.5px] leading-6 text-ink-mute">{item.text}</p>
                            ) : null}
                            {item.url !== '' ? (
                                <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-brand">
                                    了解更多
                                    <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                                </span>
                            ) : null}
                        </>
                    );

                    return item.url !== '' ? (
                        <a
                            key={`${item.title}-${index}`}
                            className="feature-card surface-card"
                            href={item.url}
                        >
                            {body}
                        </a>
                    ) : (
                        <div key={`${item.title}-${index}`} className="feature-card surface-card">
                            {body}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export function StatsBlock({ variant, title, text, items }: StatsBlockData) {
    const strip = variant === 'strip';

    return (
        <section className={strip ? 'stats-strip' : 'grid gap-4'}>
            {strip ? null : <SectionIntro title={title} text={text} />}
            <div
                className={
                    strip
                        ? 'stats-strip-grid'
                        : `grid gap-3 ${GRID_COLUMNS[variant ?? 'four'] ?? GRID_COLUMNS.four}`
                }
            >
                {items.map((item, index) => (
                    <div
                        key={`${item.label}-${index}`}
                        className={strip ? 'stats-strip-item' : 'surface-card stat-card'}
                    >
                        <p className="stat-value">{item.value || '0'}</p>
                        <p className="stat-label">{item.label}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function StepsBlock({ variant, eyebrow, title, text, items }: StepsBlockData) {
    const grid = variant === 'grid';

    return (
        <section className="grid gap-4">
            <SectionIntro eyebrow={eyebrow} title={title} text={text} />
            <ol className={grid ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
                {items.map((item, index) => (
                    <li key={`${item.title}-${index}`} className="surface-card step-card">
                        <span className="step-index" aria-hidden="true">
                            {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-ink">
                                {item.title || `步骤 ${index + 1}`}
                            </p>
                            {item.text ? (
                                <p className="mt-1.5 text-[12.5px] leading-6 text-ink-mute">{item.text}</p>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export function FaqBlock({ variant, eyebrow, title, text, items }: FaqBlockData) {
    const panel = variant === 'panel';

    return (
        <section className="grid gap-4">
            <SectionIntro eyebrow={eyebrow} title={title} text={text} />
            <div className={panel ? 'faq-list surface-card' : 'grid gap-2'}>
                {items.map((item, index) => (
                    <details
                        key={`${item.question}-${index}`}
                        className={`faq-item ${panel ? '' : 'surface-card'}`}
                    >
                        <summary className="faq-question">
                            <span>{item.question}</span>
                            <ChevronDown
                                className="faq-chevron size-4 shrink-0 text-ink-mute"
                                strokeWidth={1.8}
                                aria-hidden="true"
                            />
                        </summary>
                        <p className="faq-answer">{item.answer}</p>
                    </details>
                ))}
            </div>
        </section>
    );
}

export function TimelineBlock({ eyebrow, title, text, items }: TimelineBlockData) {
    return (
        <section className="grid gap-4">
            <SectionIntro eyebrow={eyebrow} title={title} text={text} />
            <ol className="timeline-list">
                {items.map((item, index) => (
                    <li key={`${item.date}-${index}`} className="timeline-item">
                        <span className="timeline-dot" aria-hidden="true" />
                        <div className="min-w-0">
                            {item.date ? <p className="timeline-date">{item.date}</p> : null}
                            {item.title ? (
                                <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                            ) : null}
                            {item.text ? (
                                <p className="mt-1 text-[12.5px] leading-6 text-ink-mute">{item.text}</p>
                            ) : null}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}

export function GalleryBlock({ variant, title, text, images }: GalleryBlockData) {
    const [index, setIndex] = useState<number | null>(null);
    const lightboxImages: LightboxImage[] = images.map((src, position) => ({
        src,
        alt: title ? `${title} ${position + 1}` : `图片 ${position + 1}`,
        caption: title,
    }));

    return (
        <section className="grid gap-4">
            <SectionIntro title={title} text={text} />
            <div className={`grid gap-2 ${GRID_COLUMNS[variant ?? 'three'] ?? GRID_COLUMNS.three}`}>
                {images.map((src, position) => (
                    <button
                        key={`${src}-${position}`}
                        type="button"
                        className="gallery-item"
                        onClick={() => setIndex(position)}
                        aria-label={`查看图片 ${position + 1}`}
                    >
                        <img
                            src={src}
                            alt={title ? `${title} ${position + 1}` : `图片 ${position + 1}`}
                            loading="lazy"
                            decoding="async"
                        />
                    </button>
                ))}
            </div>
            <ImageLightbox
                images={lightboxImages}
                index={index}
                onClose={() => setIndex(null)}
                onIndexChange={setIndex}
            />
        </section>
    );
}

export function TableBlock({ title, text, head, rows }: TableBlockData) {
    const hasHead = head.some((cell) => cell !== '');

    return (
        <section className="grid gap-4">
            <SectionIntro title={title} text={text} />
            <div className="surface-card overflow-x-auto">
                <table className="content-table w-full min-w-[520px] border-collapse text-left">
                    {hasHead ? (
                        <thead>
                            <tr>
                                {head.map((cell, index) => (
                                    <th key={index}>{cell}</th>
                                ))}
                            </tr>
                        </thead>
                    ) : null}
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex}>{cell}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export function AuthorCardBlock({ name, role, bio, avatar, links }: AuthorCardData) {
    return (
        <section className="author-card surface-card">
            <img className="author-avatar" src={avatar} alt="" loading="lazy" decoding="async" />
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[16px] font-semibold text-ink">{name}</p>
                    {role ? <span className="chip">{role}</span> : null}
                </div>
                {bio ? <p className="mt-2 text-[12.5px] leading-6 text-ink-mute">{bio}</p> : null}
                {links.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {links.map((link) => (
                            <a key={link.url + link.label} className="author-link" href={link.url}>
                                {link.label}
                                <ArrowUpRight className="size-3" strokeWidth={1.8} aria-hidden="true" />
                            </a>
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export function SubscribeBlock({ eyebrow, title, text, actions }: SubscribeBlockData) {
    if (actions.length === 0) {
        return null;
    }

    return (
        <section className="subscribe-block surface-card">
            <span className="subscribe-icon" aria-hidden="true">
                <Mail className="size-5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
                {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
                <p className="mt-1 text-[17px] font-semibold text-ink">{title}</p>
                {text ? <p className="mt-1.5 text-[12.5px] leading-6 text-ink-mute">{text}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                    <Button
                        key={action.url + action.label}
                        asChild
                        variant={action.style === 'primary' ? 'default' : 'outline'}
                        className="shrink-0"
                    >
                        <a href={action.url}>
                            {action.label}
                            <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        </a>
                    </Button>
                ))}
            </div>
        </section>
    );
}
