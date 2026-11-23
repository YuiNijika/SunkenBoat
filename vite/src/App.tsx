import { Fragment, useEffect, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import BlockRenderer from './components/blocks/BlockRenderer';
import AccountPanel from './components/layout/AccountPanel';
import ActionRail from './components/layout/ActionRail';
import EditorWorkspace from './components/layout/EditorWorkspace';
import ForumFlow from './components/layout/ForumFlow';
import ForumTopicEditor from './components/layout/ForumTopicEditor';
import OperationsCenter from './components/layout/OperationsCenter';
import PageFlow from './components/layout/PageFlow';
import ReadingProgress from './components/layout/ReadingProgress';
import SiteFooter from './components/layout/SiteFooter';
import SiteHeader from './components/layout/SiteHeader';
import SiteSidebar from './components/layout/SiteSidebar';
import PaidContentRuntime from './components/content/PaidContentRuntime';
import { Toaster } from './components/ui/sonner';
import { parseArticle } from './lib/article';
import { restoreFlashNotify } from './lib/notify';
import { useSidebarData } from './lib/sidebar';
import { useTheme } from './lib/theme';
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
        style.paddingTop = BLOCK_SPACE[spaceTop] ?? undefined;
    } else if (index > 0) {
        style.paddingTop = BLOCK_SPACE.md;
    }

    if (spaceBottom !== '') {
        style.paddingBottom = BLOCK_SPACE[spaceBottom] ?? undefined;
    } else {
        style.paddingBottom = BLOCK_SPACE.md;
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
        const animated = new WeakSet<HTMLElement>();
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

        const scan = () => {
            document.querySelectorAll<HTMLElement>('[data-block]').forEach((node) => {
                if (animated.has(node)) {
                    return;
                }

                animated.add(node);
                node.classList.add('block-animate', `block-animate-${safeEffect}`);
                observer.observe(node);
            });
        };

        scan();
        let frame = 0;
        const schedule = () => {
            if (frame !== 0) {
                return;
            }

            frame = window.requestAnimationFrame(() => {
                frame = 0;
                scan();
            });
        };
        const mutations = new MutationObserver(schedule);
        mutations.observe(document.body, { childList: true, subtree: true });

        return () => {
            if (frame !== 0) {
                window.cancelAnimationFrame(frame);
            }
            mutations.disconnect();
            observer.disconnect();
        };
    }, [enabled, effect]);
}

export default function App({ data }: Props) {
    const pageWidth = Number.isFinite(data.theme.pageWidth) ? data.theme.pageWidth : 1300;
    const appStyle = { '--page-max': `${pageWidth}px` } as CSSProperties;

    useEffect(() => {
        restoreFlashNotify();
    }, []);

    return (
        <>
            {data.kind === 'editor' ? (
                <EditorApp data={data} appStyle={appStyle} />
            ) : (
                <SiteApp data={data} appStyle={appStyle} />
            )}
            {data.kind !== 'editor' && data.paid ? (
                <PaidContentRuntime config={data.paid} />
            ) : null}
            <ToasterHost colorMode={data.theme.colorMode} />
        </>
    );
}

function ToasterHost({ colorMode }: { colorMode: string }) {
    const { theme } = useTheme(colorMode);

    return <Toaster position="top-center" richColors closeButton theme={theme} />;
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
    const showActionRail =
        layoutModules.includes('action-rail') &&
        !['forum-home', 'forum-circle', 'forum-topic'].includes(data.kind);

    const blockIndex = (block: PageData['blocks'][number], fallback: number): number => (
        typeof block.settingsIndex === 'number' ? block.settingsIndex : fallback
    );
    const isWideBlock = (block: PageData['blocks'][number]) =>
        block.width === 'half' || block.width === 'full';
    const indexedBlocks = data.blocks.map((block, index) => ({ block, index }));
    const topBlock = data.blocks[0];
    const flushTop = topBlock?.spaceTop === 'none';
    const flowItems = indexedBlocks.map(({ block, index }) => {
        const wide = isWideBlock(block);

        return {
            key: `${block.type}-${index}`,
            type: block.type,
            settingsIndex: blockIndex(block, index),
            wide,
            width: block.width ?? 'content',
            style: wide ? wideBlockStyle(block, index) : blockStyle(block),
            content: <BlockRenderer block={block} />,
        };
    });
    const pageExtra =
        data.kind === 'operations' ? (
            <OperationsCenter api={data.api?.user} enabled={data.operationsEnabled !== false} />
        ) : data.kind === 'account' ? (
            <AccountPanel
                key={data.userSection ?? 'profile'}
                api={data.api?.user}
                section={data.userSection ?? 'profile'}
            />
        ) : null;
    const sidebarNode = twoColumn ? (
        <SiteSidebar
            site={sidebarSite}
            widgets={widgets}
            toc={toc}
            tocTitle={prose?.tocTitle ?? ''}
            modules={data.theme.sidebarModules}
            api={data.api?.user}
        />
    ) : null;
    const pageTopPadding = !topBlock || (!isWideBlock(topBlock) && !flushTop);

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
                {hasForumLayout ? (
                    <ForumFlow
                        items={flowItems}
                        left={
                            forumLeft.length > 0
                                ? forumLeft.map((block, index) => {
                                      const settingsIndex = blockIndex(block, index);

                                      return (
                                          <div
                                              key={`${block.type}-left-${index}`}
                                              data-block={block.type}
                                              data-block-index={settingsIndex}
                                          >
                                              <BlockRenderer block={block} />
                                          </div>
                                      );
                                  })
                                : undefined
                        }
                        right={
                            forumRight.length > 0
                                ? forumRight.map((block, index) => {
                                      const settingsIndex = blockIndex(block, index);

                                      return (
                                          <div
                                              key={`${block.type}-right-${index}`}
                                              data-block={block.type}
                                              data-block-index={settingsIndex}
                                          >
                                              <BlockRenderer block={block} />
                                          </div>
                                      );
                                  })
                                : undefined
                        }
                        topPadding={pageTopPadding}
                    />
                ) : (
                    <PageFlow
                        items={flowItems}
                        extra={pageExtra}
                        sidebar={sidebarNode}
                        sidebarPosition={sidebarFirst ? 'left' : 'right'}
                        sidebarSticky={data.theme.sidebarSticky}
                        topPadding={pageTopPadding}
                    />
                )}
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
            showActionRail ? (
                <ActionRail colorMode={data.theme.colorMode} />
            ) : null,
    };

    return (
        <div
            className={
                'flex min-h-dvh flex-col' +
                (flushTop ? ' has-flush-top' : '') +
                (showActionRail ? ' has-action-rail' : '')
            }
            data-kind={data.kind}
            style={appStyle}
        >
            {layoutModules.map((module) => (
                <Fragment key={module}>{modules[module] ?? null}</Fragment>
            ))}
        </div>
    );
}
