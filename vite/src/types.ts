export type ThemeName = 'light' | 'dark';

export interface NavItem {
    label: string;
    url: string;
    active?: boolean;
    children?: NavItem[];
}

export interface SiteInfo {
    title: string;
    description: string;
    url: string;
    feedUrl: string;
    logo: string;
    subtitle: string;
    footerText: string;
    showTitle: boolean;
    nav: NavItem[];
    year: number;
    frameworkVersion: string;
    themeVersion: string;
}

export interface ThemeOptions {
    colorMode: string;
    showToc: boolean;
    showReadingProgress: boolean;
    showSidebar: boolean;
    sidebarPages: string[];
    sidebarModules: string[];
    showUserCenter: boolean;
    sidebarPosition: 'left' | 'right';
    sidebarSticky: boolean;
    footerLayout: 'columns' | 'compact' | 'centered';
    footerShowCategories: boolean;
    footerShowTags: boolean;
    footerModules: FooterModule[];
    layoutModules: string[];
    pageWidth: number;
}

export interface FooterModule {
    name: 'brand' | 'nav' | 'categories' | 'tags' | 'custom' | 'meta' | string;
    variant?: string;
    data?: {
        title?: string;
        text?: string;
    };
}

export interface OAuthProvider {
    id: string;
    label: string;
    bound: boolean;
    name: string;
    avatar: string;
    boundAt: number;
}

export interface OAuthEndpoints {
    enabled: boolean;
    providers: OAuthProvider[];
    startBase: string;
    unbind: string;
    nonce: string;
    nullImage: string;
}

export interface UserApiEndpoints {
    enabled: boolean;
    session: string;
    login: string;
    register: string;
    registerEnabled: boolean;
    registerVerify: boolean;
    emailCode: string;
    resetPassword: string;
    resetEnabled: boolean;
    emailVerify: boolean;
    emailChangeEnabled: boolean;
    password: string;
    logout: string;
    me: string;
    profile: string;
    profileNonce: string;
    enhanced: boolean;
    pages: {
        profile: string;
        account: string;
        social: string;
        content: string;
        editor: string;
        space: string;
    };
    content: {
        enabled: boolean;
        contents: string;
        item: string;
        posts: string;
        categories: string;
        comments: string;
        media: string;
    };
    mailConfigured: boolean;
    oauth: OAuthEndpoints;
}

export interface UserProfile {
    uid: number;
    name: string;
    screenName: string;
    mail?: string;
    url?: string;
    group: string;
    created?: string;
    avatar?: string;
    customAvatar?: string;
    signature?: string;
    gender?: string;
    privacy?: string;
    location?: string;
    posts?: number;
    comments?: number;
    canWrite?: boolean;
}

export interface MediaItem {
    id: number;
    title: string;
    name: string;
    url: string;
    path: string;
    size: number;
    type: string;
    mime: string;
    created: number;
    modified: number;
    authorId: number;
}

export interface ApiEndpoints {
    enabled: boolean;
    base: string;
    sidebar: string;
    site: string;
    categories: string;
    posts: string;
    tags: string;
    stats: string;
    user: UserApiEndpoints;
}

export interface PostCategory {
    label: string;
    url: string;
}

export interface PostSummary {
    title: string;
    url: string;
    excerpt: string;
    date: string;
    dateIso: string;
    thumb: string;
    author: string;
    comments: number;
    readingTime: number;
    views: number;
    categories: PostCategory[];
    tags: PostCategory[];
}

export interface CategoryItem {
    label: string;
    url: string;
    count: number;
}

export interface WidgetPost {
    title: string;
    url: string;
    date: string;
    thumb: string;
    comments: number;
    views: number;
}

export interface WidgetStats {
    posts: number;
    comments: number;
    categories: number;
    tags: number;
}

export interface WidgetsData {
    recent: WidgetPost[];
    categories: CategoryItem[];
    tags: CategoryItem[];
    stats: WidgetStats;
}

export interface LinkItem {
    label: string;
    url: string;
    description?: string;
}

export interface CommentsData {
    allow: boolean;
    apiEnabled: boolean;
    apiUrl: string;
    cid: number;
    pageSize: number;
    collapsed: boolean;
    title: string;
    countText: string;
    listHtml: string;
    paginationHtml: string;
    cancelReplyHtml: string;
    respondId: string;
    action: string;
    loggedIn: boolean;
    screenName: string;
    profileUrl: string;
    logoutUrl: string;
    remember: {
        author: string;
        mail: string;
        url: string;
    };
    requireMail: boolean;
    requireUrl: boolean;
}

interface BlockBase {
    type: string;
    variant?: string;
    width?: 'content' | 'half' | 'full';
    spaceTop?: 'default' | 'none' | 'sm' | 'md' | 'lg' | 'xl';
    spaceBottom?: 'default' | 'none' | 'sm' | 'md' | 'lg' | 'xl';
    minHeight?: string;
}

export interface HeroBlock extends BlockBase {
    type: 'hero';
    width: 'content' | 'half' | 'full';
    eyebrow: string;
    title: string;
    lead: string;
    image: string;
    height: '' | 'sm' | 'md' | 'lg' | 'screen';
    overlay: number;
    align: 'left' | 'center';
    hot: string[];
    showFeatured: boolean;
    searchAction: string;
    searchPlaceholder: string;
    actions: { label: string; url: string; style: string }[];
    featured: FeaturedPost | null;
}

export interface FeaturedPost {
    title: string;
    url: string;
    excerpt: string;
    date: string;
    thumb: string;
    comments: number;
    readingTime: number;
    views: number;
}

export interface PostListBlock extends BlockBase {
    type: 'post-list';
    title: string;
    anchor?: string;
    category: string;
    limit: number;
    columns: number;
    showPagination: boolean;
    posts: PostSummary[];
    paginationHtml: string;
    empty: string;
}

export interface CategoriesBlock extends BlockBase {
    type: 'categories';
    title: string;
    limit: number;
    columns: number;
    items: CategoryItem[];
}

export interface ArchiveHeaderBlock extends BlockBase {
    type: 'archive-header';
    title: string;
    description: string;
    count: number;
}

export interface PostHeaderBlock extends BlockBase {
    type: 'post-header';
    title: string;
    meta: {
        date: string;
        dateIso: string;
        author: string;
        commentsText: string;
        views: number;
        viewsText: string;
        categories: PostCategory[];
    };
}

export interface PageHeaderBlock extends BlockBase {
    type: 'page-header';
    eyebrow: string;
    title: string;
}

export interface ProseBlock extends BlockBase {
    type: 'prose';
    title: string;
    meta: PostHeaderBlock['meta'] | null;
    html: string;
    toc: boolean;
    tocTitle: string;
    codeCopy: boolean;
}

export interface TagsBlock extends BlockBase {
    type: 'tags';
    title: string;
    items: PostCategory[];
}

export interface CarouselSlide {
    image: string;
    title: string;
    description: string;
    url: string;
}

export interface CarouselBlock extends BlockBase {
    type: 'carousel';
    width: 'content' | 'half' | 'full';
    title: string;
    slides: CarouselSlide[];
}

export interface PostNavBlock extends BlockBase {
    type: 'post-nav';
    previousHtml: string;
    nextHtml: string;
}

export interface CommentsBlock extends BlockBase {
    type: 'comments';
    data: CommentsData;
}

export interface NotFoundBlock extends BlockBase {
    type: 'notfound';
    image: string;
    title: string;
    text: string;
    action: { label: string; url: string };
    searchAction: string;
    searchPlaceholder: string;
}

export interface SearchBlock extends BlockBase {
    type: 'search';
    title: string;
    action: string;
    placeholder: string;
    buttonLabel: string;
}

export interface CtaBlock extends BlockBase {
    type: 'cta';
    eyebrow: string;
    title: string;
    text: string;
    action: { label: string; url: string };
}

export interface LinkListBlock extends BlockBase {
    type: 'link-list';
    title?: string;
    items: LinkItem[];
}

export interface AlertBlock extends BlockBase {
    type: 'alert';
    title: string;
    text: string;
    action: { label: string; url: string };
}

export interface NoticeBlock extends BlockBase {
    type: 'notice';
    eyebrow: string;
    title: string;
    text: string;
    action: { label: string; url: string };
}

export interface QuoteBlock extends BlockBase {
    type: 'quote';
    text: string;
    cite: string;
    sourceUrl: string;
}

export interface FeatureGridBlock extends BlockBase {
    type: 'feature-grid';
    eyebrow: string;
    title: string;
    text: string;
    items: { title: string; text: string; url: string }[];
}

export interface StatsBlock extends BlockBase {
    type: 'stats';
    title: string;
    text: string;
    items: { value: string; label: string }[];
}

export interface StepsBlock extends BlockBase {
    type: 'steps';
    eyebrow: string;
    title: string;
    text: string;
    items: { title: string; text: string }[];
}

export interface FaqBlock extends BlockBase {
    type: 'faq';
    eyebrow: string;
    title: string;
    text: string;
    items: { question: string; answer: string }[];
}

export interface TimelineBlock extends BlockBase {
    type: 'timeline';
    eyebrow: string;
    title: string;
    text: string;
    items: { date: string; title: string; text: string }[];
}

export interface GalleryBlock extends BlockBase {
    type: 'gallery';
    title: string;
    text: string;
    images: string[];
}

export interface TableBlock extends BlockBase {
    type: 'table';
    title: string;
    text: string;
    head: string[];
    rows: string[][];
}

export interface AuthorCardBlock extends BlockBase {
    type: 'author-card';
    name: string;
    role: string;
    bio: string;
    avatar: string;
    links: { label: string; url: string }[];
}

export interface SubscribeBlock extends BlockBase {
    type: 'subscribe';
    eyebrow: string;
    title: string;
    text: string;
    actions: { label: string; url: string; style: string }[];
}

export interface DividerBlock extends BlockBase {
    type: 'divider';
}

export interface SpacerBlock extends BlockBase {
    type: 'spacer';
}

export interface MediaGridItem {
    title: string;
    text: string;
    image: string;
    url: string;
}

export interface MediaGridBlock extends BlockBase {
    type: 'media-grid';
    title: string;
    text: string;
    columns: number;
    items: MediaGridItem[];
}

export interface PricingPlan {
    name: string;
    price: string;
    period: string;
    features: string[];
    action: { label: string; url: string };
    featured: boolean;
}

export interface PricingBlock extends BlockBase {
    type: 'pricing';
    title: string;
    text: string;
    columns: number;
    plans: PricingPlan[];
}

export interface UserSpaceProfile {
    uid: number;
    name: string;
    screenName: string;
    avatar: string;
    customAvatar: string;
    url: string;
    group: string;
    created: string;
    posts: number;
    comments: number;
    canWrite: boolean;
    isSelf: boolean;
    privacy: string;
    detailsVisible: boolean;
    signature: string;
    gender: string;
    location: string;
    editUrl?: string;
}

export interface UserSpaceBlock extends BlockBase {
    type: 'user-space';
    profile: UserSpaceProfile;
}

export type Block =
    | HeroBlock
    | CarouselBlock
    | PostListBlock
    | CategoriesBlock
    | ArchiveHeaderBlock
    | PostHeaderBlock
    | PageHeaderBlock
    | ProseBlock
    | TagsBlock
    | PostNavBlock
    | CommentsBlock
    | NotFoundBlock
    | SearchBlock
    | CtaBlock
    | LinkListBlock
    | AlertBlock
    | NoticeBlock
    | QuoteBlock
    | FeatureGridBlock
    | StatsBlock
    | StepsBlock
    | FaqBlock
    | TimelineBlock
    | GalleryBlock
    | TableBlock
    | MediaGridBlock
    | PricingBlock
    | UserSpaceBlock
    | AuthorCardBlock
    | SubscribeBlock
    | DividerBlock
    | SpacerBlock;

export interface PageData {
    kind:
        | 'home'
        | 'archive'
        | 'post'
        | 'page'
        | '404'
        | 'custom'
        | 'account'
        | 'editor'
        | 'user-space';
    userSection?: 'profile' | 'security' | 'social' | 'content';
    userMode?: 'list' | 'editor';
    site: SiteInfo;
    theme: ThemeOptions;
    api?: ApiEndpoints;
    blocks: Block[];
    widgets?: WidgetsData;
    allowComment?: boolean;
    title?: string;
    documentTitle?: string;
    fields?: ArticleField[];
}

export interface ArticleField {
    name: string;
    label: string;
    type: string;
    description: string;
    options: { value: string; label: string }[];
    value: string;
    media: boolean;
}

/**
 * The PHP layer prints one JSON document; anything malformed falls back to an
 * empty page instead of throwing inside the router.
 */
export function parsePageData(raw: string): PageData | null {
    if (raw.trim() === '') {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }

        const candidate = parsed as Partial<PageData>;
        if (typeof candidate.kind !== 'string' || !candidate.site || !Array.isArray(candidate.blocks)) {
            return null;
        }

        return candidate as PageData;
    } catch {
        return null;
    }
}
