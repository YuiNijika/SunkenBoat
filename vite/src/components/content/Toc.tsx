import { useEffect, useState } from 'react';

export interface TocItem {
    id: string;
    label: string;
    level: number;
}

interface Props {
    items: TocItem[];
    title: string;
}

export default function Toc({ items, title }: Props) {
    const [activeId, setActiveId] = useState(items[0]?.id ?? '');

    useEffect(() => {
        if (items.length === 0) {
            return;
        }

        const onScroll = () => {
            let current = items[0].id;
            for (const item of items) {
                const element = document.getElementById(item.id);
                if (element && element.getBoundingClientRect().top <= 120) {
                    current = item.id;
                }
            }
            setActiveId(current);
        };

        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [items]);

    if (items.length === 0) {
        return null;
    }

    return (
        <ul className="grid gap-0.5 text-sm">
            {title ? <li className="section-label pb-1.5">{title}</li> : null}
            {items.map((item) => (
                <li key={item.id}>
                    <a
                        className={
                            'block rounded-ctl py-1 leading-6 transition-colors ' +
                            (item.level > 2 ? 'pl-5 text-[0.82rem]' : 'pl-2.5') +
                            ' ' +
                            (activeId === item.id
                                ? 'bg-brand-soft font-medium text-brand'
                                : 'text-ink-mute hover:bg-surface-2 hover:text-ink-soft')
                        }
                        href={`#${item.id}`}
                    >
                        {item.label}
                    </a>
                </li>
            ))}
        </ul>
    );
}
