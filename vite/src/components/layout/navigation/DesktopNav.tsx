import { ChevronDown } from 'lucide-react';
import type { NavItem } from '../../../types';
import NavIcon from './NavIcon';

function navClass(item: NavItem): string {
    return (
        'relative inline-flex h-[50px] items-center rounded-[4px] px-2.5 text-[15px] font-normal transition-colors ' +
        (item.active
            ? 'text-brand before:absolute before:inset-x-0 before:top-0 before:h-[5px] before:rounded-b-[15px] before:bg-brand before:opacity-100'
            : 'text-ink-soft hover:text-brand hover:before:absolute hover:before:inset-x-0 hover:before:top-0 hover:before:h-[5px] hover:before:rounded-b-[15px] hover:before:bg-brand hover:before:opacity-100')
    );
}

export default function DesktopNav({ items }: { items: NavItem[] }) {
    return (
        <nav className="hidden h-[52px] flex-1 items-stretch lg:flex" aria-label="主导航">
            <ul className="ml-5 flex h-full items-stretch">
                {items.map((item) => (
                    <li key={item.url + item.label} className="group/nav relative flex">
                        <a
                            className={navClass(item)}
                            href={item.url}
                            aria-current={item.active ? 'page' : undefined}
                            aria-haspopup={item.children?.length ? 'true' : undefined}
                        >
                            <NavIcon name={item.icon} />
                            {item.label}
                            {item.children?.length ? (
                                <ChevronDown
                                    className="ml-1 size-3.5 transition-transform group-hover/nav:rotate-180"
                                    strokeWidth={1.8}
                                    aria-hidden="true"
                                />
                            ) : null}
                        </a>
                        {item.children?.length ? (
                            <ul className="invisible absolute top-full left-0 z-50 min-w-[180px] translate-y-1 rounded-[6px] border border-line bg-surface p-1.5 opacity-0 shadow-pop transition-all group-hover/nav:visible group-hover/nav:translate-y-0 group-hover/nav:opacity-100 group-focus-within/nav:visible group-focus-within/nav:translate-y-0 group-focus-within/nav:opacity-100">
                                {item.children.map((child) => (
                                    <li key={child.url + child.label}>
                                        <a
                                            className={
                                                'block rounded-[4px] px-3 py-2 text-[13px] transition-colors ' +
                                                (child.active
                                                    ? 'bg-brand-soft text-brand'
                                                    : 'text-ink-soft hover:bg-surface-2 hover:text-brand')
                                            }
                                            href={child.url}
                                            aria-current={child.active ? 'page' : undefined}
                                        >
                                            <NavIcon name={child.icon} />
                                            {child.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </li>
                ))}
            </ul>
        </nav>
    );
}
