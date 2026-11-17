import { ArrowLeft, ArrowRight, Rss, Search } from 'lucide-react';
import { Form } from 'react-router-dom';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import type { LinkItem, PostCategory } from '../../types';

interface TagsProps {
    title: string;
    items: PostCategory[];
}

export function TagsBlock({ title, items }: TagsProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <Card className="surface-card gap-0 p-5">
            {title ? (
                <p className="text-[15px] font-medium text-ink">{title}</p>
            ) : null}
            <ul className="mt-3 flex flex-wrap gap-[5px]">
                {items.map((item) => (
                    <li key={item.url + item.label}>
                        <Badge
                            asChild
                            variant="secondary"
                            className="rounded-[4px] border-0 bg-[rgba(136,136,136,0.1)] px-[5px] py-[2px] text-[11px] font-normal leading-[1.44] text-ink-mute hover:bg-brand-soft hover:text-brand"
                        >
                            <a href={item.url}>#{item.label}</a>
                        </Badge>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

interface PostNavProps {
    previousHtml: string;
    nextHtml: string;
}

export function PostNavBlock({ previousHtml, nextHtml }: PostNavProps) {
    if (!previousHtml && !nextHtml) {
        return null;
    }

    const cells = [
        { key: 'prev', label: '上一篇', html: previousHtml, icon: <ArrowLeft className="size-3.5" strokeWidth={1.8} /> },
        { key: 'next', label: '下一篇', html: nextHtml, icon: <ArrowRight className="size-3.5" strokeWidth={1.8} /> },
    ].filter((cell) => cell.html !== '');

    return (
        <nav className="grid gap-3 sm:grid-cols-2" aria-label="相邻文章">
            {cells.map((cell) => (
                <Card key={cell.key} className="surface-card gap-0 p-5">
                    <p className="flex items-center gap-1.5 text-[12px] text-ink-faint">
                        {cell.icon}
                        {cell.label}
                    </p>
                    <div
                        className="post-nav-link mt-2 text-[14px] font-medium"
                        dangerouslySetInnerHTML={{ __html: cell.html }}
                    />
                </Card>
            ))}
        </nav>
    );
}

interface NotFoundProps {
    title: string;
    text: string;
    action: { label: string; url: string };
}

export function NotFoundBlock({ title, text, action }: NotFoundProps) {
    return (
        <Card className="surface-card relative gap-0 overflow-hidden px-5 py-14 text-center sm:py-20">
            <span
                className="pointer-events-none absolute inset-x-0 top-1/2 -z-0 -translate-y-1/2 font-mono text-[10rem] leading-none font-bold tracking-[-0.08em] text-brand/[0.045]"
                aria-hidden="true"
            >
                404
            </span>
            <div className="relative">
                <p className="font-mono text-[2.5rem] leading-none font-semibold text-brand/30" aria-hidden="true">
                    404
                </p>
                <h1 className="mt-5 text-[22px] font-medium text-ink sm:text-[24px]">{title}</h1>
                <p className="mx-auto mt-3 max-w-md text-[14px] leading-[1.7] text-ink-mute">{text}</p>
                {action.label !== '' && action.url !== '' ? (
                    <Button asChild className="mt-7">
                        <a href={action.url}>
                            {action.label}
                            <ArrowRight className="size-4" strokeWidth={1.8} />
                        </a>
                    </Button>
                ) : null}
            </div>
        </Card>
    );
}

interface SearchProps {
    variant?: string;
    title: string;
    action: string;
    placeholder: string;
    buttonLabel: string;
}

export function SearchBlock({ variant, title, action, placeholder, buttonLabel }: SearchProps) {
    const form = (
        <Form className="flex max-w-xl items-center gap-2" method="get" action={action} role="search">
            <label className="sr-only" htmlFor="ttdf-search-block">
                {title || '搜索站内文章'}
            </label>
            <div className="relative flex-1">
                <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-mute"
                    strokeWidth={1.8}
                    aria-hidden="true"
                />
                <Input
                    className="h-10 pl-9"
                    id="ttdf-search-block"
                    type="search"
                    name="s"
                    placeholder={placeholder}
                    autoComplete="off"
                />
            </div>
            <Button type="submit" className="h-10 shrink-0">
                {buttonLabel}
            </Button>
        </Form>
    );

    if (variant === 'panel') {
        return (
            <Card className="surface-card gap-0 p-5">
                {title ? <p className="section-label mb-3">{title}</p> : null}
                {form}
            </Card>
        );
    }

    return (
        <section className="grid gap-3">
            {title ? <p className="section-label">{title}</p> : null}
            {form}
        </section>
    );
}

interface CtaProps {
    eyebrow: string;
    title: string;
    text: string;
    action: { label: string; url: string };
}

export function CtaBlock({ eyebrow, title, text, action }: CtaProps) {
    if (action.url === '') {
        return null;
    }

    return (
        <Card className="surface-card flex flex-row flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-center gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[7px] bg-brand-soft text-brand">
                    <Rss className="size-4" strokeWidth={1.8} aria-hidden="true" />
                </span>
                <div className="min-w-0 max-w-xl">
                    {eyebrow ? <p className="text-[0.68rem] font-medium text-brand">{eyebrow}</p> : null}
                    <p className="text-[0.95rem] font-semibold text-ink">{title}</p>
                    {text ? <p className="mt-1 text-[0.8rem] leading-6 text-ink-soft">{text}</p> : null}
                </div>
            </div>
            <Button asChild variant="outline" className="shrink-0 bg-surface">
                <a href={action.url}>{action.label}</a>
            </Button>
        </Card>
    );
}

interface LinkListProps {
    title?: string;
    items: LinkItem[];
}

export function LinkListBlock({ title, items }: LinkListProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <Card className="surface-card gap-0 p-5">
            {title ? <p className="section-label">{title}</p> : null}
            <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
                {items.map((item) => (
                    <li key={item.url + item.label}>
                        <a
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line/70 py-3 text-[0.85rem] transition-colors last:border-b-0 hover:text-brand"
                            href={item.url}
                        >
                            <span className="font-medium text-ink-soft">{item.label}</span>
                            {item.description ? (
                                <span className="text-xs text-ink-mute">{item.description}</span>
                            ) : null}
                        </a>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

interface VariantProps {
    variant?: string;
}

export function DividerBlock({ variant }: VariantProps) {
    return <hr className={variant === 'dashed' ? 'border-dashed border-line' : 'border-line'} />;
}

const SPACERS: Record<string, string> = {
    sm: 'h-1',
    md: 'h-4',
    lg: 'h-10',
};

export function SpacerBlock({ variant }: VariantProps) {
    return <div className={SPACERS[variant ?? 'md'] ?? SPACERS.md} aria-hidden="true" />;
}
