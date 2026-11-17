import { ArrowUpRight } from 'lucide-react';
import SectionHeading from '../content/SectionHeading';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import type { CategoryItem } from '../../types';

interface Props {
    variant?: string;
    title: string;
    items: CategoryItem[];
}

export default function CategoriesBlock({ variant, title, items }: Props) {
    if (items.length === 0) {
        return null;
    }

    if (variant === 'chips') {
        return (
            <section className="grid gap-3">
                <SectionHeading title={title} count={items.length} suffix="个" />
                <ul className="flex flex-wrap gap-[5px]">
                    {items.map((item) => (
                        <li key={item.url + item.label}>
                            <Badge
                                asChild
                                variant="secondary"
                                className="rounded-[4px] border-0 bg-[rgba(136,136,136,0.1)] px-2 py-1 text-[12px] font-normal text-ink-soft hover:bg-brand-soft hover:text-brand"
                            >
                                <a href={item.url}>
                                    {item.label}
                                    <span className="text-[11px] text-ink-faint">{item.count}</span>
                                </a>
                            </Badge>
                        </li>
                    ))}
                </ul>
            </section>
        );
    }

    return (
        <section className="grid gap-4">
            <SectionHeading title={title} count={items.length} suffix="个" />
            <ul className="grid gap-[15px] sm:grid-cols-2 lg:grid-cols-4">
                {items.map((item) => (
                    <li key={item.url + item.label}>
                        <Card className="surface-card group gap-0 p-0">
                            <a
                                className="flex items-center gap-3 p-[15px]"
                                href={item.url}
                            >
                                <span
                                    className="grid size-10 shrink-0 place-items-center rounded-[4px] bg-brand-soft text-[14px] font-medium text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast"
                                    aria-hidden="true"
                                >
                                    {item.label.slice(0, 1)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-medium text-ink transition-colors group-hover:text-brand">
                                        {item.label}
                                    </span>
                                    <span className="mt-0.5 block text-[11px] text-ink-faint">
                                        {item.count} 篇文章
                                    </span>
                                </span>
                                <ArrowUpRight
                                    className="size-3.5 text-ink-faint transition-colors group-hover:text-brand"
                                    strokeWidth={1.6}
                                    aria-hidden="true"
                                />
                            </a>
                        </Card>
                    </li>
                ))}
            </ul>
        </section>
    );
}
