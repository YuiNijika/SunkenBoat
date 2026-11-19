import { Fragment, useEffect, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import BlockRenderer from './components/blocks/BlockRenderer';
import AccountPanel from './components/layout/AccountPanel';
import ActionRail from './components/layout/ActionRail';
import EditorWorkspace from './components/layout/EditorWorkspace';
import ForumTopicEditor from './components/layout/ForumTopicEditor';
import ReadingProgress from './components/layout/ReadingProgress';
import SiteFooter from './components/layout/SiteFooter';
import SiteHeader from './components/layout/SiteHeader';
import SiteSidebar from './components/layout/SiteSidebar';
import { parseArticle } from './lib/article';
import { useSidebarData } from './lib/sidebar';
import type { PageData, ProseBlock } from './types';

const BLOCK_SPACE: Record<string, string> = {
    none: '0px',
    sm: '10px',
    md: '20px',
    lg: '32px',
    xl: '48px',
};

function blockStyle(block: PageData['blocks'][number]): CSSProperties {
    const style: CSSProperties = {};

    if (block.spaceTop && block.spaceTop !== 'default') {
        style.paddingTop = BLOCK_SPACE[block.spaceTop] ?? undefined;
    }

    if (block.spaceBottom && block.spaceBottom !== 'default') {
        style.paddingBottom = BLOCK_SPACE[block.spaceBottom] ?? undefined;
    }

    if (block.minHeight) {
        style.minHeight = block.minHeight;
    }

    return style;
}

function wideBlockStyle(
    block: PageData['blocks'][number],
    index: number
): CSSProperties {
    const style: CSSProperties = {};
    const spaceTop = block.spaceTop && block.spaceTop !== 'default' ? block.spaceTop : '';
    const spaceBottom =
        block.spaceBottom && block.spaceBottom !== 'default' ? block.spaceBottom : '';

    if (spaceTop !== '') {
        style.marginTop = BLOCK_SPACE[spaceTop] ?? undefined;
    } else if (index > 0) {
        style.marginTop = BLOCK_SPACE.md;
    }

    if (spaceBottom !== '') {
        style.marginBottom = BLOCK_SPACE[spaceBottom] ?? undefined;
    } else {
        style.marginBottom = BLOCK_SPACE.md;
    }

    if (block.minHeight) {
        style.minHeight = block.minHeight;
    }

    return style;
}

interface Props {
    data: PageData;
}

function useBlockEntrance(enabled: boolean, effect: string) {
    useEffect(() => {
        if (!enabled || typeof IntersectionObserver === 'undefined') {
            return;
        }

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            return;
        }

        const safeEffect = ['fade-up', 'fade', 'zoom', 'slide-left', 'slide-right'].includes(effect)
            ? effect
            : 'fade-up';
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-block]'));
        if (nodes.length === 0) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        return;
                    }

                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
        );

        nodes.forEach((node) => {
            node.classList.add('block-animate', `block-animate-${safeEffect}`);
            observer.observe(node);
        });

        return () => observer.disconnect();
    }, [enabled, effect]);
}

export default function App({ data }: Props) {
    const pageWidth = Number.isFinite(data.theme.pageWidth) ? data.theme.pageWidth : 1300;
    const appStyle = { '--page-max': `${pageWidth}px` } as CSSProperties;

    if (data.kind === 'editor') {
        return <EditorApp data={data} appStyle={appStyle} />;
    }

    return <SiteApp data={data} appStyle={appStyle} />;
}

function EditorApp({ data, appStyle }: { data: PageData; appStyle: CSSProperties }) {
    const userApi = data.api?.user;
    const cid = Number(new URLSearchParams(window.location.search).get('cid') ?? 0);
    const { site, widgets } = useSidebarData(data);
    const footerModules =
        Array.isArray(data.theme.footerModules) && data.theme.footerModules.length > 0
            ? data.theme.footerModules
            : ['brand', 'nav', 'categories', 'tags', 'meta'].map((name) => ({ name }));

    return (
        <div className="flex min-h-dvh flex-col" style={appStyle} data-kind="editor">
            <SiteHeader
                site={data.site}
                colorMode={data.theme.colorMode}
                widgets={widgets}
                api={data.api}
                showUserCenter={data.theme.showUserCenter}
            />
            <main id="main" className="flex-1 focus:outline-none" tabIndex={-1}>
                <div className="editor-root">
                    {data.editorMode === 'forum-topic' && data.forumEditor ? (
                        <ForumTopicEditor data={data} />
                    ) : userApi ? (
                        <EditorWorkspace api={userApi} cid={cid} fields={data.fields ?? []} />
                    ) : (
                        <div className="editor-gate">
                            <p className="editor-gate-title">编辑器暂不可用</p>
                            <p className="editor-gate-text">站点内容接口未启用。</p>
                        </div>
                    )}
                </div>
            </main>
            <SiteFooter
                site={site}
                widgets={widgets}
                layout={data.theme.footerLayout}
                modules={footerModules}
                showCategories={data.theme.footerShowCategories}
                showTags={data.theme.footerShowTags}
            />
        </div>
    );
}

function SiteApp({ data, appStyle }: { data: PageData; appStyle: CSSProperties }) {
    const { site: sidebarSite, widgets } = useSidebarData(data);
    useBlockEntrance(data.theme.blockAnimations, data.theme.blockAnimationEffect);
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
    const forumLeft = data.forumLayout?.left ?? [];
    const forumRight = data.forumLayout?.right ?? [];
    const hasForumLayout = forumLeft.length > 0 || forumRight.length > 0;
    const forumColumns =
        forumLeft.length > 0 && forumRight.length > 0
            ? 'lg:grid-cols-[230px_minmax(0,1fr)_270px]'
            : forumLeft.length > 0
              ? 'lg:grid-cols-[230px_minmax(0,1fr)]'
              : forumRight.length > 0
                ? 'lg:grid-cols-[minmax(0,1fr)_270px]'
                : '';
    const twoColumn =
        data.kind !== 'account' &&
        !hasForumLayout &&
        data.theme.showSidebar &&
        sidebarPages.includes(data.kind);
    const sidebarFirst = data.theme.sidebarPosition === 'left';
    const layoutModules =
        Array.isArray(data.theme.layoutModules) && data.theme.layoutModules.length > 0
            ? data.theme.layoutModules
            : ['reading-progress', 'header', 'main', 'footer', 'action-rail'];

    const renderBlock = (block: PageData['blocks'][number], index: number) => (
        <div key={`${block.type}-${index}`} data-block={block.type} style={blockStyle(block)}>
            <BlockRenderer block={block} />
        </div>
    );
    const isWideBlock = (block: PageData['blocks'][number]) =>
        block.width === 'half' || block.width === 'full';
    const wideBlocks = data.blocks.filter(isWideBlock);
    const contentBlocks = data.blocks.filter((block) => !isWideBlock(block));

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
                {wideBlocks.length > 0 ? (
                    <div className="page-wide-stack">
                        {wideBlocks.map((block, index) => (
                            <div
                                key={`${block.type}-${index}`}
                                className={
                                    block.width === 'full' ? 'page-wide-full' : 'page-wide-half'
                                }
                                data-block={block.type}
                                style={wideBlockStyle(block, index)}
                            >
                                <BlockRenderer block={block} />
                            </div>
                        ))}
                    </div>
                ) : null}
                <div
                    className={
                        'container-page pb-5 ' + (wideBlocks.length > 0 ? 'pt-0' : 'pt-[15px]')
                    }
                >
                    {hasForumLayout ? (
                        <div className={'grid grid-cols-[minmax(0,1fr)] gap-[15px] ' + forumColumns}>
                            {forumLeft.length > 0 ? (
                                <aside
                                    className="order-2 grid content-start gap-[15px] lg:sticky lg:top-[88px] lg:order-1 lg:self-start"
                                    data-forum-slot="left"
                                >
                                    {forumLeft.map(renderBlock)}
                                </aside>
                            ) : null}
                            <div
                                className="order-1 grid min-w-0 content-start gap-[15px] lg:order-2"
                                data-forum-slot="main"
                            >
                                {contentBlocks.map(renderBlock)}
                            </div>
                            {forumRight.length > 0 ? (
                                <aside
                                    className="order-3 grid content-start gap-[15px] lg:sticky lg:top-[88px] lg:self-start"
                                    data-forum-slot="right"
                                >
                                    {forumRight.map(renderBlock)}
                                </aside>
                            ) : null}
                        </div>
                    ) : twoColumn ? (
                        <div className="grid grid-cols-[minmax(0,1fr)] gap-[15px]">
                            <div
                                className={
                                    sidebarFirst
                                        ? 'shell-grid lg:grid-cols-[311px_minmax(0,1fr)]'
                                        : 'shell-grid'
                                }
                            >
                                <div
                                    className={
                                        'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[15px]' +
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
                        <div className="grid grid-cols-[minmax(0,1fr)] gap-[15px]">
                            {contentBlocks.map(renderBlock)}
                            {data.kind === 'account' ? (
                                <AccountPanel
                                    api={data.api?.user}
                                    section={data.userSection ?? 'profile'}
                                />
                            ) : null}
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
                modules={
                    Array.isArray(data.theme.footerModules) && data.theme.footerModules.length > 0
                        ? data.theme.footerModules
                        : ['brand', 'nav', 'categories', 'tags', 'meta'].map((name) => ({ name }))
                }
                showCategories={data.theme.footerShowCategories}
                showTags={data.theme.footerShowTags}
            />
        ),
        'action-rail':
            ['forum-home', 'forum-circle', 'forum-topic'].includes(data.kind) ? null : (
                <ActionRail colorMode={data.theme.colorMode} />
            ),
    };

    return (
        <div className="flex min-h-dvh flex-col" data-kind={data.kind} style={appStyle}>
            {layoutModules.map((module) => (
                <Fragment key={module}>{modules[module] ?? null}</Fragment>
            ))}
        </div>
    );
}
