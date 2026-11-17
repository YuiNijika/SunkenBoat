import { Fragment, useMemo } from 'react';
import type { ReactNode } from 'react';
import BlockRenderer from './components/blocks/BlockRenderer';
import ActionRail from './components/layout/ActionRail';
import ReadingProgress from './components/layout/ReadingProgress';
import SiteFooter from './components/layout/SiteFooter';
import SiteHeader from './components/layout/SiteHeader';
import SiteSidebar from './components/layout/SiteSidebar';
import { parseArticle } from './lib/article';
import { useSidebarData } from './lib/sidebar';
import type { PageData, ProseBlock } from './types';

interface Props {
    data: PageData;
}

export default function App({ data }: Props) {
    const { site: sidebarSite, widgets } = useSidebarData(data);
    const showProgress =
        data.theme.showReadingProgress && (data.kind === 'post' || data.kind === 'page');
    const prose = data.blocks.find((block): block is ProseBlock => block.type === 'prose');
    const toc = useMemo(
        () => (prose && prose.toc && data.theme.showToc ? parseArticle(prose.html).toc : []),
        [prose?.html, prose?.toc, data.theme.showToc]
    );

    const sidebarPages = Array.isArray(data.theme.sidebarPages)
        ? data.theme.sidebarPages
        : ['home', 'archive', 'post', 'page'];
    const twoColumn = data.theme.showSidebar && sidebarPages.includes(data.kind);
    const narrow = data.kind === '404' || data.kind === 'custom';
    const sidebarFirst = data.theme.sidebarPosition === 'left';
    const layoutModules =
        Array.isArray(data.theme.layoutModules) && data.theme.layoutModules.length > 0
            ? data.theme.layoutModules
            : ['reading-progress', 'header', 'main', 'footer', 'action-rail'];

    const renderBlock = (block: PageData['blocks'][number], index: number) => (
        <div key={`${block.type}-${index}`} data-block={block.type}>
            <BlockRenderer block={block} />
        </div>
    );
    const heroBlock = data.blocks.find((block) => block.type === 'hero');
    const contentBlocks = heroBlock ? data.blocks.filter((block) => block !== heroBlock) : data.blocks;

    const modules: Record<string, ReactNode> = {
        'reading-progress': showProgress ? <ReadingProgress /> : null,
        header: (
            <SiteHeader
                site={data.site}
                colorMode={data.theme.colorMode}
                widgets={widgets}
                api={data.api}
                showUserCenter={data.theme.showUserCenter}
            />
        ),
        main: (
            <main
                id="main"
                className="flex-1 focus:outline-none focus-visible:outline-none"
                tabIndex={-1}
            >
                <div className="container-page pt-0 pb-5">
                    {twoColumn ? (
                        <div className="grid gap-[15px]">
                            {heroBlock ? (
                                <div data-block="hero">
                                    <BlockRenderer block={heroBlock} />
                                </div>
                            ) : null}
                            <div
                                className={
                                    sidebarFirst
                                        ? 'shell-grid lg:grid-cols-[311px_minmax(0,1fr)]'
                                        : 'shell-grid'
                                }
                            >
                                <div
                                    className={
                                        'grid min-w-0 gap-[15px]' +
                                        (sidebarFirst ? ' lg:order-2' : '')
                                    }
                                >
                                    {contentBlocks.map(renderBlock)}
                                </div>
                                <aside
                                    className={
                                        'hidden lg:block lg:self-stretch' +
                                        (sidebarFirst ? ' lg:order-1' : '')
                                    }
                                >
                                    <div
                                        className={
                                            data.theme.sidebarSticky ? 'sidebar-sticky' : ''
                                        }
                                    >
                                        <SiteSidebar
                                            site={sidebarSite}
                                            widgets={widgets}
                                            toc={toc}
                                            tocTitle={prose?.tocTitle ?? ''}
                                            modules={data.theme.sidebarModules}
                                        />
                                    </div>
                                </aside>
                            </div>
                        </div>
                    ) : (
                        <div className={'grid gap-[15px]' + (narrow ? ' mx-auto max-w-3xl' : '')}>
                            {data.blocks.map(renderBlock)}
                        </div>
                    )}
                </div>
            </main>
        ),
        footer: (
            <SiteFooter
                site={sidebarSite}
                widgets={widgets}
                layout={data.theme.footerLayout}
                showCategories={data.theme.footerShowCategories}
                showTags={data.theme.footerShowTags}
            />
        ),
        'action-rail': <ActionRail colorMode={data.theme.colorMode} />,
    };

    return (
        <div className="flex min-h-dvh flex-col" data-kind={data.kind}>
            {layoutModules.map((module) => (
                <Fragment key={module}>{modules[module] ?? null}</Fragment>
            ))}
        </div>
    );
}
