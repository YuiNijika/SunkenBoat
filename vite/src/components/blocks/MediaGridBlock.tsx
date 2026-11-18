import { ArrowUpRight } from 'lucide-react';
import SectionHeading from '../content/SectionHeading';
import type { CSSProperties } from 'react';
import type { MediaGridItem } from '../../types';

interface Props {
    variant?: string;
    title: string;
    text: string;
    columns: number;
    items: MediaGridItem[];
}

export default function MediaGridBlock({ variant, title, text, columns, items }: Props) {
    if (items.length === 0) {
        return null;
    }

    const style = { '--tile-cols': Math.max(2, Math.min(6, columns)) } as CSSProperties;

    return (
        <section className="grid gap-[15px]">
            <SectionHeading title={title} description={text} count={items.length} suffix="个" />
            <ul
                className={'media-grid' + (variant === 'card' ? ' is-card' : '')}
                style={style}
            >
                {items.map((item) => (
                    <li key={item.url + item.title}>
                        <a className="media-tile group" href={item.url}>
                            {item.image ? (
                                <img src={item.image} alt="" loading="lazy" decoding="async" />
                            ) : (
                                <span className="media-tile-fallback" aria-hidden="true">
                                    {item.title.slice(0, 1)}
                                </span>
                            )}
                            <span className="media-tile-body">
                                <span className="media-tile-title">{item.title}</span>
                                {item.text ? (
                                    <span className="media-tile-text">{item.text}</span>
                                ) : null}
                            </span>
                            <ArrowUpRight className="media-tile-arrow" aria-hidden="true" />
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
}
