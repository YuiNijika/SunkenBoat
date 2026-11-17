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
    layoutModules: string[];
}

export interface UserApiEndpoints {
    enabled: boolean;
    session: string;
    login: string;
    logout: string;
    me: string;
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
}

export interface HeroBlock extends BlockBase {
    type: 'hero';
    eyebrow: string;
    title: string;
    lead: string;
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
    category: string;
    posts: PostSummary[];
    paginationHtml: string;
    empty: string;
}

export interface CategoriesBlock extends BlockBase {
    type: 'categories';
    title: string;
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
    title: string;
    text: string;
    action: { label: string; url: string };
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

export interface DividerBlock extends BlockBase {
    type: 'divider';
}

export interface SpacerBlock extends BlockBase {
    type: 'spacer';
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
    | DividerBlock
    | SpacerBlock;

export interface PageData {
    kind: 'home' | 'archive' | 'post' | 'page' | '404' | 'custom';
    site: SiteInfo;
    theme: ThemeOptions;
    api?: ApiEndpoints;
    blocks: Block[];
    widgets?: WidgetsData;
    allowComment?: boolean;
    title?: string;
    documentTitle?: string;
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
