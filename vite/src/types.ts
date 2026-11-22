import type { DownloadConfig, DownloadsClient, DownloadOffer } from './lib/downloads';

export type ThemeName = 'light' | 'dark';

export interface NavItem {
    label: string;
    url: string;
    icon?: string;
    active?: boolean;
    children?: NavItem[];
}

export interface SiteInfo {
    title: string;
    description: string;
    url: string;
    apiBase: string;
    feedUrl: string;
    logo: string;
    subtitle: string;
    footerText: string;
    showTitle: boolean;
    nav: NavItem[];
    year: number;
    frameworkVersion: string;
    themeVersion: string;
    translate: {
        enabled: boolean;
        script: string;
        local: string;
        service: string;
        languages: Array<{ code: string; label: string }>;
    };
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
    blockAnimations: boolean;
    blockAnimationEffect: string;
    shareEnabled: boolean;
    shareItems: string[];
    sharePosterBrand: string;
    pageWidth: number;
}

export interface ShareConfig {
    enabled: boolean;
    items: string[];
    brand: string;
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

export interface UserForumEndpoints {
    enabled: boolean;
    label: string;
    title: string;
    content: string;
    moderation: string;
    topicUpdate: string;
    topicDelete: string;
    nonce: string;
    home: string;
    editor: string;
    canPost: boolean;
    canCreateCircle: boolean;
    canModerate: boolean;
    kinds: ForumTopicKind[];
}

export interface UserEconomyLevel {
    level: number;
    title: string;
    color: string;
    minExperience: number;
    nextTitle: string;
    nextExperience: number;
    progress: number;
}

export interface UserEconomyStatus {
    banned: boolean;
    status: 'normal' | 'banned' | string;
    type: 'none' | 'permanent' | 'temporary' | string;
    until: number;
    reason: string;
    message: string;
}

export interface UserEconomySummary {
    enabled: boolean;
    uid: number;
    balance: string;
    balanceCents: number;
    points: number;
    experience: number;
    level: UserEconomyLevel;
    status: UserEconomyStatus;
    labels: {
        balance: string;
        points: string;
    };
    checkin: {
        enabled: boolean;
        checkedIn: boolean;
        streak: number;
        total: number;
        last: string;
        today: string;
        rewards: {
            experience: number;
            points: number;
            balanceCents: number;
            streak: number;
        };
    };
}

export interface UserEconomyEndpoints {
    enabled: boolean;
    checkinEnabled: boolean;
    summary: string;
    checkin: string;
    nonce: string;
    labels: {
        balance: string;
        points: string;
    };
}

export interface UserCaptchaConfig {
    enabled: boolean;
    provider: 'math' | 'slider' | 'geetest' | 'tencent' | 'aliyun' | string;
    scenes: string[];
    challenge: string;
    geetestId: string;
    tencentAppId: string;
    aliyunAppKey: string;
    aliyunScene: string;
}

export interface UserOperationsEndpoints {
    enabled: boolean;
    admin: boolean;
    home: string;
    overview: string;
    users: string;
    userUpdate: string;
    userStatus: string;
    nonce: string;
    labels: {
        balance: string;
        points: string;
    };
}

export interface UserApiEndpoints {
    enabled: boolean;
    centerEnabled: boolean;
    apiReady: boolean;
    admin: boolean;
    session: string;
    login: string;
    register: string;
    registerEnabled: boolean;
    registerVerify: boolean;
    smsVerify: boolean;
    smsCode: string;
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
    certificationEnabled: boolean;
    certification: string;
    certificationNonce: string;
    avatarMedia: string;
    avatarMediaEnabled: boolean;
    downloads: DownloadsClient;
    economy: UserEconomyEndpoints;
    captcha: UserCaptchaConfig;
    operations: UserOperationsEndpoints;
    pages: {
        profile: string;
        account: string;
        social: string;
        content: string;
        editor: string;
        space: string;
        downloads: string;
        operations: string;
    };
    content: {
        enabled: boolean;
        permitted: boolean;
        contents: string;
        item: string;
        posts: string;
        categories: string;
        comments: string;
        media: string;
        batch: string;
    };
    forum: UserForumEndpoints;
    mailConfigured: boolean;
    oauth: OAuthEndpoints;
}

export type UploadPurpose = 'article' | 'topic' | 'avatar' | 'background';

export interface UserForumContent {
    topics: ForumTopic[];
    circles: {
        joined: ForumCircle[];
        created: ForumCircle[];
    };
    stats: {
        topics: number;
        replies: number;
        joinedCircles: number;
        createdCircles: number;
    };
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
    background?: string;
    signature?: string;
    gender?: string;
    privacy?: string;
    location?: string;
    posts?: number;
    comments?: number;
    circles?: number;
    joinedCircles?: number;
    createdCircles?: number;
    canWrite?: boolean;
    certificationEnabled?: boolean;
    certification?: UserCertification | null;
}

export interface UserCertification {
    status: 'none' | 'pending' | 'approved' | 'rejected' | string;
    type: 'personal' | 'organization' | '' | string;
    name: string;
    note: string;
    reason: string;
    submitted: number;
    reviewed: number;
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
    slug?: string;
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
    nullImage: string;
    captcha: UserCaptchaConfig;
    apiEnabled: boolean;
    apiUrl: string;
    mediaEnabled: boolean;
    mediaEndpoint: string;
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
    viewerAvatar: string;
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
    /**
     * Position of this block inside the matching Blocks setting. Present when
     * the server rendered a settings-backed block; use it for the customizer
     * instead of the rendered array index, because empty blocks are skipped.
     */
    settingsIndex?: number;
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
    background: 'color' | 'image' | 'video';
    color: string;
    image: string;
    imageFit: 'cover' | 'contain' | 'fill';
    imageEffect: 'none' | 'fixed' | 'zoom' | 'pan';
    imagePosition: 'center' | 'top' | 'bottom' | 'left' | 'right';
    video: string;
    videoPoster: string;
    height: '' | 'sm' | 'md' | 'lg' | 'screen';
    overlay: number;
    align: 'left' | 'center';
    hot: string[];
    searchAction: string;
    searchPlaceholder: string;
    actions: { label: string; url: string; style: string }[];
    cards: HeroCard[];
    cardStyle: 'glass' | 'solid';
}

export interface HeroCard {
    title: string;
    text: string;
    url: string;
    badge: string;
}

export interface PostListBlock extends BlockBase {
    type: 'post-list';
    title: string;
    anchor?: string;
    category: string;
    source: 'articles' | 'forum' | 'mixed';
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
    searchLabel: string;
    searchScope: SearchScope | null;
}

export interface SearchScope {
    type: 'category' | 'tag';
    slug: string;
    label: string;
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
        likes: number;
        likesText: string;
        categories: PostCategory[];
    };
    share?: ShareConfig;
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
    share?: ShareConfig;
    layout: 'default' | 'wide' | 'narrow' | string;
    html: string;
    toc: boolean;
    tocTitle: string;
    codeCopy: boolean;
    download?: DownloadOffer | null;
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
    height: '' | 'sm' | 'md' | 'lg' | 'screen';
    overlay: number;
    align: 'left' | 'center';
}

export interface PostNavBlock extends BlockBase {
    type: 'post-nav';
    previousHtml: string;
    nextHtml: string;
}

export interface BreadcrumbItem {
    label: string;
    url?: string;
}

export interface BreadcrumbsBlock extends BlockBase {
    type: 'breadcrumbs';
    items: BreadcrumbItem[];
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

export interface PromoGridItem {
    title: string;
    text: string;
    image: string;
    url: string;
    badge: string;
}

export interface PromoGridBlock extends BlockBase {
    type: 'promo-grid';
    title: string;
    text: string;
    items: PromoGridItem[];
}

export interface PostTabsItem {
    label: string;
    url: string;
    posts: PostSummary[];
}

export interface PostTabsBlock extends BlockBase {
    type: 'post-tabs';
    title: string;
    text: string;
    columns: number;
    tabs: PostTabsItem[];
}

export interface AuthorGridItem {
    name: string;
    avatar: string;
    bio: string;
    url: string;
    badge: string;
    posts: number;
    comments: number;
}

export interface AuthorGridBlock extends BlockBase {
    type: 'author-grid';
    title: string;
    text: string;
    columns: number;
    items: AuthorGridItem[];
}

export interface ProductGridItem {
    title: string;
    text: string;
    image: string;
    price: string;
    originalPrice: string;
    badge: string;
    url: string;
}

export interface ProductGridBlock extends BlockBase {
    type: 'product-grid';
    title: string;
    text: string;
    columns: number;
    items: ProductGridItem[];
}

export interface LogoCloudItem {
    name: string;
    image: string;
    url: string;
}

export interface LogoCloudBlock extends BlockBase {
    type: 'logo-cloud';
    title: string;
    text: string;
    columns: number;
    items: LogoCloudItem[];
}

export interface HeadingBlock extends BlockBase {
    type: 'heading';
    eyebrow: string;
    title: string;
    text: string;
}

export interface ButtonGroupItem {
    label: string;
    url: string;
    style: string;
    icon: string;
}

export interface ButtonGroupBlock extends BlockBase {
    type: 'button-group';
    title: string;
    text: string;
    items: ButtonGroupItem[];
}

export interface InfoCardItem {
    icon: string;
    title: string;
    tag: string;
    text: string;
    url: string;
}

export interface InfoCardsBlock extends BlockBase {
    type: 'info-cards';
    title: string;
    text: string;
    columns: number;
    items: InfoCardItem[];
}

export interface PartnerScrollBlock extends BlockBase {
    type: 'partner-scroll';
    title: string;
    text: string;
    columns: number;
    speed: number;
    items: LogoCloudItem[];
}

export interface MediaSplitItem {
    kind: 'image' | 'video';
    title: string;
    text: string;
    media: string;
    poster: string;
    url: string;
}

export interface MediaSplitBlock extends BlockBase {
    type: 'media-split';
    title: string;
    text: string;
    kind: 'image' | 'video' | 'slides';
    media: string;
    poster: string;
    slides: CarouselSlide[];
    columns: number;
    items: MediaSplitItem[];
}

export interface PostAuthorBlock extends BlockBase {
    type: 'post-author';
    title: string;
    showAuthor: boolean;
    showPosts: boolean;
    author: AuthorGridItem;
    posts: PostSummary[];
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
    background: string;
    url: string;
    group: string;
    created: string;
    posts: number;
    comments: number;
    circles?: number;
    joinedCircles?: number;
    createdCircles?: number;
    canWrite: boolean;
    isSelf: boolean;
    privacy: string;
    detailsVisible: boolean;
    signature: string;
    gender: string;
    location: string;
    certificationEnabled?: boolean;
    certification?: UserCertification | null;
    editUrl?: string;
}

export interface UserSpaceComment {
    coid: number;
    postTitle: string;
    postUrl: string;
    url: string;
    excerpt: string;
    date: string;
    dateIso: string;
}

export interface UserSpaceBlock extends BlockBase {
    type: 'user-space';
    profile: UserSpaceProfile;
    posts: PostSummary[];
    comments: UserSpaceComment[];
    circles: {
        joined: ForumCircle[];
        created: ForumCircle[];
    };
}

export interface ForumViewer {
    uid: number;
    loggedIn: boolean;
    name: string;
    screenName: string;
    avatar: string;
    group: string;
    groupLabel: string;
    url?: string;
}

export interface ForumPermissions {
    createCircle: boolean;
    createTopic: boolean;
    reply: boolean;
    join: boolean;
    react: boolean;
    moderate: boolean;
}

export interface ForumEndpoints {
    circleCreate: string;
    circleUpdate: string;
    topicCreate: string;
    topicUpdate: string;
    topicDelete: string;
    moderation: string;
    replyCreate: string;
    join: string;
    react: string;
    rate: string;
}

export interface ForumTopicKind {
    value: string;
    label: string;
}

export interface ForumQuickReply {
    enabled: boolean;
    items: string[];
}

export interface ForumCreateCopy {
    title: string;
    text: string;
    hint: string;
    action: string;
}

export interface ForumConfig {
    title: string;
    displayName: string;
    description: string;
    notice: string;
    copy: {
        create: ForumCreateCopy;
    };
    share: ShareConfig;
    followLabel: string;
    joinToView: boolean;
    joinToPost: boolean;
    quickPost: boolean;
    urlMode: 'slug' | 'id';
    homeUrl: string;
    editorUrl: string;
    nonce: string;
    endpoints: ForumEndpoints;
    viewer: ForumViewer;
    permissions: ForumPermissions;
    topicKinds: ForumTopicKind[];
    quickReply: ForumQuickReply;
    canUseMedia: boolean;
    mediaEndpoint: string;
    nullImage: string;
    reportEmail: string;
    postPerPage: number;
}

export interface ForumCircle {
    id: number;
    name: string;
    slug: string;
    description: string;
    icon: string;
    background: string;
    url: string;
    topicCount: number;
    memberCount: number;
    ownerId: number;
    joined: boolean;
}

export interface ForumCircleRef {
    id: number;
    name: string;
    slug: string;
    url: string;
}

export interface ForumTopic {
    id: number;
    slug: string;
    title: string;
    status: 'publish' | 'waiting' | 'rejected' | string;
    deleted?: boolean;
    restricted?: boolean;
    url: string;
    excerpt: string;
    thumbnail: string;
    kind: string;
    kindLabel: string;
    tags: string[];
    pinned: boolean;
    featured: boolean;
    views: number;
    likes: number;
    favorites: number;
    comments: number;
    ratingScore: number;
    ratingAverage: number;
    ratingCount: number;
    ratingMine: number;
    ratingUsers?: ForumRater[];
    created: number;
    createdText: string;
    lastReplyText: string;
    circle: ForumCircleRef | null;
    author: ForumViewer;
    liked: boolean;
    favorited: boolean;
}

export interface ForumRater {
    uid: number;
    name: string;
    screenName: string;
    avatar: string;
    url: string;
    value: number;
}

export interface ForumReply {
    id: number;
    parentId: number;
    contentHtml: string;
    created: number;
    createdText: string;
    author: ForumViewer;
    children: ForumReply[];
}

export interface ForumPager {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
    nextUrl: string;
}

export interface ForumStats {
    circles: number;
    topics: number;
    replies: number;
    members: number;
    todayTopics: number;
}

export interface ForumAuthorRank {
    user: ForumViewer;
    topics: number;
}

export interface ForumHomeBlock extends BlockBase {
    type: 'forum-home';
    forum: ForumConfig;
    circles: ForumCircle[];
    topics: ForumTopic[];
    pager: ForumPager;
    hotCircles: ForumCircle[];
    hotTopics: ForumTopic[];
    stats: ForumStats;
    authors: ForumAuthorRank[];
}

export interface ForumCircleBlock extends BlockBase {
    type: 'forum-circle';
    forum: ForumConfig;
    circle: ForumCircle;
    topics: ForumTopic[];
    pager: ForumPager;
    hotCircles: ForumCircle[];
    hotTopics: ForumTopic[];
    stats: ForumStats;
}

export interface ForumTopicBlock extends BlockBase {
    type: 'forum-topic';
    restricted?: boolean;
    restrictedText?: string;
    forum: ForumConfig;
    topic: ForumTopic;
    circle: ForumCircle | null;
    breadcrumbs: BreadcrumbItem[];
    contentHtml: string;
    download?: DownloadOffer | null;
    replies: ForumReply[];
    replyCount: number;
    showAuthor: boolean;
    showAuthorTopics: boolean;
    authorTopics: ForumTopic[];
    hotCircles: ForumCircle[];
    hotTopics: ForumTopic[];
}

export interface ForumHomeHeaderBlock extends BlockBase {
    type: 'forum-home-header';
    title: string;
    showStats: boolean;
    showCreate: boolean;
    forum: ForumConfig;
    stats: ForumStats;
}

export interface ForumCircleGridBlock extends BlockBase {
    type: 'forum-circle-grid';
    title: string;
    limit: number;
    circles: ForumCircle[];
}

export interface ForumTopicListBlock extends BlockBase {
    type: 'forum-topic-list';
    title: string;
    emptyTitle: string;
    emptyText: string;
    showFilters: boolean;
    showSearch: boolean;
    limit: number;
    forum: ForumConfig;
    circle: ForumCircle | null;
    circles: ForumCircle[];
    topics: ForumTopic[];
    pager: ForumPager;
    stats: ForumStats;
}

export interface ForumCreateBlock extends BlockBase {
    type: 'forum-create';
    title: string;
    text: string;
    forum: ForumConfig;
}

export interface ForumCircleListBlock extends BlockBase {
    type: 'forum-circle-list';
    title: string;
    limit: number;
    circles: ForumCircle[];
}

export interface ForumNoticeBlock extends BlockBase {
    type: 'forum-notice';
    title: string;
    forum: ForumConfig;
}

export interface ForumAuthorsBlock extends BlockBase {
    type: 'forum-authors';
    title: string;
    limit: number;
    authors: ForumAuthorRank[];
}

export interface ForumCircleInfoBlock extends BlockBase {
    type: 'forum-circle-info';
    title: string;
    forum: ForumConfig;
    circle: ForumCircle;
}

export interface ForumJoinGateBlock extends BlockBase {
    type: 'forum-join-gate';
    variant: 'view' | 'post';
    forum: ForumConfig;
    circle: ForumCircle;
    title: string;
    text: string;
}

export interface ForumCircleHeroBlock extends BlockBase {
    type: 'forum-circle-hero';
    forum: ForumConfig;
    circle: ForumCircle;
    pager: ForumPager;
}

export interface ForumStatsBlock extends BlockBase {
    type: 'forum-stats';
    title: string;
    showCircle: boolean;
    stats: ForumStats;
    circle: ForumCircle | null;
}

export interface ForumHotCirclesBlock extends BlockBase {
    type: 'forum-hot-circles';
    title: string;
    limit: number;
    circles: ForumCircle[];
}

export interface ForumHotTopicsBlock extends BlockBase {
    type: 'forum-hot-topics';
    title: string;
    limit: number;
    topics: ForumTopic[];
}

export interface ForumLayout {
    left: Block[];
    right: Block[];
}

export interface ForumEditorCircle {
    id: number;
    name: string;
    slug: string;
    url: string;
    icon: string;
    background: string;
    description: string;
}

export interface ForumEditorGate {
    type: 'login' | 'denied' | 'no-circle';
    title: string;
    text: string;
}

export interface ForumEditorTopic {
    id: number;
    title: string;
    slug: string;
    content: string;
    kind: string;
    tags: string[];
    circleId: number;
    status: string;
    pinned: boolean;
    featured: boolean;
    url: string;
    download?: DownloadConfig;
}

export interface ForumEditorStatusOption {
    value: 'publish' | 'waiting' | 'rejected' | string;
    label: string;
}

export interface ForumEditorData {
    mode: 'forum-topic';
    isEdit: boolean;
    topic: ForumEditorTopic | null;
    gate: ForumEditorGate | null;
    circle: ForumEditorCircle | null;
    circles: ForumEditorCircle[];
    topicKinds: ForumTopicKind[];
    tagSuggestions: string[];
    showTagInput: boolean;
    downloadEnabled: boolean;
    paymentEnabled: boolean;
    requiresReview: boolean;
    displayName: string;
    maxLength: number;
    maxTitleLength: number;
    maxSlugLength: number;
    nonce: string;
    homeUrl: string;
    contentUrl: string;
    canCreateCircle: boolean;
    viewer: ForumViewer;
    permissions: ForumPermissions;
    canModerate: boolean;
    statusOptions: ForumEditorStatusOption[];
    canUseMedia: boolean;
    mediaEndpoint: string;
    endpoints: {
        topicCreate: string;
        topicUpdate: string;
        topicDelete: string;
    };
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
    | BreadcrumbsBlock
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
    | PromoGridBlock
    | PostTabsBlock
    | AuthorGridBlock
    | ProductGridBlock
    | LogoCloudBlock
    | HeadingBlock
    | ButtonGroupBlock
    | InfoCardsBlock
    | PartnerScrollBlock
    | MediaSplitBlock
    | PostAuthorBlock
    | PricingBlock
    | UserSpaceBlock
    | ForumHomeBlock
    | ForumCircleBlock
    | ForumTopicBlock
    | ForumHomeHeaderBlock
    | ForumCircleGridBlock
    | ForumTopicListBlock
    | ForumCreateBlock
    | ForumCircleListBlock
    | ForumNoticeBlock
    | ForumAuthorsBlock
    | ForumCircleInfoBlock
    | ForumJoinGateBlock
    | ForumCircleHeroBlock
    | ForumStatsBlock
    | ForumHotCirclesBlock
    | ForumHotTopicsBlock
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
        | 'operations'
        | 'user-space'
        | 'forum-home'
        | 'forum-circle'
        | 'forum-topic';
    userSection?: 'profile' | 'security' | 'social' | 'content' | 'downloads';
    userMode?: 'list' | 'editor';
    editorMode?: 'article' | 'forum-topic';
    forumEditor?: ForumEditorData;
    forumLayout?: ForumLayout;
    operationsEnabled?: boolean;
    site: SiteInfo;
    theme: ThemeOptions;
    api?: ApiEndpoints;
    blocks: Block[];
    widgets?: WidgetsData;
    allowComment?: boolean;
    title?: string;
    documentTitle?: string;
    canonical?: string;
    description?: string;
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
