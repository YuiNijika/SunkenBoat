<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Framework;
use TTDF\Http\Rest\Prefixes;
use TTDF\Theme\Assets;
use TTDF\Theme\Media;
use TTDF\Theme\Options;
use TTDF\Theme\Settings;
use TTDF\Theme\ThemeConfig;
use TTDF\View\Components;
use Widget\Archive;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Builds the JSON contract consumed by the React application.
 *
 * PHP never renders visible markup; it only exposes normalized site, page and
 * block data so the React layer can compose the interface.
 */
final class PageData
{
    private const BLOCK_PATTERN = '/^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$/';

    private const LAYOUT_MODULES = ['reading-progress', 'header', 'main', 'footer', 'action-rail'];

    private const SIDEBAR_MODULES = ['toc', 'site-card', 'recent-posts', 'categories', 'tags'];

    private const SIDEBAR_PAGES = ['home', 'archive', 'post', 'page'];

    /**
     * The hero and sidebar share the same small latest-post window.
     *
     * @var list<array<string, mixed>>|null
     */
    private static ?array $latestRows = null;

    /**
     * @var array<int, string>
     */
    private static array $thumbnailFields = [];

    /**
     * @var array<int, string>
     */
    private static array $defaultThumbnails = [];

    private static int $postViews = 0;

    /**
     * @param array<string, mixed> $data
     */
    public static function emit(array $data): void
    {
        echo Seo::fallback($data);

        $json = json_encode(
            $data,
            JSON_HEX_TAG
            | JSON_HEX_AMP
            | JSON_HEX_APOS
            | JSON_HEX_QUOT
            | JSON_UNESCAPED_UNICODE
            | JSON_UNESCAPED_SLASHES
            | JSON_INVALID_UTF8_SUBSTITUTE
            | JSON_THROW_ON_ERROR
        );

        echo '<script type="application/json" id="ttdf-app-data">' . $json . '</script>';
    }

    /**
     * @return array<string, mixed>
     */
    public static function home(Archive $archive): array
    {
        return self::buildPage('home', $archive);
    }

    /**
     * @return array<string, mixed>
     */
    public static function archive(Archive $archive): array
    {
        return self::buildPage('archive', $archive);
    }

    /**
     * @return array<string, mixed>
     */
    public static function post(Archive $archive): array
    {
        return self::buildPage('post', $archive);
    }

    /**
     * @return array<string, mixed>
     */
    public static function page(Archive $archive): array
    {
        return self::buildPage('page', $archive);
    }

    /**
     * @return array<string, mixed>
     */
    public static function notFound(Archive $archive): array
    {
        return self::buildPage('404', $archive);
    }

    /**
     * Page data for a custom TTDF route.
     *
     * @param list<array<string, mixed>> $blocks
     * @return array<string, mixed>
     */
    public static function custom(string $title, array $blocks, string $documentTitle = ''): array
    {
        return [
            'kind' => 'custom',
            'site' => self::site(null),
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => array_values(array_filter($blocks, 'is_array')),
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => $documentTitle !== '' ? $documentTitle : $title,
        ];
    }

    /**
     * Sidebar payload for the theme REST endpoints. The page shell can render
     * once from embedded data, then refresh these client-only widgets without
     * making the initial HTML depend on a second request.
     *
     * @return array{site: array<string, mixed>, widgets: array<string, mixed>}
     */
    public static function sidebarData(): array
    {
        return [
            'site' => self::siteCard(),
            'widgets' => self::widgets(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function siteCard(): array
    {
        $site = self::site(null);
        $site['nav'] = [];

        return $site;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function recentPostsData(): array
    {
        return self::recentPosts();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function categoriesData(): array
    {
        return self::categories();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public static function tagsData(): array
    {
        return self::tagCloud();
    }

    /**
     * @return array<string, int>
     */
    public static function statsData(): array
    {
        return self::stats();
    }

    /**
     * @return array<string, mixed>
     */
    private static function buildPage(string $kind, Archive $archive): array
    {
        if ($kind === 'post') {
            self::$postViews = ArticleViews::record((int) ($archive->cid ?? 0));
        }

        return [
            'kind' => $kind,
            'site' => self::site($archive),
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => self::blocks($kind, $archive),
            'widgets' => self::widgets(),
            'allowComment' => in_array($kind, ['post', 'page'], true)
                ? $archive->allow('comment')
                : false,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function blocks(string $kind, Archive $archive): array
    {
        $values = Settings::values();
        $defaults = self::defaultBlocks($kind);
        $specs = self::normalizeSpecs($values[self::settingKey($kind)] ?? null, $defaults);
        $cache = [];
        $blocks = [];

        foreach ($specs as $spec) {
            if (
                $spec['name'] === 'comments'
                && in_array($kind, ['post', 'page'], true)
                && !$archive->allow('comment')
            ) {
                continue;
            }

            $block = self::makeBlock($spec, $kind, $archive, $cache);
            if ($block !== null) {
                $blocks[] = $block;
            }
        }

        return $blocks;
    }

    private static function settingKey(string $kind): string
    {
        return match ($kind) {
            'home' => 'Home_Blocks',
            'archive' => 'Archive_Blocks',
            'post' => 'Post_Blocks',
            'page' => 'Page_Blocks',
            '404' => 'NotFound_Blocks',
            default => 'Home_Blocks',
        };
    }

    /**
     * @return list<string>
     */
    private static function defaultBlocks(string $kind): array
    {
        return match ($kind) {
            'home' => ['hero', 'carousel', 'post-list:list', 'categories'],
            'archive' => ['archive-header', 'post-list:list'],
            'post' => ['prose', 'tags', 'post-nav', 'comments'],
            'page' => ['page-header', 'prose', 'comments'],
            '404' => ['notfound', 'search'],
            default => ['page-header', 'prose'],
        };
    }

    /**
     * @param mixed $value
     * @param list<string> $defaults
     * @return list<array{name: string, variant: string, data: array<string, mixed>}>
     */
    private static function normalizeSpecs(mixed $value, array $defaults): array
    {
        $items = is_array($value) ? $value : [];
        $specs = [];

        foreach ($items as $item) {
            $spec = self::normalizeSpec($item);
            if ($spec !== null) {
                $specs[] = $spec;
            }
        }

        if ($specs !== []) {
            return $specs;
        }

        foreach ($defaults as $fallback) {
            $spec = self::normalizeSpec($fallback);
            if ($spec !== null) {
                $specs[] = $spec;
            }
        }

        return $specs;
    }

    /**
     * @return array{name: string, variant: string, data: array<string, mixed>}|null
     */
    private static function normalizeSpec(mixed $item): ?array
    {
        if (is_string($item)) {
            $parts = explode(':', trim($item), 2);
            $name = trim($parts[0]);
            $variant = isset($parts[1]) ? trim($parts[1]) : '';
            $data = [];
        } elseif (is_array($item)) {
            $name = trim((string) ($item['name'] ?? ($item['block'] ?? '')));
            $variant = trim((string) ($item['variant'] ?? ''));
            $data = isset($item['data']) && is_array($item['data']) ? $item['data'] : [];
        } else {
            return null;
        }

        if (preg_match(self::BLOCK_PATTERN, $name) !== 1) {
            return null;
        }

        if ($variant !== '' && preg_match(self::BLOCK_PATTERN, $variant) !== 1) {
            return null;
        }

        return ['name' => $name, 'variant' => $variant, 'data' => $data];
    }

    /**
     * @param array{name: string, variant: string, data: array<string, mixed>} $spec
     * @param array<string, mixed> $cache
     * @return array<string, mixed>|null
     */
    private static function makeBlock(array $spec, string $kind, Archive $archive, array &$cache): ?array
    {
        $type = $spec['name'];
        $variant = $spec['variant'];
        $data = $spec['data'];

        return match ($type) {
            'hero' => self::heroBlock($archive, $variant, $data),
            'carousel' => self::carouselBlock($variant, $data),
            'post-list' => self::postListBlock($kind, $archive, $variant, $cache, $data),
            'categories' => self::categoriesBlock($variant, $cache, $data),
            'archive-header' => self::archiveHeaderBlock($archive, $data),
            'post-header' => null,
            'page-header' => self::pageHeaderBlock($archive, $variant, $data),
            'prose' => self::proseBlock($archive, $cache, $data, $kind),
            'tags' => self::tagsBlock($archive, $cache, $data),
            'post-nav' => self::postNavBlock($archive, $cache),
            'comments' => self::commentsBlock($archive, $kind, $cache, $data),
            'notfound' => self::notFoundBlock($archive, $data),
            'search' => self::searchBlock($archive, $variant, $data),
            'cta' => self::ctaBlock($data),
            'link-list' => null,
            'divider' => ['type' => 'divider', 'variant' => $variant !== '' ? $variant : 'default'],
            'spacer' => ['type' => 'spacer', 'variant' => $variant !== '' ? $variant : 'md'],
            default => null,
        };
    }

    /**
     * @return array<string, mixed>
     */
    private static function heroBlock(Archive $archive, string $variant, array $data): array
    {
        $site = self::site($archive);
        $lead = $site['subtitle'] !== '' ? $site['subtitle'] : $site['description'];
        $primaryLabel = self::text($data, 'primary_label', '浏览文章');
        $primaryUrl = self::text($data, 'primary_url', '#latest');
        $secondaryLabel = self::text($data, 'secondary_label', 'RSS 订阅');
        $secondaryUrl = self::text($data, 'secondary_url', $site['feedUrl']);
        $actions = [];

        if ($primaryLabel !== '' && $primaryUrl !== '') {
            $actions[] = ['label' => $primaryLabel, 'url' => $primaryUrl, 'style' => 'primary'];
        }

        if ($secondaryLabel !== '' && $secondaryUrl !== '') {
            $actions[] = ['label' => $secondaryLabel, 'url' => $secondaryUrl, 'style' => 'ghost'];
        }

        return [
            'type' => 'hero',
            'variant' => $variant !== '' ? $variant : 'default',
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', $site['title']),
            'lead' => self::text($data, 'lead', $lead),
            'searchAction' => $site['url'],
            'searchPlaceholder' => self::text($data, 'search_placeholder', '输入关键词搜索站内文章…'),
            'actions' => $actions,
            'featured' => self::featuredPost($site['url']),
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function postListBlock(string $kind, Archive $archive, string $variant, array &$cache, array $data = []): array
    {
        $category = trim((string) ($data['category'] ?? ''));
        $cacheKey = $category === '' ? 'posts' : 'posts:' . $category;
        $paginationKey = $category === '' ? 'pagination' : 'pagination:' . $category;

        return [
            'type' => 'post-list',
            'variant' => $variant !== '' ? $variant : 'list',
            'title' => self::text($data, 'title', $kind === 'home' ? '最新文章' : ''),
            'category' => $category,
            'posts' => self::cached(
                $cache,
                $cacheKey,
                static fn (): array => $category !== ''
                    ? self::postSummariesByCategory($category)
                    : self::postSummaries($archive)
            ),
            'paginationHtml' => $category !== ''
                ? ''
                : self::cached($cache, $paginationKey, static fn (): string => self::pagination($archive)),
            'empty' => self::text($data, 'empty', $kind === 'home' ? '这里还没有文章。' : '没有找到内容。'),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function carouselBlock(string $variant, array $data = []): ?array
    {
        $slides = isset($data['slides']) && is_array($data['slides']) ? $data['slides'] : [];
        $slides = array_values(array_filter($slides, static function (mixed $slide): bool {
            if (!is_array($slide)) {
                return false;
            }

            return trim((string) ($slide['image'] ?? '')) !== ''
                || trim((string) ($slide['title'] ?? '')) !== ''
                || trim((string) ($slide['description'] ?? '')) !== '';
        }));

        if ($slides === []) {
            return null;
        }

        return [
            'type' => 'carousel',
            'variant' => $variant !== '' ? $variant : 'default',
            'title' => self::text($data, 'title', ''),
            'slides' => array_map(static fn (array $slide): array => [
                'image' => (string) ($slide['image'] ?? ''),
                'title' => (string) ($slide['title'] ?? ''),
                'description' => (string) ($slide['description'] ?? ''),
                'url' => (string) ($slide['url'] ?? ''),
            ], $slides),
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function categoriesBlock(string $variant, array &$cache, array $data = []): array
    {
        return [
            'type' => 'categories',
            'variant' => $variant !== '' ? $variant : 'grid',
            'title' => self::text($data, 'title', '分类'),
            'items' => self::cached($cache, 'categories', static fn (): array => self::categories()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function archiveHeaderBlock(Archive $archive, array $data = []): array
    {
        $title = self::archiveTitle($archive);

        return [
            'type' => 'archive-header',
            'title' => self::text($data, 'title', $title !== '' ? $title : '归档'),
            'description' => self::text($data, 'description', self::archiveDescription($archive)),
            'count' => is_callable([$archive, 'getTotal']) ? (int) $archive->getTotal() : 0,
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function postHeaderBlock(Archive $archive, array &$cache): array
    {
        return [
            'type' => 'post-header',
            'title' => (string) ($archive->title ?? ''),
            'meta' => self::cached($cache, 'postMeta', static fn (): array => self::postMeta($archive)),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function pageHeaderBlock(Archive $archive, string $variant, array $data = []): array
    {
        return [
            'type' => 'page-header',
            'variant' => $variant !== '' ? $variant : 'default',
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => (string) ($archive->title ?? ''),
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function proseBlock(Archive $archive, array &$cache, array $data = [], string $kind = 'page'): array
    {
        $theme = self::theme();
        $meta = $kind === 'post'
            ? self::cached($cache, 'postMeta', static fn (): array => self::postMeta($archive))
            : null;

        return [
            'type' => 'prose',
            'title' => $kind === 'post' ? (string) ($archive->title ?? '') : '',
            'meta' => $meta,
            'html' => self::cached($cache, 'content', static fn (): string => self::content($archive)),
            'toc' => $theme['showToc'],
            'tocTitle' => self::text($data, 'toc_title', '本页目录'),
            'codeCopy' => true,
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function tagsBlock(Archive $archive, array &$cache, array $data = []): array
    {
        return [
            'type' => 'tags',
            'title' => self::text($data, 'title', '标签'),
            'items' => self::cached($cache, 'tags', static fn (): array => self::tags($archive)),
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function postNavBlock(Archive $archive, array &$cache): array
    {
        $nav = self::cached($cache, 'postNav', static fn (): array => self::postNav($archive));

        return [
            'type' => 'post-nav',
            'previousHtml' => $nav['previous'],
            'nextHtml' => $nav['next'],
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>|null
     */
    private static function commentsBlock(
        Archive $archive,
        string $kind,
        array &$cache,
        array $overrides = []
    ): ?array
    {
        if (!in_array($kind, ['post', 'page'], true) || !$archive->allow('comment')) {
            return null;
        }

        $comments = self::cached($cache, 'comments', static fn (): ?array => self::comments($archive));
        if ($comments === null) {
            return null;
        }

        $comments['title'] = self::text($overrides, 'title', '评论');

        return [
            'type' => 'comments',
            'data' => $comments,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function notFoundBlock(Archive $archive, array $data = []): array
    {
        $site = self::site($archive);

        return [
            'type' => 'notfound',
            'title' => self::text($data, 'title', '这里没有内容'),
            'text' => self::text($data, 'text', '地址可能已经改变，或者这篇内容被移到了别处。'),
            'action' => [
                'label' => self::text($data, 'action_label', '返回首页'),
                'url' => self::text($data, 'action_url', $site['url']),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function searchBlock(Archive $archive, string $variant, array $data = []): array
    {
        $site = self::site($archive);

        return [
            'type' => 'search',
            'variant' => $variant !== '' ? $variant : 'default',
            'title' => self::text($data, 'title', '搜索站内文章'),
            'action' => $site['url'],
            'placeholder' => self::text($data, 'placeholder', '输入关键词'),
            'buttonLabel' => self::text($data, 'button_label', '搜索'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function ctaBlock(array $data = []): array
    {
        $site = self::site(null);

        return [
            'type' => 'cta',
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', '订阅更新'),
            'text' => self::text($data, 'text', '在 RSS 阅读器里跟进最新内容。'),
            'action' => [
                'label' => self::text($data, 'action_label', 'RSS 订阅'),
                'url' => self::text($data, 'action_url', $site['feedUrl']),
            ],
        ];
    }

    /**
     * Read a custom-data value with a fallback; blank overrides keep the
     * built-in default so a half-filled block never renders an empty slot.
     *
     * @param array<string, mixed> $data
     */
    private static function text(array $data, string $key, string $fallback): string
    {
        $value = $data[$key] ?? null;
        if (!is_string($value)) {
            return $fallback;
        }

        $value = trim($value);

        return $value !== '' ? $value : $fallback;
    }

    /**
     * @return array<string, mixed>
     */
    private static function site(?Archive $archive): array
    {
        $options = Typecho::options();
        $siteUrl = Typecho::siteUrl();
        $values = Settings::values();
        $showTitle = ($values['Show_Title'] ?? true) === true;
        $currentUrl = self::currentUrl($archive);
        $home = [
            'label' => '首页',
            'url' => $siteUrl,
            'active' => $archive !== null && is_callable([$archive, 'is']) && $archive->is('index'),
        ];
        $nav = [$home];

        $customNav = isset($values['Nav_Items']) && is_array($values['Nav_Items'])
            ? $values['Nav_Items']
            : [];

        if ($customNav !== []) {
            $nav = [];
            foreach ($customNav as $item) {
                if (!is_array($item)) {
                    continue;
                }

                $children = [];
                foreach (($item['children'] ?? []) as $child) {
                    if (!is_array($child)) {
                        continue;
                    }
                    $children[] = [
                        'label' => (string) ($child['label'] ?? ''),
                        'url' => (string) ($child['url'] ?? ''),
                        'active' => self::navActive((string) ($child['url'] ?? ''), $currentUrl),
                    ];
                }

                $nav[] = [
                    'label' => (string) ($item['label'] ?? ''),
                    'url' => (string) ($item['url'] ?? ''),
                    'active' => self::navActive((string) ($item['url'] ?? ''), $currentUrl),
                    'children' => $children,
                ];
            }
        } else {
            \Widget\Contents\Page\Rows::alloc()->to($navPages);
            while ($navPages->next()) {
                $nav[] = [
                    'label' => (string) $navPages->title,
                    'url' => (string) $navPages->permalink,
                    'active' => $archive !== null
                        && is_callable([$archive, 'is'])
                        && $archive->is('page', $navPages->slug),
                ];
            }
        }

        return [
            'title' => trim((string) ($options?->title ?? '')),
            'description' => trim((string) ($options?->description ?? '')),
            'url' => $siteUrl,
            'feedUrl' => trim((string) ($options?->feedUrl ?? '')),
            'logo' => Media::url((string) Options::instance()->get('Logo', '')),
            'subtitle' => trim((string) ($values['SubTitle'] ?? '')),
            'footerText' => trim((string) ($values['FooterText'] ?? '')),
            'showTitle' => $showTitle,
            'nav' => $nav,
            'year' => (int) date('Y'),
            'frameworkVersion' => Framework::VERSION,
            'themeVersion' => Typecho::themeVersion(),
        ];
    }

    private static function currentUrl(?Archive $archive): string
    {
        if ($archive !== null && is_callable([$archive, 'is']) && !$archive->is('index')) {
            $type = $archive->type ?? null;
            if (!is_string($type) || $type === '') {
                // Search and 404 archives have no routing type; asking for
                // their permalink would call Router::url(null).
                return Typecho::siteUrl();
            }

            $permalink = trim((string) ($archive->permalink ?? ''));
            if ($permalink !== '') {
                return $permalink;
            }
        }

        return Typecho::siteUrl();
    }

    private static function navActive(string $url, string $currentUrl): bool
    {
        $url = trim($url);
        if ($url === '' || str_starts_with($url, '#')) {
            return false;
        }

        $urlPath = (string) parse_url($url, PHP_URL_PATH);
        $currentPath = (string) parse_url($currentUrl, PHP_URL_PATH);
        if ($urlPath !== '' && $currentPath !== '') {
            return rtrim($urlPath, '/') === rtrim($currentPath, '/');
        }

        return rtrim($url, '/') === rtrim($currentUrl, '/');
    }

    /**
     * @return array<string, mixed>
     */
    private static function theme(): array
    {
        $values = Settings::values();
        $sidebarPosition = (string) ($values['Sidebar_Position'] ?? 'right');
        $footerLayout = (string) ($values['Footer_Layout'] ?? 'columns');

        return [
            'colorMode' => (string) ($values['Color_Mode'] ?? 'auto'),
            'showToc' => ($values['Show_Toc'] ?? true) === true,
            'showReadingProgress' => ($values['Show_ReadingProgress'] ?? true) === true,
            'showSidebar' => ($values['Show_Sidebar'] ?? true) === true,
            'sidebarPages' => self::sidebarPages($values['Sidebar_Pages'] ?? null),
            'sidebarModules' => self::sidebarModules($values['Sidebar_Modules'] ?? null),
            'showUserCenter' => ($values['Show_UserCenter'] ?? true) === true,
            'sidebarPosition' => in_array($sidebarPosition, ['left', 'right'], true)
                ? $sidebarPosition
                : 'right',
            'sidebarSticky' => ($values['Sidebar_Sticky'] ?? true) === true,
            'footerLayout' => in_array($footerLayout, ['columns', 'compact', 'centered'], true)
                ? $footerLayout
                : 'columns',
            'footerShowCategories' => ($values['Footer_Show_Categories'] ?? true) === true,
            'footerShowTags' => ($values['Footer_Show_Tags'] ?? true) === true,
            'layoutModules' => self::layoutModules($values['Layout_Modules'] ?? null),
        ];
    }

    /**
     * @return list<string>
     */
    private static function sidebarPages(mixed $value): array
    {
        if (!is_array($value)) {
            return self::SIDEBAR_PAGES;
        }

        $pages = [];
        foreach ($value as $page) {
            if (is_string($page) && in_array($page, self::SIDEBAR_PAGES, true)) {
                $pages[] = $page;
            }
        }

        return array_values(array_unique($pages));
    }

    /**
     * @return list<string>
     */
    private static function sidebarModules(mixed $value): array
    {
        $items = is_array($value) ? $value : [];
        $modules = [];

        foreach ($items as $item) {
            $name = is_string($item)
                ? $item
                : (is_array($item) ? (string) ($item['name'] ?? '') : '');

            if (in_array($name, self::SIDEBAR_MODULES, true) && !in_array($name, $modules, true)) {
                $modules[] = $name;
            }
        }

        return $modules !== [] ? $modules : self::SIDEBAR_MODULES;
    }

    /**
     * @return list<string>
     */
    private static function layoutModules(mixed $value): array
    {
        $items = is_array($value) ? $value : [];
        $modules = [];

        foreach ($items as $item) {
            $name = is_string($item)
                ? $item
                : (is_array($item) ? (string) ($item['name'] ?? '') : '');

            if (in_array($name, self::LAYOUT_MODULES, true) && !in_array($name, $modules, true)) {
                $modules[] = $name;
            }
        }

        if ($modules === []) {
            $modules = self::LAYOUT_MODULES;
        }

        if (!in_array('main', $modules, true)) {
            $modules[] = 'main';
        }

        return $modules;
    }

    /**
     * The v2 surface is preferred for same-origin theme requests because its
     * public extension routes do not require the optional v1 bearer token.
     * When v2 is off, fall back to v1 only while its token switch is off.
     *
     * @return array<string, mixed>
     */
    private static function api(): array
    {
        $index = Typecho::indexUrl();
        if ($index === '') {
            $index = Typecho::siteUrl();
        }

        $base = rtrim($index, '/') . '/ttdf/sunken';
        $v2Base = rtrim($index, '/') . '/' . Prefixes::v2();

        return [
            'enabled' => true,
            'base' => $base,
            'sidebar' => $base . '/sidebar',
            'site' => $base . '/site',
            'categories' => $base . '/categories',
            'posts' => $base . '/posts',
            'tags' => $base . '/tags',
            'stats' => $base . '/stats',
            'user' => [
                'enabled' => ThemeConfig::restV2Enabled(),
                'session' => $v2Base . '/auth/session',
                'login' => $v2Base . '/auth/login',
                'logout' => $v2Base . '/auth/logout',
                'me' => $v2Base . '/me',
            ],
        ];
    }

    /**
     * Sidebar payload: recent posts, the category list, the tag cloud and the
     * counters shown in the site card.
     *
     * @return array<string, mixed>
     */
    private static function widgets(): array
    {
        $cache = [];

        return [
            'recent' => self::recentPosts(),
            'categories' => self::cached($cache, 'categories', static fn (): array => self::categories()),
            'tags' => self::tagCloud(),
            'stats' => self::stats(),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function recentPosts(): array
    {
        $items = [];
        $siteUrl = Typecho::siteUrl();
        $rows = self::latestPostRows(6);
        self::primeThumbnailFields(array_map(
            static fn (array $post): int => (int) ($post['cid'] ?? 0),
            $rows
        ));
        $views = ArticleViews::counts(array_map(
            static fn (array $post): int => (int) ($post['cid'] ?? 0),
            $rows
        ));

        foreach ($rows as $post) {
            $cid = (int) ($post['cid'] ?? 0);
            $items[] = [
                'title' => trim((string) ($post['title'] ?? '')),
                'url' => self::postUrl($post),
                'date' => self::postDate($post, 'm-d'),
                'thumb' => self::thumbnail($cid, (string) ($post['text'] ?? ''), $siteUrl),
                'comments' => (int) ($post['commentsNum'] ?? 0),
                'views' => $views[$cid] ?? 0,
            ];
        }

        return $items;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function featuredPost(string $siteUrl): ?array
    {
        $rows = self::latestPostRows(1);
        $post = $rows[0] ?? null;
        if (!is_array($post)) {
            return null;
        }

        $text = (string) ($post['text'] ?? '');
        $cid = (int) ($post['cid'] ?? 0);
        self::primeThumbnailFields([$cid]);

        return [
            'title' => trim((string) ($post['title'] ?? '')),
            'url' => self::postUrl($post),
            'excerpt' => self::excerpt($post, $text, 120),
            'date' => self::postDate($post, 'Y-m-d'),
            'thumb' => self::thumbnail($cid, $text, $siteUrl),
            'comments' => (int) ($post['commentsNum'] ?? 0),
            'readingTime' => self::readingMinutes($text),
            'views' => ArticleViews::count($cid),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function latestPostRows(int $limit): array
    {
        if (self::$latestRows === null) {
            self::$latestRows = [];

            if (class_exists('Typecho\\Db')) {
                try {
                    $db = \Typecho\Db::get();
                    $options = Typecho::options();
                    $now = (int) ($options?->time ?? time());
                    $select = $db->select(
                        'table.contents.cid',
                        'table.contents.title',
                        'table.contents.slug',
                        'table.contents.created',
                        'table.contents.text',
                        'table.contents.commentsNum'
                    )
                        ->from('table.contents')
                        ->where('table.contents.status = ?', 'publish')
                        ->where('table.contents.type = ?', 'post')
                        ->where('table.contents.created < ?', $now)
                        ->order('table.contents.created', \Typecho\Db::SORT_DESC)
                        ->limit(12);

                    $rows = $db->fetchAll($select);
                    self::$latestRows = array_values(array_filter($rows, 'is_array'));
                } catch (\Throwable) {
                    self::$latestRows = [];
                }
            }
        }

        return array_slice(self::$latestRows, 0, max(0, $limit));
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function postUrl(array $post): string
    {
        try {
            $path = (string) \Typecho\Router::url('post', [
                'cid' => (int) ($post['cid'] ?? 0),
                'slug' => (string) ($post['slug'] ?? ''),
            ]);
            $options = Typecho::options();
            $index = is_scalar($options?->index ?? null) ? (string) $options->index : '';

            return \Typecho\Common::url($path, $index);
        } catch (\Throwable) {
            return '#';
        }
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function postDate(array $post, string $format): string
    {
        try {
            return (new \Typecho\Date((int) ($post['created'] ?? 0)))->format($format);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * @param array<string, mixed> $post
     */
    private static function excerpt(array $post, string $text, int $length): string
    {
        $excerpt = trim(strip_tags((string) ($post['excerpt'] ?? '')));
        if ($excerpt === '') {
            $excerpt = trim(strip_tags($text));
        }

        $excerpt = trim((string) preg_replace('/\s+/u', ' ', $excerpt));

        return $excerpt !== '' ? \Typecho\Common::subStr($excerpt, 0, $length, '…') : '';
    }

    private static function readingMinutes(string $text): int
    {
        $plain = trim((string) preg_replace('/\s+/u', ' ', strip_tags($text)));

        return max(1, (int) ceil(mb_strlen($plain, 'UTF-8') / 500));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function tagCloud(): array
    {
        if (!class_exists('Widget\\Metas\\Tag\\Cloud')) {
            return [];
        }

        $items = [];
        \Widget\Metas\Tag\Cloud::alloc('limit=24')->to($tags);

        while ($tags->next()) {
            $items[] = [
                'label' => (string) ($tags->name ?? ''),
                'url' => (string) ($tags->permalink ?? ''),
                'count' => (int) ($tags->count ?? 0),
            ];
        }

        return $items;
    }

    /**
     * Counters come from the Typecho query builder so the sidebar never needs
     * a table of its own.
     *
     * @return array<string, int>
     */
    private static function stats(): array
    {
        $stats = ['posts' => 0, 'comments' => 0, 'categories' => 0, 'tags' => 0];

        if (!class_exists('Typecho\\Db')) {
            return $stats;
        }

        try {
            $db = \Typecho\Db::get();

            $query = static function (string $table, array $conditions) use ($db): int {
                $select = $db->select(['COUNT(*)' => 'num'])->from($table);

                foreach ($conditions as $column => $value) {
                    $select->where($column . ' = ?', $value);
                }

                $row = $db->fetchObject($select);

                return $row !== null && isset($row->num) ? (int) $row->num : 0;
            };

            $stats['posts'] = $query('table.contents', ['type' => 'post', 'status' => 'publish']);
            $stats['comments'] = $query('table.comments', ['status' => 'approved']);
            $stats['categories'] = $query('table.metas', ['type' => 'category']);
            $stats['tags'] = $query('table.metas', ['type' => 'tag']);
        } catch (\Throwable) {
            return $stats;
        }

        return $stats;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function postSummaries(Archive $archive): array
    {
        $posts = [];
        $cids = [];
        $siteUrl = Typecho::siteUrl();

        while ($archive->next()) {
            $text = self::rowText($archive);
            $excerpt = trim(strip_tags((string) ($archive->excerpt ?? '')));
            $excerpt = trim((string) preg_replace('/\s+/u', ' ', $excerpt));
            if ($excerpt !== '') {
                $excerpt = \Typecho\Common::subStr($excerpt, 0, 120, '…');
            }

            $cid = (int) ($archive->cid ?? 0);
            $cids[] = $cid;
            $posts[] = [
                'title' => (string) ($archive->title ?? ''),
                'url' => self::archivePostUrl($archive),
                'excerpt' => $excerpt,
                'date' => self::capture(static fn () => $archive->date('Y-m-d')),
                'dateIso' => self::capture(static fn () => $archive->date('c')),
                'thumb' => self::thumbnail($cid, $text, $siteUrl),
                'author' => self::capture(static fn () => $archive->author()),
                'comments' => (int) ($archive->commentsNum ?? 0),
                'readingTime' => self::readingMinutes($text),
                'categories' => self::categoriesOf($archive),
                'tags' => self::tagsOf($archive),
            ];
        }

        $views = ArticleViews::counts($cids);
        foreach ($posts as $index => $post) {
            $posts[$index]['views'] = $views[$cids[$index] ?? 0] ?? 0;
        }

        return $posts;
    }

    /**
     * Search archives can expose a null `type`, and Typecho's `permalink`
     * accessor passes that straight into Router::url(). Build the canonical
     * URL from cid/slug instead so search and filtered archives stay safe.
     */
    private static function archivePostUrl(Archive $archive): string
    {
        try {
            $cid = (int) ($archive->cid ?? 0);
            $slug = (string) ($archive->slug ?? '');
            $type = $archive->type ?? 'post';
            $name = is_string($type) && in_array($type, ['post', 'page'], true) ? $type : 'post';

            if ($cid <= 0) {
                return '';
            }

            $path = (string) \Typecho\Router::url($name, [
                'cid' => $cid,
                'slug' => $slug,
            ]);
            $options = Typecho::options();
            $index = is_scalar($options?->index ?? null) ? (string) $options->index : '';

            return \Typecho\Common::url($path, $index);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * Query a specific category without mutating the current Typecho archive.
     * The settings field stores a category slug; numeric input is accepted as
     * a legacy mid so old saved values keep working.
     *
     * @return list<array<string, mixed>>
     */
    private static function postSummariesByCategory(string $category): array
    {
        if (!class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $meta = $db->fetchRow(
                $db->select('mid', 'name', 'slug')
                    ->from('table.metas')
                    ->where('type = ?', 'category')
                    ->where('slug = ?', $category)
                    ->limit(1)
            );

            if (!is_array($meta) && ctype_digit($category)) {
                $meta = $db->fetchRow(
                    $db->select('mid', 'name', 'slug')
                        ->from('table.metas')
                        ->where('type = ?', 'category')
                        ->where('mid = ?', (int) $category)
                        ->limit(1)
                );
            }

            if (!is_array($meta)) {
                return [];
            }

            $cidRows = $db->fetchAll(
                $db->select('cid')
                    ->from('table.relationships')
                    ->where('mid = ?', (int) ($meta['mid'] ?? 0))
            );
            $cids = [];
            foreach ($cidRows as $cidRow) {
                $cid = (int) ($cidRow['cid'] ?? 0);
                if ($cid > 0) {
                    $cids[] = $cid;
                }
            }

            if ($cids === []) {
                return [];
            }

            $options = Typecho::options();
            $now = (int) ($options?->time ?? time());
            $rows = $db->fetchAll(
                $db->select('cid', 'title', 'slug', 'created', 'text', 'commentsNum', 'authorId')
                    ->from('table.contents')
                    ->where('type = ?', 'post')
                    ->where('status = ?', 'publish')
                    ->where('created < ?', $now)
                    ->where('password = ?', '')
                    ->where('cid IN ?', $cids)
                    ->order('created', \Typecho\Db::SORT_DESC)
                    ->limit(12)
            );

            $siteUrl = Typecho::siteUrl();
            $items = [];
            $views = ArticleViews::counts(array_map(
                static fn (array $row): int => (int) ($row['cid'] ?? 0),
                array_values(array_filter($rows, 'is_array'))
            ));
            self::primeThumbnailFields(array_map(
                static fn (array $row): int => (int) ($row['cid'] ?? 0),
                array_values(array_filter($rows, 'is_array'))
            ));
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $text = (string) ($row['text'] ?? '');
                $cid = (int) ($row['cid'] ?? 0);
                $items[] = [
                    'title' => trim((string) ($row['title'] ?? '')),
                    'url' => self::postUrl($row),
                    'excerpt' => self::excerpt($row, $text, 120),
                    'date' => self::postDate($row, 'Y-m-d'),
                    'dateIso' => self::postDate($row, 'c'),
                    'thumb' => self::thumbnail($cid, $text, $siteUrl),
                    'author' => self::authorName((int) ($row['authorId'] ?? 0)),
                    'comments' => (int) ($row['commentsNum'] ?? 0),
                    'readingTime' => self::readingMinutes($text),
                    'categories' => self::termsOfCid($cid, 'category'),
                    'tags' => self::termsOfCid($cid, 'tag'),
                    'views' => $views[$cid] ?? 0,
                ];
            }

            return $items;
        } catch (\Throwable $exception) {
            error_log('TTDF category post lookup failed: ' . $exception->getMessage());

            return [];
        }
    }

    private static function authorName(int $uid): string
    {
        if ($uid <= 0 || !class_exists('Typecho\\Db')) {
            return '';
        }

        try {
            $db = \Typecho\Db::get();
            $row = $db->fetchRow(
                $db->select('screenName', 'name')
                    ->from('table.users')
                    ->where('uid = ?', $uid)
                    ->limit(1)
            );

            return is_array($row)
                ? trim((string) ($row['screenName'] ?? $row['name'] ?? ''))
                : '';
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * @return list<array{label: string, url: string}>
     */
    private static function termsOfCid(int $cid, string $type): array
    {
        if ($cid <= 0 || !in_array($type, ['category', 'tag'], true)) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $rows = $db->fetchAll(
                $db->select('table.metas.mid', 'table.metas.name', 'table.metas.slug')
                    ->from('table.relationships')
                    ->join('table.metas', 'table.metas.mid = table.relationships.mid')
                    ->where('table.relationships.cid = ?', $cid)
                    ->where('table.metas.type = ?', $type)
            );

            $items = [];
            $options = Typecho::options();
            $index = is_scalar($options?->index ?? null) ? (string) $options->index : '';
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $path = \Typecho\Router::url($type, [
                    'mid' => (int) ($row['mid'] ?? 0),
                    'slug' => (string) ($row['slug'] ?? ''),
                ]);
                $items[] = [
                    'label' => (string) ($row['name'] ?? ''),
                    'url' => \Typecho\Common::url((string) $path, $index),
                ];
            }

            return $items;
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Resolve a card thumbnail in this order: the explicit Thumbnail field,
     * the first body image when enabled, the configured default, then the
     * bundled placeholder. A card therefore never renders an empty image.
     */
    private static function thumbnail(int $cid, string $text, string $siteUrl): string
    {
        $fieldUrl = self::resolveThumbnailUrl(self::thumbnailField($cid), $siteUrl);
        if ($fieldUrl !== '') {
            return $fieldUrl;
        }

        $values = Settings::values();
        $useFirstImage = ($values['Thumbnail_Use_First_Image'] ?? true) === true;
        if ($useFirstImage && preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $text, $matches) === 1) {
            $firstImage = self::resolveThumbnailUrl($matches[1], $siteUrl);
            if ($firstImage !== '') {
                return $firstImage;
            }
        }

        $default = self::defaultThumbnail($cid, $values['Thumbnail_Default'] ?? '', $siteUrl);
        if ($default !== '') {
            return $default;
        }

        return Assets::url('img/thumbnail.svg');
    }

    /**
     * Pick a random default thumbnail and keep it stable per post within the
     * current request. The field stores one URL per line; arrays are accepted
     * for compatibility with custom settings payloads.
     */
    private static function defaultThumbnail(int $cid, mixed $value, string $siteUrl): string
    {
        $lines = is_array($value)
            ? $value
            : preg_split('/\r\n|\r|\n/', is_scalar($value) ? (string) $value : '');
        $urls = [];

        foreach (is_array($lines) ? $lines : [] as $line) {
            $url = self::resolveThumbnailUrl($line, $siteUrl);
            if ($url !== '') {
                $urls[] = $url;
            }
        }

        if ($urls === []) {
            return '';
        }

        if ($cid > 0 && isset(self::$defaultThumbnails[$cid])) {
            return self::$defaultThumbnails[$cid];
        }

        $choice = $urls[random_int(0, count($urls) - 1)];
        if ($cid > 0) {
            self::$defaultThumbnails[$cid] = $choice;
        }

        return $choice;
    }

    private static function resolveThumbnailUrl(mixed $value, string $siteUrl): string
    {
        if (!is_scalar($value)) {
            return '';
        }

        $value = trim(html_entity_decode((string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($value === '' || str_starts_with(strtolower($value), 'data:')) {
            return '';
        }

        if (str_starts_with($value, '//')) {
            $value = 'https:' . $value;
        } elseif (
            preg_match('#^[a-z][a-z0-9+.-]*:#i', $value) !== 1
            && ctype_digit($value) === false
        ) {
            $value = rtrim($siteUrl, '/') . '/' . ltrim($value, '/');
        }

        return Media::url($value);
    }

    /**
     * @param list<int> $cids
     */
    private static function primeThumbnailFields(array $cids): void
    {
        $cids = array_values(array_unique(array_filter(
            array_map('intval', $cids),
            static fn (int $cid): bool => $cid > 0
        )));
        if ($cids === [] || !class_exists('Typecho\\Db')) {
            return;
        }

        $missing = array_values(array_filter(
            $cids,
            static fn (int $cid): bool => !array_key_exists($cid, self::$thumbnailFields)
        ));
        if ($missing === []) {
            return;
        }

        foreach ($missing as $cid) {
            self::$thumbnailFields[$cid] = '';
        }

        try {
            $db = \Typecho\Db::get();
            $rows = $db->fetchAll(
                $db->select('cid', 'type', 'str_value', 'int_value', 'float_value')
                    ->from('table.fields')
                    ->where('name = ?', 'Thumbnail')
                    ->where('cid IN ?', $missing)
            );

            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $cid = (int) ($row['cid'] ?? 0);
                if ($cid <= 0) {
                    continue;
                }

                self::$thumbnailFields[$cid] = self::fieldValue($row);
            }
        } catch (\Throwable) {
            // A missing field table must not break the public page.
        }
    }

    private static function thumbnailField(int $cid): string
    {
        if ($cid <= 0) {
            return '';
        }

        if (!array_key_exists($cid, self::$thumbnailFields)) {
            self::primeThumbnailFields([$cid]);
        }

        return self::$thumbnailFields[$cid] ?? '';
    }

    /**
     * @param array<string, mixed> $row
     */
    private static function fieldValue(array $row): string
    {
        return match ((string) ($row['type'] ?? 'str')) {
            'int' => (string) (int) ($row['int_value'] ?? 0),
            'float' => (string) (float) ($row['float_value'] ?? 0.0),
            default => (string) ($row['str_value'] ?? ''),
        };
    }

    /**
     * List widgets that only select a subset of columns do not expose `text`;
     * reading it must not blow up the whole page.
     */
    private static function rowText(object $row): string
    {
        try {
            $text = $row->text ?? '';
        } catch (\Throwable) {
            return '';
        }

        return is_string($text) ? $text : '';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function categories(): array
    {
        $items = [];
        \Widget\Metas\Category\Rows::alloc()->to($rows);

        while ($rows->next()) {
            $items[] = [
                'label' => (string) $rows->name,
                'url' => (string) $rows->permalink,
                'count' => (int) $rows->count,
            ];
        }

        return $items;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function categoriesOf(Archive $archive): array
    {
        $categories = isset($archive->categories) && is_array($archive->categories)
            ? $archive->categories
            : [];
        $items = [];

        foreach ($categories as $category) {
            $items[] = [
                'label' => (string) ($category['name'] ?? ''),
                'url' => (string) ($category['permalink'] ?? ''),
            ];
        }

        return $items;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function tags(Archive $archive): array
    {
        return self::tagsOf($archive);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function tagsOf(Archive $archive): array
    {
        $tags = isset($archive->tags) && is_array($archive->tags) ? $archive->tags : [];
        $items = [];

        foreach ($tags as $tag) {
            $items[] = [
                'label' => (string) ($tag['name'] ?? ''),
                'url' => (string) ($tag['permalink'] ?? ''),
            ];
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    private static function postMeta(Archive $archive): array
    {
        $cid = (int) ($archive->cid ?? 0);
        $views = self::$postViews > 0 ? self::$postViews : ArticleViews::count($cid);

        return [
            'date' => self::capture(static fn () => $archive->date('Y-m-d')),
            'dateIso' => self::capture(static fn () => $archive->date('c')),
            'author' => self::capture(static fn () => $archive->author()),
            'commentsText' => self::capture(static fn () => $archive->commentsNum(
                '暂无评论',
                '1 条评论',
                '%d 条评论'
            )),
            'categories' => self::categoriesOf($archive),
            'views' => $views,
            'viewsText' => $views > 0 ? (string) $views : '0',
        ];
    }

    /**
     * @return array{previous: string, next: string}
     */
    private static function postNav(Archive $archive): array
    {
        return [
            'previous' => self::capture(static fn () => $archive->thePrev('%s', '没有更早的文章')),
            'next' => self::capture(static fn () => $archive->theNext('%s', '已经是最新文章')),
        ];
    }

    private static function content(Archive $archive): string
    {
        return self::capture(static fn () => $archive->content());
    }

    private static function pagination(Archive $archive): string
    {
        return self::capture(static fn () => $archive->pageNav('上一页', '下一页'));
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function comments(Archive $archive): ?array
    {
        $json = Components::capture(Framework::root(), 'content/Comments', [
            'archive' => $archive,
            'mode' => 'data',
        ]);
        $data = json_decode($json, true);

        if (!is_array($data)) {
            return null;
        }

        $indexUrl = Typecho::indexUrl();
        if ($indexUrl === '') {
            $indexUrl = Typecho::siteUrl();
        }

        $data['cid'] = (int) ($archive->cid ?? 0);
        $data['apiUrl'] = rtrim($indexUrl, '/') . '/' . Prefixes::v2() . '/comments';
        $data['apiEnabled'] = ThemeConfig::restEnabled() && ThemeConfig::restV2Enabled();
        $data['pageSize'] = 20;

        return $data;
    }

    private static function archiveTitle(Archive $archive): string
    {
        return self::capture(static fn () => $archive->archiveTitle([
            'category' => '分类：%s',
            'search' => '搜索：%s',
            'tag' => '标签：%s',
            'author' => '作者：%s',
            'date' => '日期：%s',
        ], '', ''));
    }

    private static function archiveDescription(Archive $archive): string
    {
        if (!is_callable([$archive, 'is'])) {
            return '';
        }

        if ($archive->is('search')) {
            $keywords = trim((string) ($archive->getArchiveTitle() ?? ''));

            return $keywords !== '' ? '搜索结果仅包含已发布且可见的内容。' : '';
        }

        return '';
    }

    /**
     * @param array<string, mixed> $cache
     */
    private static function cached(array &$cache, string $key, callable $builder): mixed
    {
        if (!array_key_exists($key, $cache)) {
            $cache[$key] = $builder();
        }

        return $cache[$key];
    }

    private static function capture(callable $callback): string
    {
        $level = ob_get_level();
        ob_start();

        try {
            $callback();
            return trim((string) ob_get_clean());
        } catch (\Throwable) {
            while (ob_get_level() > $level) {
                ob_end_clean();
            }

            return '';
        }
    }
}
