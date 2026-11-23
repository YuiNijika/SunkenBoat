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
import BreadcrumbsBlock from './BreadcrumbsBlock';
import {
    AuthorGridBlock,
    ButtonGroupBlock,
    HeadingBlock,
    InfoCardsBlock,
    LogoCloudBlock,
    MediaSplitBlock,
    PartnerScrollBlock,
    PostAuthorBlock,
    PostTabsBlock,
    ProductGridBlock,
    PromoGridBlock,
} from './ShowcaseBlocks';
import { ForumCircleBlock, ForumHomeBlock, ForumTopicBlock } from './ForumBlocks';
import {
    ForumAuthors,
    ForumCircleGrid,
    ForumCircleHero,
    ForumCircleInfo,
    ForumCircleList,
    ForumCreate,
    ForumHomeHeader,
    ForumHotCircles,
    ForumHotTopics,
    ForumJoinGate,
    ForumNotice,
    ForumStats,
    ForumTopicList,
} from './ForumModules';
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
                    background={block.background}
                    color={block.color}
                    image={block.image}
                    imageFit={block.imageFit}
                    imageEffect={block.imageEffect}
                    imagePosition={block.imagePosition}
                    video={block.video}
                    videoPoster={block.videoPoster}
                    height={block.height}
                    overlay={block.overlay}
                    align={block.align}
                    hot={block.hot}
                    searchAction={block.searchAction}
                    searchPlaceholder={block.searchPlaceholder}
                    actions={block.actions}
                    cards={block.cards}
                    cardStyle={block.cardStyle}
                />
            );
        case 'carousel':
            return (
                <CarouselBlock
                    title={block.title}
                    slides={block.slides}
                    width={block.width}
                    height={block.height}
                    overlay={block.overlay}
                    align={block.align}
                />
            );
        case 'post-list':
            return (
                <PostListBlock
                    variant={block.variant}
                    title={block.title}
                    anchor={block.anchor}
                    source={block.source}
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
            return (
                <ArchiveHeaderBlock
                    title={block.title}
                    description={block.description}
                    count={block.count}
                    searchLabel={block.searchLabel}
                    searchScope={block.searchScope}
                />
            );
        case 'post-header':
            return <PostHeaderBlock title={block.title} meta={block.meta} share={block.share} />;
        case 'page-header':
            return <PageHeaderBlock variant={block.variant} eyebrow={block.eyebrow} title={block.title} />;
        case 'prose':
            return (
                <ProseBlock
                    title={block.title}
                    meta={block.meta}
                    share={block.share}
                    showHeader={block.showHeader !== false}
                    layout={block.layout}
                    html={block.html}
                    codeCopy={block.codeCopy}
                    download={block.download}
                />
            );
        case 'tags':
            return <TagsBlock title={block.title} items={block.items} />;
        case 'post-nav':
            return <PostNavBlock previousHtml={block.previousHtml} nextHtml={block.nextHtml} />;
        case 'breadcrumbs':
            return <BreadcrumbsBlock items={block.items} />;
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
        case 'promo-grid':
            return (
                <PromoGridBlock
                    type="promo-grid"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'post-tabs':
            return (
                <PostTabsBlock
                    type="post-tabs"
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    tabs={block.tabs}
                />
            );
        case 'author-grid':
            return (
                <AuthorGridBlock
                    type="author-grid"
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    items={block.items}
                />
            );
        case 'product-grid':
            return (
                <ProductGridBlock
                    type="product-grid"
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    items={block.items}
                />
            );
        case 'logo-cloud':
            return (
                <LogoCloudBlock
                    type="logo-cloud"
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    items={block.items}
                />
            );
        case 'heading':
            return (
                <HeadingBlock
                    type="heading"
                    variant={block.variant}
                    eyebrow={block.eyebrow}
                    title={block.title}
                    text={block.text}
                />
            );
        case 'button-group':
            return (
                <ButtonGroupBlock
                    type="button-group"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    items={block.items}
                />
            );
        case 'info-cards':
            return (
                <InfoCardsBlock
                    type="info-cards"
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    items={block.items}
                />
            );
        case 'partner-scroll':
            return (
                <PartnerScrollBlock
                    type="partner-scroll"
                    variant={block.variant}
                    title={block.title}
                    text={block.text}
                    columns={block.columns}
                    speed={block.speed}
                    items={block.items}
                />
            );
        case 'media-split':
            return (
                <MediaSplitBlock
                    type="media-split"
                    title={block.title}
                    text={block.text}
                    kind={block.kind}
                    media={block.media}
                    poster={block.poster}
                    slides={block.slides}
                    columns={block.columns}
                    items={block.items}
                />
            );
        case 'post-author':
            return (
                <PostAuthorBlock
                    type="post-author"
                    title={block.title}
                    showAuthor={block.showAuthor}
                    showPosts={block.showPosts}
                    author={block.author}
                    posts={block.posts}
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
            return (
                <UserSpaceBlock
                    profile={block.profile}
                    posts={block.posts}
                    topics={block.topics ?? []}
                    topicCount={block.topicCount ?? 0}
                    comments={block.comments}
                    circles={block.circles}
                />
            );
        case 'forum-home':
            return <ForumHomeBlock {...block} />;
        case 'forum-circle':
            return <ForumCircleBlock {...block} />;
        case 'forum-topic':
            return <ForumTopicBlock {...block} />;
        case 'forum-home-header':
            return <ForumHomeHeader {...block} />;
        case 'forum-circle-grid':
            return <ForumCircleGrid {...block} />;
        case 'forum-topic-list':
            return <ForumTopicList {...block} />;
        case 'forum-create':
            return <ForumCreate {...block} />;
        case 'forum-circle-list':
            return <ForumCircleList {...block} />;
        case 'forum-notice':
            return <ForumNotice {...block} />;
        case 'forum-authors':
            return <ForumAuthors {...block} />;
        case 'forum-circle-info':
            return <ForumCircleInfo {...block} />;
        case 'forum-join-gate':
            return <ForumJoinGate {...block} />;
        case 'forum-circle-hero':
            return <ForumCircleHero {...block} />;
        case 'forum-stats':
            return <ForumStats {...block} />;
        case 'forum-hot-circles':
            return <ForumHotCircles {...block} />;
        case 'forum-hot-topics':
            return <ForumHotTopics {...block} />;
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
            if (import.meta.env.DEV) {
                console.warn('[TTDF] Unsupported block', block);
            }
            return null;
    }
}
