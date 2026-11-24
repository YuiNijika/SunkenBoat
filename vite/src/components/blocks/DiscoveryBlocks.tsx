import {
    ArrowRight,
    ArrowUpRight,
    BookOpen,
    Code2,
    Compass,
    Download,
    ExternalLink,
    Layers,
    MessageCircle,
    Search,
    ShieldCheck,
    Sparkles,
    Star,
    Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
    BentoGridBlock as BentoGridData,
    LinkDirectoryBlock as LinkDirectoryData,
    QuickLinksBlock as QuickLinksData,
    TopicGridBlock as TopicGridData,
} from '../../types';

const ICONS = {
    compass: Compass,
    book: BookOpen,
    search: Search,
    code: Code2,
    download: Download,
    users: Users,
    message: MessageCircle,
    star: Star,
    shield: ShieldCheck,
    sparkles: Sparkles,
    layers: Layers,
    external: ExternalLink,
};

function iconFor(name: string) {
    return ICONS[name as keyof typeof ICONS] ?? Compass;
}

function BlockIntro({ title, text }: { title: string; text: string }) {
    if (title === '' && text === '') {
        return null;
    }

    return (
        <div className="discovery-block-intro">
            {title !== '' ? <h2>{title}</h2> : null}
            {text !== '' ? <p>{text}</p> : null}
        </div>
    );
}

export function QuickLinksBlock({ variant, title, text, items }: QuickLinksData) {
    if (items.length === 0) {
        return null;
    }

    const mode = variant === 'strip' ? 'strip' : 'cards';

    return (
        <section className="quick-links-block">
            <BlockIntro title={title} text={text} />
            <ul className={`quick-links is-${mode}`}>
                {items.map((item, index) => {
                    const Icon = iconFor(item.icon);

                    return (
                        <li key={`${item.title}-${index}`}>
                            <a href={item.url} className="quick-link surface-card">
                                <span className="quick-link-icon" aria-hidden="true">
                                    <Icon strokeWidth={1.8} />
                                </span>
                                <span className="quick-link-copy">
                                    <span className="quick-link-heading">
                                        <span className="quick-link-title">{item.title}</span>
                                        {item.badge !== '' ? (
                                            <span className="quick-link-badge">{item.badge}</span>
                                        ) : null}
                                    </span>
                                    {item.text !== '' ? (
                                        <span className="quick-link-text">{item.text}</span>
                                    ) : null}
                                </span>
                                <ArrowRight
                                    className="quick-link-arrow"
                                    strokeWidth={1.7}
                                    aria-hidden="true"
                                />
                            </a>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

export function BentoGridBlock({ variant, title, text, items }: BentoGridData) {
    if (items.length === 0) {
        return null;
    }

    const mode = variant === 'mosaic' ? 'mosaic' : 'spotlight';

    return (
        <section className="bento-block">
            <BlockIntro title={title} text={text} />
            <div className={`bento-grid is-${mode}`}>
                {items.map((item, index) => {
                    const body = (
                        <>
                            {item.image !== '' ? (
                                <img
                                    className="bento-card-image"
                                    src={item.image}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                />
                            ) : null}
                            <span className="bento-card-shade" aria-hidden="true" />
                            <span className="bento-card-content">
                                {item.badge !== '' ? (
                                    <span className="bento-card-badge">{item.badge}</span>
                                ) : null}
                                <span className="bento-card-title">
                                    {item.title || `精选内容 ${index + 1}`}
                                </span>
                                {item.text !== '' ? (
                                    <span className="bento-card-text">{item.text}</span>
                                ) : null}
                                <span className="bento-card-action">
                                    查看详情
                                    <ArrowUpRight
                                        className="size-3.5"
                                        strokeWidth={1.8}
                                        aria-hidden="true"
                                    />
                                </span>
                            </span>
                        </>
                    );
                    const className = `bento-card is-${item.size || 'auto'}`;

                    return item.url !== '' ? (
                        <a key={`${item.title}-${index}`} className={className} href={item.url}>
                            {body}
                        </a>
                    ) : (
                        <div key={`${item.title}-${index}`} className={className}>
                            {body}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export function TopicGridBlock({ variant, title, text, columns, items }: TopicGridData) {
    if (items.length === 0) {
        return null;
    }

    const mode = variant === 'spotlight' ? 'spotlight' : 'grid';
    const style = {
        '--topic-cols': Math.max(1, Math.min(3, columns)),
    } as CSSProperties;

    return (
        <section className="topic-grid-block">
            <BlockIntro title={title} text={text} />
            <div className={`topic-grid is-${mode}`} style={style}>
                {items.map((item, index) => (
                    <article key={`${item.label}-${index}`} className="topic-card surface-card">
                        <a className="topic-card-media" href={item.url}>
                            {item.image !== '' ? (
                                <img src={item.image} alt="" loading="lazy" decoding="async" />
                            ) : (
                                <span className="topic-card-fallback" aria-hidden="true">
                                    {item.label.slice(0, 1)}
                                </span>
                            )}
                            <span className="topic-card-shade" aria-hidden="true" />
                            <span className="topic-card-label">
                                {item.badge !== '' ? <em>{item.badge}</em> : null}
                                <strong>{item.label}</strong>
                            </span>
                        </a>
                        <div className="topic-card-body">
                            {item.text !== '' ? <p className="topic-card-text">{item.text}</p> : null}
                            {item.posts.length > 0 ? (
                                <ol className="topic-card-posts">
                                    {item.posts.map((post) => (
                                        <li key={post.url}>
                                            <a href={post.url}>{post.title}</a>
                                            {post.date !== '' ? <time>{post.date}</time> : null}
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="topic-card-empty">浏览这个合集里的全部内容。</p>
                            )}
                            <a className="topic-card-more" href={item.url}>
                                <span>
                                    {item.count > 0 ? `${item.count} 篇文章` : '进入合集'}
                                </span>
                                <ArrowRight className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                            </a>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

export function LinkDirectoryBlock({
    variant,
    title,
    text,
    searchLabel,
    columns,
    items,
}: LinkDirectoryData) {
    const [query, setQuery] = useState('');
    const mode = variant === 'compact' ? 'compact' : 'grid';
    const style = {
        '--directory-cols': Math.max(1, Math.min(3, columns)),
    } as CSSProperties;
    const groups = useMemo(() => {
        const needle = query.trim().toLocaleLowerCase();
        const filtered = needle === ''
            ? items
            : items.filter((item) =>
                [item.group, item.label, item.description, item.badge]
                    .some((value) => value.toLocaleLowerCase().includes(needle))
            );
        const grouped = new Map<string, typeof items>();

        for (const item of filtered) {
            const group = item.group || '全部链接';
            grouped.set(group, [...(grouped.get(group) ?? []), item]);
        }

        return [...grouped.entries()];
    }, [items, query]);

    if (items.length === 0) {
        return null;
    }

    return (
        <section className="link-directory-block">
            <div className="link-directory-head">
                <BlockIntro title={title} text={text} />
                {items.length > 5 ? (
                    <label className="link-directory-search">
                        <Search className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        <input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={searchLabel || '搜索链接、分组或说明'}
                            aria-label={searchLabel || '搜索链接目录'}
                        />
                    </label>
                ) : null}
            </div>
            {groups.length === 0 ? (
                <p className="link-directory-empty">没有找到匹配的链接。</p>
            ) : (
                <div className="link-directory-groups">
                    {groups.map(([group, groupItems]) => (
                        <section key={group} className="link-directory-group">
                            <p className="section-label">{group}</p>
                            <ul className={`link-directory-list is-${mode}`} style={style}>
                                {groupItems.map((item, index) => {
                                    const Icon = iconFor(item.icon);

                                    return (
                                        <li key={`${item.url}-${index}`}>
                                            <a href={item.url} className="link-directory-item surface-card">
                                                <span className="link-directory-icon" aria-hidden="true">
                                                    <Icon strokeWidth={1.75} />
                                                </span>
                                                <span className="link-directory-copy">
                                                    <span className="link-directory-title">
                                                        {item.label}
                                                    </span>
                                                    {item.description !== '' ? (
                                                        <span className="link-directory-description">
                                                            {item.description}
                                                        </span>
                                                    ) : null}
                                                </span>
                                                {item.badge !== '' ? (
                                                    <span className="link-directory-badge">
                                                        {item.badge}
                                                    </span>
                                                ) : null}
                                                <ArrowUpRight
                                                    className="link-directory-arrow"
                                                    strokeWidth={1.7}
                                                    aria-hidden="true"
                                                />
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            )}
        </section>
    );
}
