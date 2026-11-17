import { Rss } from 'lucide-react';
import { Separator } from '../ui/separator';
import type { SiteInfo, WidgetsData } from '../../types';

interface Props {
    site: SiteInfo;
    widgets: WidgetsData;
    layout: 'columns' | 'compact' | 'centered';
    showCategories: boolean;
    showTags: boolean;
}

function Brand({ site }: { site: SiteInfo }) {
    const title = site.title || 'SunkenBoat';

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
                    {title.slice(0, 1)}
                </span>
            )}
            <span className="text-[15px] font-medium text-footer-ink">{title}</span>
        </a>
    );
}

function NavList({ site, centered = false }: { site: SiteInfo; centered?: boolean }) {
    return (
        <ul className={centered ? 'flex flex-wrap items-center justify-center gap-x-5 gap-y-2' : 'mt-3 grid gap-2'}>
            {site.nav.map((item) => (
                <li key={item.url + item.label}>
                    <a
                        className="text-footer-ink/65 transition-colors hover:text-brand-contrast"
                        href={item.url}
                    >
                        {item.label}
                    </a>
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
        <a
            className="inline-flex items-center gap-1.5 text-[12px] text-footer-ink/65 transition-colors hover:text-brand-contrast"
            href={site.feedUrl}
        >
            <Rss className="size-3.5" strokeWidth={1.6} aria-hidden="true" />
            RSS 订阅
        </a>
    );
}

function Meta({ site }: { site: SiteInfo }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-footer-ink/50">
            <p>
                &copy; {site.year} {site.title || 'SunkenBoat'}
            </p>
            <p>
                Typecho · TTDF {site.frameworkVersion} · 主题 {site.themeVersion}
            </p>
        </div>
    );
}

export default function SiteFooter({
    site,
    widgets,
    layout,
    showCategories,
    showTags,
}: Props) {
    const note = site.footerText !== '' ? site.footerText : site.description;
    const categories = showCategories ? widgets.categories : [];
    const tags = showTags ? widgets.tags : [];

    if (layout === 'compact') {
        return (
            <footer className="mt-8 bg-footer px-[30px] py-6 text-[13px] text-footer-ink">
                <div className="mx-auto flex w-full max-w-[1300px] flex-wrap items-center gap-x-6 gap-y-3">
                    <Brand site={site} />
                    <nav aria-label="页脚导航" className="min-w-0 flex-1">
                        <NavList site={site} centered />
                    </nav>
                    <FeedLink site={site} />
                </div>
                <Separator className="mx-auto mt-5 mb-4 h-px max-w-[1300px] bg-white/10" />
                <div className="mx-auto w-full max-w-[1300px]">
                    <Meta site={site} />
                </div>
            </footer>
        );
    }

    if (layout === 'centered') {
        return (
            <footer className="mt-8 bg-footer px-[30px] py-10 text-center text-[13px] text-footer-ink">
                <div className="mx-auto flex w-full max-w-[820px] flex-col items-center">
                    <Brand site={site} />
                    {note ? (
                        <p className="mt-3 max-w-lg text-[13px] leading-[1.7] text-footer-ink/65">{note}</p>
                    ) : null}
                    <nav aria-label="页脚导航" className="mt-5">
                        <NavList site={site} centered />
                    </nav>
                    <div className="mt-5">
                        <FeedLink site={site} />
                    </div>
                </div>
                <Separator className="mx-auto mt-7 mb-4 h-px max-w-[820px] bg-white/10" />
                <div className="mx-auto w-full max-w-[820px]">
                    <Meta site={site} />
                </div>
            </footer>
        );
    }

    const columns =
        categories.length > 0 && tags.length > 0
            ? 'lg:grid-cols-[1.35fr_0.7fr_0.8fr_1fr]'
            : categories.length > 0 || tags.length > 0
              ? 'lg:grid-cols-[1.35fr_0.7fr_0.8fr]'
              : 'lg:grid-cols-[1.35fr_0.7fr]';

    return (
        <footer className="mt-8 bg-footer px-[30px] py-[30px] text-[13px] text-footer-ink">
            <div className={'mx-auto grid w-full max-w-[1300px] gap-8 sm:grid-cols-2 lg:gap-10 ' + columns}>
                <div className="min-w-0">
                    <Brand site={site} />
                    {note ? (
                        <p className="mt-3 max-w-sm text-[13px] leading-[1.7] text-footer-ink/65">{note}</p>
                    ) : null}
                    <div className="mt-3">
                        <FeedLink site={site} />
                    </div>
                </div>

                <nav aria-label="页脚导航">
                    <p className="text-[14px] font-medium text-footer-ink">站内导航</p>
                    <NavList site={site} />
                </nav>

                {categories.length > 0 ? (
                    <nav aria-label="页脚分类">
                        <p className="text-[14px] font-medium text-footer-ink">文章分类</p>
                        <ul className="mt-3 grid gap-2">
                            {categories.slice(0, 6).map((category) => (
                                <li key={category.url + category.label}>
                                    <a
                                        className="flex items-center gap-2 text-footer-ink/65 transition-colors hover:text-brand-contrast"
                                        href={category.url}
                                    >
                                        <span className="truncate">{category.label}</span>
                                        <span className="text-[11px] text-footer-ink/40">{category.count}</span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                ) : null}

                {tags.length > 0 ? (
                    <div>
                        <p className="text-[14px] font-medium text-footer-ink">热门标签</p>
                        <ul className="mt-3 flex flex-wrap gap-[5px]">
                            {tags.slice(0, 10).map((tag) => (
                                <li key={tag.url + tag.label}>
                                    <a
                                        className="inline-flex items-center rounded-[4px] bg-white/[0.07] px-[5px] py-[2px] text-[11px] leading-[1.44] text-footer-ink/65 transition-colors hover:bg-brand hover:text-brand-contrast"
                                        href={tag.url}
                                    >
                                        {tag.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>

            <Separator className="mx-auto mt-7 mb-4 h-px max-w-[1300px] bg-white/10" />

            <div className="mx-auto w-full max-w-[1300px]">
                <Meta site={site} />
            </div>
        </footer>
    );
}
