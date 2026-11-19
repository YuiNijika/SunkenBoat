import { Home } from 'lucide-react';
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '../ui/breadcrumb';
import type { BreadcrumbItem as CrumbItem } from '../../types';

export default function BreadcrumbsBlock({ items }: { items: CrumbItem[] }) {
    const visible = items.filter((item) => item.label.trim() !== '');
    if (visible.length === 0) {
        return null;
    }

    return (
        <nav
            className="surface-card breadcrumbs-block px-4 py-2.5"
            aria-label="面包屑导航"
        >
            <Breadcrumb>
                <BreadcrumbList className="gap-1.5 text-[12px] text-ink-faint sm:gap-2">
                    {visible.map((item, index) => {
                        const current = index === visible.length - 1;
                        return (
                            <BreadcrumbItem key={`${item.label}-${index}`} className="gap-1.5">
                                {index === 0 ? (
                                    <Home className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                                ) : null}
                                {current || !item.url ? (
                                    <BreadcrumbPage className="max-w-[18rem] truncate text-ink-mute">
                                        {item.label}
                                    </BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink
                                        href={item.url}
                                        className="max-w-[12rem] truncate hover:text-brand"
                                    >
                                        {item.label}
                                    </BreadcrumbLink>
                                )}
                                {!current ? (
                                    <BreadcrumbSeparator className="text-ink-faint/70 [&>svg]:size-3" />
                                ) : null}
                            </BreadcrumbItem>
                        );
                    })}
                </BreadcrumbList>
            </Breadcrumb>
        </nav>
    );
}
