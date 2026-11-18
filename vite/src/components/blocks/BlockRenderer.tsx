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
import {
    AlertBlock,
    AuthorCardBlock,
    FaqBlock,
    FeatureGridBlock,
    GalleryBlock,
    NoticeBlock,
    QuoteBlock,
    StatsBlock,
    StepsBlock,
    SubscribeBlock,
    TableBlock,
    TimelineBlock,
} from './ContentBlocks';
import MediaGridBlock from './MediaGridBlock';
import PricingBlock from './PricingBlock';
import UserSpaceBlock from './UserSpaceBlock';
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
                    width={block.width}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    lead={block.lead}
                    image={block.image}
                    height={block.height}
                    overlay={block.overlay}
                    align={block.align}
                    hot={block.hot}
                    showFeatured={block.showFeatured}
                    searchAction={block.searchAction}
                    searchPlaceholder={block.searchPlaceholder}
                    actions={block.actions}
                    featured={block.featured}
                />
            );
        case 'carousel':
            return <CarouselBlock title={block.title} slides={block.slides} width={block.width} />;
        case 'post-list':
            return (
                <PostListBlock
                    variant={block.variant}
                    title={block.title}
                    anchor={block.anchor}
                    posts={block.posts}
                    paginationHtml={block.paginationHtml}
                    empty={block.empty}
                    limit={block.limit}
                    columns={block.columns}
                    showPagination={block.showPagination}
                />
            );
        case 'categories':
            return (
                <CategoriesBlock
                    variant={block.variant}
                    title={block.title}
                    items={block.items}
                    limit={block.limit}
                    columns={block.columns}
                />
            );
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
            return (
                <NotFoundBlock
                    image={block.image}
                    title={block.title}
                    text={block.text}
                    action={block.action}
                    searchAction={block.searchAction}
                    searchPlaceholder={block.searchPlaceholder}
                />
            );
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
        case 'alert':
            return (
                <AlertBlock
                    type="alert"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    action={block.action}
                />
            );
        case 'notice':
            return (
                <NoticeBlock
                    type="notice"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                    action={block.action}
                />
            );
        case 'quote':
            return (
                <QuoteBlock
                    type="quote"
                    variant={block.variant}
                    text={block.text}
                    cite={block.cite}
                    sourceUrl={block.sourceUrl}
                />
            );
        case 'feature-grid':
            return (
                <FeatureGridBlock
                    type="feature-grid"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'stats':
            return (
                <StatsBlock
                    type="stats"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'steps':
            return (
                <StepsBlock
                    type="steps"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'faq':
            return (
                <FaqBlock
                    type="faq"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'timeline':
            return (
                <TimelineBlock
                    type="timeline"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'gallery':
            return (
                <GalleryBlock
                    type="gallery"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    images={block.images}
                />
            );
        case 'table':
            return (
                <TableBlock
                    type="table"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    head={block.head}
                    rows={block.rows}
                />
            );
        case 'media-grid':
            return (
                <MediaGridBlock
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    items={block.items}
                />
            );
        case 'pricing':
            return (
                <PricingBlock
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    plans={block.plans}
                />
            );
        case 'user-space':
            return <UserSpaceBlock profile={block.profile} />;
        case 'author-card':
            return (
                <AuthorCardBlock
                    type="author-card"
                    variant={block.variant}
                    name={block.name}
                    role={block.role}
                    bio={block.bio}
                    avatar={block.avatar}
                    links={block.links}
                />
            );
        case 'subscribe':
            return (
                <SubscribeBlock
                    type="subscribe"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                    actions={block.actions}
                />
            );
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
