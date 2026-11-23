import type { KeyboardEvent, ReactNode } from 'react';

export interface TabsNavItem {
    id: string;
    label: string;
    icon?: ReactNode;
    count?: number;
    href?: string;
}

interface Props {
    items: TabsNavItem[];
    active: string;
    ariaLabel: string;
    className: string;
    variant: 'link' | 'nav' | 'tab';
    idPrefix?: string;
    panelId?: string;
    trailing?: ReactNode;
    onChange?: (id: string) => void;
}

export default function TabsNav({
    items,
    active,
    ariaLabel,
    className,
    variant,
    idPrefix = 'ttdf-tabs',
    panelId,
    trailing,
    onChange,
}: Props) {
    if (variant === 'link') {
        return (
            <nav className={className} aria-label={ariaLabel}>
                {items.map((item) => (
                    <a
                        key={item.id}
                        href={item.href ?? '#'}
                        className={active === item.id ? 'is-active' : ''}
                        aria-current={active === item.id ? 'page' : undefined}
                    >
                        {item.icon}
                        {item.label}
                        {typeof item.count === 'number' ? <span>{item.count}</span> : null}
                    </a>
                ))}
                {trailing}
            </nav>
        );
    }

    if (variant === 'nav') {
        return (
            <nav className={className} aria-label={ariaLabel}>
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={active === item.id ? 'is-active' : ''}
                        aria-current={active === item.id ? 'page' : undefined}
                        onClick={() => onChange?.(item.id)}
                    >
                        {item.icon}
                        {item.label}
                        {typeof item.count === 'number' ? <span>{item.count}</span> : null}
                    </button>
                ))}
                {trailing}
            </nav>
        );
    }

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            return;
        }

        const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
        );
        if (buttons.length === 0) {
            return;
        }

        const current = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
            'button[role="tab"]'
        );
        const index = current ? buttons.indexOf(current) : -1;
        let next = index;

        if (event.key === 'Home') {
            next = 0;
        } else if (event.key === 'End') {
            next = buttons.length - 1;
        } else if (event.key === 'ArrowLeft') {
            next = index <= 0 ? buttons.length - 1 : index - 1;
        } else if (event.key === 'ArrowRight') {
            next = index >= buttons.length - 1 ? 0 : index + 1;
        }

        event.preventDefault();
        buttons[next]?.focus();
        const id = items[next]?.id;
        if (id) {
            onChange?.(id);
        }
    };

    const hasActive = items.some((item) => item.id === active);

    return (
        <div className={className} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
            {items.map((item, index) => (
                <button
                    key={item.id}
                    id={`${idPrefix}-tab-${item.id}`}
                    type="button"
                    role="tab"
                    aria-selected={active === item.id}
                    aria-controls={panelId}
                    tabIndex={active === item.id || (!hasActive && index === 0) ? 0 : -1}
                    className={active === item.id ? 'is-active' : ''}
                    onClick={() => onChange?.(item.id)}
                >
                    {item.icon}
                    {item.label}
                    {typeof item.count === 'number' ? <span>{item.count}</span> : null}
                </button>
            ))}
            {trailing}
        </div>
    );
}
