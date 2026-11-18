import { ArrowUpRight } from 'lucide-react';
import SectionHeading from '../content/SectionHeading';
import { Badge } from '../ui/badge';
import { Card } from '../ui/card';
import type { CategoryItem } from '../../types';

const GRID_COLUMNS: Record<number, string> = {
    2: 'sm:grid-cols-2 lg:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
};

interface Props {
    variant?: string;
    title: string;
    items: CategoryItem[];
    limit?: number;
    columns?: number;
}

export default function CategoriesBlock({ variant, title, items, limit = 0, columns = 0 }: Props) {
    const visible = limit > 0 ? items.slice(0, limit) : items;

    if (visible.length === 0) {
        return null;
    }

    if (variant === 'chips') {
        return (
            <section className="grid gap-3">
                <SectionHeading title={title} count={visible.length} suffix="个" />
                <ul className="flex flex-wrap gap-[5px]">
                    {visible.map((item) => (
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
            <SectionHeading title={title} count={visible.length} suffix="个" />
            <ul
                className={'grid gap-[15px] ' + (GRID_COLUMNS[columns] ?? GRID_COLUMNS[4])}
            >
                {visible.map((item) => (
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
