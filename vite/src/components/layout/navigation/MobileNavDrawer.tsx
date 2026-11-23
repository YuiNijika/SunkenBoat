import { useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '../../ui/button';
import type { NavItem, SiteInfo } from '../../../types';
import NavIcon from './NavIcon';

interface Props {
    site: SiteInfo;
    title: string;
    drawerRef: RefObject<HTMLDivElement | null>;
    onClose: () => void;
}

function itemKey(item: NavItem): string {
    return item.url + item.label;
}

function initiallyExpanded(items: NavItem[]): Set<string> {
    return new Set(
        items
            .filter(
                (item) =>
                    item.active === true ||
                    item.children?.some((child) => child.active === true)
            )
            .map(itemKey)
    );
}

export default function MobileNavDrawer({ site, title, drawerRef, onClose }: Props) {
    const [expanded, setExpanded] = useState(() => initiallyExpanded(site.nav));

    const toggle = (key: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    if (typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <div
            ref={drawerRef}
            className="mobile-drawer lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="移动导航"
        >
            <button
                type="button"
                className="mobile-drawer-backdrop"
                aria-label="关闭导航菜单"
                onClick={onClose}
            />
            <nav id="ttdf-mobile-nav" className="mobile-drawer-panel" aria-label="移动导航">
                <div className="mobile-drawer-head">
                    <div className="min-w-0">
                        <p className="section-label">Navigation</p>
                        <p className="mt-1 truncate text-[16px] font-medium text-ink">{title}</p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-[6px] text-ink-mute"
                        aria-label="关闭导航菜单"
                        onClick={onClose}
                    >
                        <X strokeWidth={1.8} aria-hidden="true" />
                    </Button>
                </div>
                <ul className="mobile-drawer-list">
                    {site.nav.map((item, index) => {
                        const key = itemKey(item);
                        const hasChildren = Boolean(item.children?.length);
                        const isExpanded = expanded.has(key);
                        const submenuId = `ttdf-mobile-submenu-${index}`;

                        return (
                            <li key={key}>
                                <div className={hasChildren ? 'mobile-drawer-row' : undefined}>
                                    <a
                                        className={
                                            'mobile-drawer-link ' +
                                            (item.active ? 'is-active' : '')
                                        }
                                        href={item.url}
                                        aria-current={item.active ? 'page' : undefined}
                                        onClick={onClose}
                                    >
                                        <NavIcon name={item.icon} className="size-4" />
                                        <span>{item.label}</span>
                                    </a>
                                    {hasChildren ? (
                                        <button
                                            type="button"
                                            className="mobile-drawer-toggle"
                                            aria-label={
                                                isExpanded
                                                    ? `收起${item.label}子菜单`
                                                    : `展开${item.label}子菜单`
                                            }
                                            aria-expanded={isExpanded}
                                            aria-controls={submenuId}
                                            onClick={() => toggle(key)}
                                        >
                                            <ChevronDown
                                                className="size-4"
                                                strokeWidth={1.8}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    ) : null}
                                </div>
                                {hasChildren ? (
                                    <ul
                                        id={submenuId}
                                        className="mobile-drawer-children"
                                        hidden={!isExpanded}
                                    >
                                        {item.children?.map((child) => (
                                            <li key={child.url + child.label}>
                                                <a
                                                    className={
                                                        'mobile-drawer-child ' +
                                                        (child.active ? 'is-active' : '')
                                                    }
                                                    href={child.url}
                                                    aria-current={
                                                        child.active ? 'page' : undefined
                                                    }
                                                    onClick={onClose}
                                                >
                                                    <NavIcon
                                                        name={child.icon}
                                                        className="size-3.5"
                                                    />
                                                    {child.label}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
                <div className="mobile-drawer-foot">
                    <a className="mobile-drawer-home" href={site.url}>
                        返回首页
                    </a>
                    {site.subtitle ? (
                        <p className="mt-2 text-[11px] leading-5 text-ink-faint">
                            {site.subtitle}
                        </p>
                    ) : null}
                </div>
            </nav>
        </div>,
        document.body
    );
}
