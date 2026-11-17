import CategoriesBlock from './CategoriesBlock';
import CarouselBlock from './CarouselBlock';
import CommentsBlock from './CommentsBlock';
import HeroBlock from './HeroBlock';
import PostListBlock from './PostListBlock';
import ProseBlock from './ProseBlock';
import { ArchiveHeaderBlock, PageHeaderBlock, PostHeaderBlock } from './Headers';
import {
    CtaBlock,
    DividerBlock,
    LinkListBlock,
    NotFoundBlock,
    PostNavBlock,
    SearchBlock,
    SpacerBlock,
    TagsBlock,
} from './MiscBlocks';
import type { Block } from '../../types';

interface Props {
    block: Block;
}

export default function BlockRenderer({ block }: Props) {
    switch (block.type) {
        case 'hero':
            return (
                <HeroBlock
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    lead={block.lead}
                    searchAction={block.searchAction}
                    searchPlaceholder={block.searchPlaceholder}
                    actions={block.actions}
                    featured={block.featured}
                />
            );
        case 'carousel':
            return <CarouselBlock title={block.title} slides={block.slides} />;
        case 'post-list':
            return (
                <PostListBlock
                    variant={block.variant}
                    title={block.title}
                    posts={block.posts}
                    paginationHtml={block.paginationHtml}
                    empty={block.empty}
                />
            );
        case 'categories':
            return <CategoriesBlock variant={block.variant} title={block.title} items={block.items} />;
        case 'archive-header':
            return <ArchiveHeaderBlock title={block.title} description={block.description} count={block.count} />;
        case 'post-header':
            return <PostHeaderBlock title={block.title} meta={block.meta} />;
        case 'page-header':
            return <PageHeaderBlock variant={block.variant} eyebrow={block.eyebrow} title={block.title} />;
        case 'prose':
            return (
                <ProseBlock
                    title={block.title}
                    meta={block.meta}
                    html={block.html}
                    codeCopy={block.codeCopy}
                />
            );
        case 'tags':
            return <TagsBlock title={block.title} items={block.items} />;
        case 'post-nav':
            return <PostNavBlock previousHtml={block.previousHtml} nextHtml={block.nextHtml} />;
        case 'comments':
            return <CommentsBlock data={block.data} />;
        case 'notfound':
            return <NotFoundBlock title={block.title} text={block.text} action={block.action} />;
        case 'search':
            return (
                <SearchBlock
                    variant={block.variant}
                    title={block.title}
                    action={block.action}
                    placeholder={block.placeholder}
                    buttonLabel={block.buttonLabel}
                />
            );
        case 'cta':
            return <CtaBlock eyebrow={block.eyebrow} title={block.title} text={block.text} action={block.action} />;
        case 'link-list':
            return <LinkListBlock title={block.title} items={block.items} />;
        case 'divider':
            return <DividerBlock variant={block.variant} />;
        case 'spacer':
            return <SpacerBlock variant={block.variant} />;
        default:
            return null;
    }
}
