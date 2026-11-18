import { Rss } from 'lucide-react';
import { Separator } from '../ui/separator';
import type { FooterModule, SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    widgets: WidgetsData;
    layout: 'columns' | 'compact' | 'centered';
    modules: FooterModule[];
    showCategories: boolean;
    showTags: boolean;
}

function Brand({ site, title }: { site: SiteInfo; title?: string }) {
    const label = title && title !== '' ? title : site.title || 'SunkenBoat';

    return (
        <a className="inline-flex items-center gap-2.5" href={site.url}>
            {site.logo ? (
                <img
                    className="size-9 rounded-[4px] object-cover"
                    src={site.logo}
                    alt=""
                    width={36}
                    height={36}
                />
            ) : (
                <span className="grid size-9 place-items-center rounded-[4px] bg-brand text-[15px] font-medium text-brand-contrast">
                    {label.slice(0, 1)}
                </span>
            )}
            <span className="text-[15px] font-medium text-footer-ink">{label}</span>
        </a>
    );
}

function NavList({ site, centered = false }: { site: SiteInfo; centered?: boolean }) {
    return (
        <ul className={centered ? 'footer-nav footer-nav-centered' : 'footer-nav'}>
            {site.nav.map((item) => (
                <li key={item.url + item.label}>
                    <a href={item.url}>{item.label}</a>
                </li>
            ))}
        </ul>
    );
}

function FeedLink({ site }: { site: SiteInfo }) {
    if (!site.feedUrl) {
        return null;
    }

    return (
        <a className="footer-feed" href={site.feedUrl}>
            <Rss className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
            RSS 订阅
        </a>
    );
}

function ModuleTitle({ children }: { children: string }) {
    return <p className="footer-module-title">{children}</p>;
}

export default function SiteFooter({
    site,
    widgets,
    layout,
    modules,
    showCategories,
    showTags,
}: Props) {
    const note = site.footerText !== '' ? site.footerText : site.description;
    const categories = showCategories ? widgets.categories : [];
    const tags = showTags ? widgets.tags : [];
    const hasMeta = modules.some((module) => module.name === 'meta');
    const bodyModules = modules.filter((module) => module.name !== 'meta');

    const renderModule = (module: FooterModule, index: number) => {
        const title = (module.data?.title ?? '').trim();
        const text = (module.data?.text ?? '').trim();

        switch (module.name) {
            case 'brand':
                return (
                    <div key={`brand-${index}`} className="footer-module footer-brand">
                        <Brand site={site} title={title} />
                        {text !== '' || note !== '' ? (
                            <p className="footer-note">{text !== '' ? text : note}</p>
                        ) : null}
                        <FeedLink site={site} />
                    </div>
                );

            case 'nav':
                return (
                    <nav key={`nav-${index}`} className="footer-module" aria-label="页脚导航">
                        <ModuleTitle>{title !== '' ? title : '站内导航'}</ModuleTitle>
                        <NavList site={site} />
                    </nav>
                );

            case 'categories':
                if (categories.length === 0) {
                    return null;
                }

                return (
                    <nav key={`categories-${index}`} className="footer-module" aria-label="页脚分类">
                        <ModuleTitle>{title !== '' ? title : '文章分类'}</ModuleTitle>
                        <ul className="footer-links">
                            {categories.slice(0, 8).map((category) => (
                                <li key={category.url + category.label}>
                                    <a href={category.url}>
                                        <span className="truncate">{category.label}</span>
                                        <span className="footer-count">{category.count}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                );

            case 'tags':
                if (tags.length === 0) {
                    return null;
                }

                return (
                    <div key={`tags-${index}`} className="footer-module">
                        <ModuleTitle>{title !== '' ? title : '热门标签'}</ModuleTitle>
                        <ul className="footer-tags">
                            {tags.slice(0, 12).map((tag) => (
                                <li key={tag.url + tag.label}>
                                    <a href={tag.url}>{tag.label}</a>
                                </li>
                            ))}
                        </ul>
                    </div>
                );

            case 'custom':
                if (title === '' && text === '') {
                    return null;
                }

                return (
                    <div key={`custom-${index}`} className="footer-module">
                        {title !== '' ? <ModuleTitle>{title}</ModuleTitle> : null}
                        {text !== '' ? <p className="footer-note footer-note-block">{text}</p> : null}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <footer className={`site-footer site-footer-${layout}`}>
            <div className="site-footer-inner">
                <div className="footer-modules">
                    {bodyModules.map((module, index) => renderModule(module, index))}
                </div>

                {hasMeta ? (
                    <>
                        <Separator className="footer-separator" />
                        <div className="footer-meta">
                            <p>
                                &copy; {site.year} {site.title || 'SunkenBoat'}
                            </p>
                            <p>
                                Typecho · TTDF {site.frameworkVersion} · 主题 {site.themeVersion}
                            </p>
                        </div>
                    </>
                ) : null}
            </div>
        </footer>
    );
}
