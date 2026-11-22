<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Framework;
use TTDF\Ajax\Endpoint;
use TTDF\Http\Rest\Prefixes;
use TTDF\Theme\Assets;
use TTDF\Theme\Fields;
use TTDF\Theme\Media;
use TTDF\Theme\Options;
use TTDF\Theme\Settings;
use TTDF\Theme\ThemeConfig;
use TTDF\View\Components;
use Typecho\Date;
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

    private const SIDEBAR_MODULES = ['toc', 'user-card', 'site-card', 'recent-posts', 'categories', 'tags'];

    private const SIDEBAR_PAGES = ['home', 'archive', 'post', 'page'];

    private const FOOTER_MODULES = ['brand', 'nav', 'categories', 'tags', 'custom', 'meta'];

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
     * @return array<string, mixed>
     */
    public static function user(string $section = 'profile', bool $editor = false): array
    {
        $sections = [
            'profile' => ['title' => '个人资料'],
            'security' => ['title' => '账号安全'],
            'social' => ['title' => '社交账号'],
            'content' => ['title' => '内容管理'],
            'downloads' => ['title' => '订单&下载'],
        ];

        if (!isset($sections[$section])) {
            $section = 'profile';
        }

        $meta = $sections[$section];
        $title = $editor ? '写文章' : $meta['title'];
        $site = self::site(null);

        return [
            'kind' => $editor ? 'editor' : 'account',
            'userSection' => $section,
            'userMode' => $editor ? 'editor' : 'list',
            'site' => $site,
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => [],
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => Seo::documentTitle(
                $title,
                (string) ($site['title'] ?? ''),
                (string) ($site['subtitle'] ?? '')
            ),
            'fields' => $editor ? self::articleFields() : [],
        ];
    }

    /**
     * Operations center shell for editors and administrators. Regular users
     * keep using /user/content for their own drafts and published items.
     *
     * @return array<string, mixed>
     */
    public static function operations(): array
    {
        $enabled = UserProfile::canOperate();
        $site = self::site(null);
        $title = $enabled ? '运营中心' : '无权访问';

        return [
            'kind' => 'operations',
            'operationsEnabled' => $enabled,
            'site' => $site,
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => [],
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => Seo::documentTitle(
                $title,
                (string) ($site['title'] ?? ''),
                (string) ($site['subtitle'] ?? '')
            ),
            'fields' => [],
        ];
    }

    /**
     * Field declarations from `app/config/fields.php`, normalised for the
     * React editor. Only metadata is exposed; values come from the content API.
     *
     * @return list<array<string, mixed>>
     */
    private static function articleFields(): array
    {
        $items = [];

        foreach (Fields::declarations(Framework::root()) as $name => $field) {
            $options = [];
            if (isset($field['options']) && is_array($field['options'])) {
                foreach ($field['options'] as $value => $label) {
                    $options[] = ['value' => (string) $value, 'label' => (string) $label];
                }
            }

            $value = $field['value'] ?? '';
            $items[] = [
                'name' => (string) $name,
                'label' => (string) ($field['label'] ?? $name),
                'type' => (string) ($field['type'] ?? 'Text'),
                'description' => (string) ($field['description'] ?? ''),
                'options' => $options,
                'value' => is_scalar($value) ? (string) $value : '',
                'media' => (bool) ($field['media'] ?? false),
            ];
        }

        return $items;
    }

    /**
     * Backwards-compatible alias for the account security page.
     *
     * @return array<string, mixed>
     */
    public static function account(): array
    {
        return self::user('security');
    }

    /**
     * Editor shell used by the forum-topic route.
     *
     * @param array<string, mixed> $editor
     * @return array<string, mixed>
     */
    public static function editorPage(string $title, array $editor): array
    {
        $site = self::site(null);
        $documentTitle = Seo::documentTitle(
            $title,
            (string) ($site['title'] ?? ''),
            (string) ($site['subtitle'] ?? '')
        );

        return [
            'kind' => 'editor',
            'userSection' => 'content',
            'userMode' => 'editor',
            'editorMode' => (string) ($editor['mode'] ?? 'forum-topic'),
            'forumEditor' => $editor,
            'site' => $site,
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => [],
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => $documentTitle,
            'fields' => [],
        ];
    }

    /**
     * Public profile space at `/users/{uid}`.
     *
     * @return array<string, mixed>
     */
    public static function space(int $uid): array
    {
        $profile = UserProfile::spaceProfile(
            $uid,
            UserProfile::viewerUid(),
            UserProfile::viewerIsAdmin()
        );

        if ($profile === null) {
            return self::missingUser();
        }

        $site = self::site(null);
        $profile['editUrl'] = self::api()['user']['pages']['profile'];
        $name = trim((string) ($profile['screenName'] ?? ''));
        if ($name === '') {
            $name = (string) ($profile['name'] ?? '用户');
        }
        $title = $name . ' 的空间';
        $posts = self::spacePosts((int) ($profile['uid'] ?? 0), 12);
        $comments = self::spaceComments((int) ($profile['uid'] ?? 0), 12);
        $circles = Forum::userCircles((int) ($profile['uid'] ?? 0), 12);

        return [
            'kind' => 'user-space',
            'site' => $site,
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => [
                [
                    'type' => 'user-space',
                    'profile' => $profile,
                    'posts' => $posts,
                    'comments' => $comments,
                    'circles' => $circles,
                ],
            ],
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => Seo::documentTitle(
                $title,
                (string) ($site['title'] ?? ''),
                (string) ($site['subtitle'] ?? '')
            ),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function missingUser(): array
    {
        $site = self::site(null);
        $title = '用户不存在';

        return [
            'kind' => '404',
            'site' => $site,
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => [[
                'type' => 'notfound',
                'image' => Assets::url('img/404.svg'),
                'title' => '没有找到这个用户',
                'text' => '用户可能已经注销，或者地址中的 UID 不正确。',
                'action' => ['label' => '返回首页', 'url' => $site['url']],
                'searchAction' => $site['url'],
                'searchPlaceholder' => '搜索站内文章',
            ]],
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => Seo::documentTitle(
                $title,
                (string) ($site['title'] ?? ''),
                (string) ($site['subtitle'] ?? '')
            ),
        ];
    }

    /**
     * Published posts written by one user.
     *
     * @return list<array<string, mixed>>
     */
    private static function spacePosts(int $uid, int $limit): array
    {
        if ($uid <= 0 || !class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $options = Typecho::options();
            $now = (int) ($options?->time ?? time());
            $rows = $db->fetchAll(
                $db->select('cid', 'title', 'slug', 'created', 'text', 'commentsNum', 'authorId')
                    ->from('table.contents')
                    ->where('authorId = ?', $uid)
                    ->where('type = ?', 'post')
                    ->where('status = ?', 'publish')
                    ->where('created < ?', $now)
                    ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
                    ->order('created', \Typecho\Db::SORT_DESC)
                    ->limit(max(1, min(30, $limit)))
            );
        } catch (\Throwable) {
            return [];
        }

        $siteUrl = Typecho::siteUrl();
        $cids = array_map(
            static fn (mixed $row): int => is_array($row) ? (int) ($row['cid'] ?? 0) : 0,
            $rows
        );
        $views = ArticleViews::counts($cids);
        self::primeThumbnailFields($cids);

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $cid = (int) ($row['cid'] ?? 0);
            $text = (string) ($row['text'] ?? '');
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
    }

    /**
     * Approved comments written by one user on public posts.
     *
     * @return list<array<string, mixed>>
     */
    private static function spaceComments(int $uid, int $limit): array
    {
        if ($uid <= 0 || !class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $options = Typecho::options();
            $now = (int) ($options?->time ?? time());
            $rows = $db->fetchAll(
                $db->select(
                    'table.comments.coid',
                    'table.comments.cid',
                    'table.comments.created',
                    'table.comments.text',
                    'table.contents.title',
                    'table.contents.slug'
                )
                    ->from('table.comments')
                    ->join('table.contents', 'table.contents.cid = table.comments.cid')
                    ->where('table.comments.authorId = ?', $uid)
                    ->where('table.comments.status = ?', 'approved')
                    ->where('table.comments.type = ?', 'comment')
                    ->where('table.contents.type = ?', 'post')
                    ->where('table.contents.status = ?', 'publish')
                    ->where('table.contents.created < ?', $now)
                    ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
                    ->order('table.comments.created', \Typecho\Db::SORT_DESC)
                    ->limit(max(1, min(30, $limit)))
            );
        } catch (\Throwable) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $coid = (int) ($row['coid'] ?? 0);
            $postUrl = self::postUrl($row);
            $items[] = [
                'coid' => $coid,
                'postTitle' => trim((string) ($row['title'] ?? '')),
                'postUrl' => $postUrl,
                'url' => $postUrl . '#comment-' . $coid,
                'excerpt' => self::clip(self::plainText((string) ($row['text'] ?? '')), 160),
                'date' => self::postDate(['created' => (int) ($row['created'] ?? 0)], 'Y-m-d H:i'),
                'dateIso' => self::postDate(['created' => (int) ($row['created'] ?? 0)], 'c'),
            ];
        }

        return $items;
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
     * Page payload for the built-in forum routes. Keeping the kind explicit
     * lets the React shell render the forum without adding a second sidebar.
     *
     * @param list<array<string, mixed>> $blocks
     * @return array<string, mixed>
     */
    public static function forumPage(
        string $kind,
        string $title,
        array $blocks,
        string $documentTitle = '',
        string $canonical = '',
        string $description = '',
        array $leftBlocks = [],
        array $rightBlocks = []
    ): array {
        $site = self::site(null);
        $documentTitle = $documentTitle !== '' ? $documentTitle : $title;

        $documentTitle = Seo::documentTitle(
            $documentTitle !== '' ? $documentTitle : $title,
            (string) ($site['title'] ?? ''),
            (string) ($site['subtitle'] ?? '')
        );

        $data = [
            'kind' => $kind,
            'site' => $site,
            'theme' => self::theme(),
            'api' => self::api(),
            'blocks' => array_values(array_filter($blocks, 'is_array')),
            'widgets' => self::widgets(),
            'title' => $title,
            'documentTitle' => $documentTitle,
            'canonical' => $canonical !== '' ? $canonical : $site['url'],
            'description' => $description,
        ];

        if ($leftBlocks !== [] || $rightBlocks !== []) {
            $data['forumLayout'] = [
                'left' => array_values(array_filter($leftBlocks, 'is_array')),
                'right' => array_values(array_filter($rightBlocks, 'is_array')),
            ];
        }

        return $data;
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
     * Scoped search used by category and tag archive headers. The native
     * Typecho search route cannot carry a taxonomy filter, so the React search
     * panel reads this endpoint when it is opened from an archive header.
     *
     * @return list<array<string, mixed>>
     */
    public static function searchData(): array
    {
        $query = isset($_GET['q']) && is_scalar($_GET['q'])
            ? trim((string) $_GET['q'])
            : '';
        if ($query === '') {
            return [];
        }

        $category = isset($_GET['category']) && is_scalar($_GET['category'])
            ? trim((string) $_GET['category'])
            : '';
        $tag = isset($_GET['tag']) && is_scalar($_GET['tag'])
            ? trim((string) $_GET['tag'])
            : '';

        return self::searchSummaries($query, $category, $tag);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function searchSummaries(string $query, string $category, string $tag): array
    {
        if (!class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $options = Typecho::options();
            $like = '%' . str_replace(' ', '%', $query) . '%';
            $select = $db->select(
                'table.contents.cid',
                'table.contents.title',
                'table.contents.slug',
                'table.contents.created',
                'table.contents.text',
                'table.contents.commentsNum',
                'table.contents.authorId'
            )
                ->from('table.contents')
                ->where('table.contents.type = ?', 'post')
                ->where('table.contents.status = ?', 'publish')
                ->where('table.contents.created < ?', (int) ($options?->time ?? time()))
                ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
                ->where(
                    '(table.contents.title LIKE ? OR table.contents.text LIKE ?)',
                    $like,
                    $like
                );

            $term = $category !== '' ? $category : $tag;
            $termType = $category !== '' ? 'category' : 'tag';
            if ($term !== '') {
                $meta = $db->fetchRow(
                    $db->select('mid')
                        ->from('table.metas')
                        ->where('type = ?', $termType)
                        ->where('slug = ?', $term)
                        ->limit(1)
                );
                $mid = is_array($meta) ? (int) ($meta['mid'] ?? 0) : 0;
                if ($mid <= 0) {
                    return [];
                }

                $select->join(
                    'table.relationships',
                    'table.relationships.cid = table.contents.cid'
                )->where('table.relationships.mid = ?', $mid);
            }

            $rows = $db->fetchAll(
                $select->order('table.contents.created', \Typecho\Db::SORT_DESC)->limit(12)
            );
        } catch (\Throwable $exception) {
            error_log('SunkenBoat scoped search failed: ' . $exception->getMessage());

            return [];
        }

        $siteUrl = Typecho::siteUrl();
        $cids = array_map(
            static fn (mixed $row): int => is_array($row) ? (int) ($row['cid'] ?? 0) : 0,
            $rows
        );
        $views = ArticleViews::counts($cids);
        self::primeThumbnailFields($cids);

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $cid = (int) ($row['cid'] ?? 0);
            $text = (string) ($row['text'] ?? '');
            $items[] = [
                'title' => trim((string) ($row['title'] ?? '')),
                'url' => self::postUrl($row),
                'excerpt' => self::excerpt($row, $text, 120),
                'date' => self::postDate($row, 'Y-m-d'),
                'dateIso' => self::postDate($row, 'c'),
                'thumb' => self::thumbnail($cid, $text, $siteUrl),
                'author' => self::authorName((int) ($row['authorId'] ?? 0)),
                'comments' => (int) ($row['commentsNum'] ?? 0),
                'views' => $views[$cid] ?? 0,
                'categories' => self::termsOfCid($cid, 'category'),
                'tags' => self::termsOfCid($cid, 'tag'),
            ];
        }

        return $items;
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
        $saved = $values[self::settingKey($kind)] ?? null;
        $legacy = self::isLegacyBlockLayout($saved, $kind);
        $specs = self::normalizeSpecs($saved, $defaults);
        if ($legacy) {
            array_unshift($specs, [
                'name' => 'breadcrumbs',
                'variant' => '',
                'data' => [],
                'index' => -1,
            ]);
        }
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
                $block['settingsIndex'] = (int) $spec['index'];
                $blocks[] = $block;
            }
        }

        return $blocks;
    }

    /**
     * Before breadcrumbs existed, a saved layout could still be exactly the
     * built-in default. Upgrade only that untouched shape so custom orders are
     * never rewritten.
     *
     * @param mixed $saved
     */
    private static function isLegacyBlockLayout(mixed $saved, string $kind): bool
    {
        if (!is_array($saved) || $saved === []) {
            return false;
        }

        $legacy = match ($kind) {
            'post' => ['prose', 'tags', 'post-nav', 'comments'],
            'page' => ['page-header', 'prose', 'comments'],
            default => [],
        };
        if ($legacy === []) {
            return false;
        }

        $names = [];
        foreach ($saved as $item) {
            if (is_string($item)) {
                $names[] = trim(explode(':', trim($item), 2)[0]);
            } elseif (is_array($item)) {
                $names[] = trim((string) ($item['name'] ?? ($item['block'] ?? '')));
            } else {
                return false;
            }
        }

        return $names === $legacy;
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
            'post' => ['breadcrumbs', 'prose', 'tags', 'post-nav', 'comments'],
            'page' => ['breadcrumbs', 'page-header', 'prose', 'comments'],
            '404' => ['notfound'],
            default => ['page-header', 'prose'],
        };
    }

    /**
     * @param mixed $value
     * @param list<string> $defaults
     * @return list<array{name: string, variant: string, data: array<string, mixed>, index: int}>
     */
    private static function normalizeSpecs(mixed $value, array $defaults): array
    {
        $items = is_array($value) ? $value : [];
        $specs = [];

        foreach ($items as $index => $item) {
            $spec = self::normalizeSpec($item);
            if ($spec !== null) {
                $specs[] = $spec + ['index' => (int) $index];
            }
        }

        if ($specs !== []) {
            return $specs;
        }

        foreach ($defaults as $index => $fallback) {
            $spec = self::normalizeSpec($fallback);
            if ($spec !== null) {
                $specs[] = $spec + ['index' => (int) $index];
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

        $block = match ($type) {
            'hero' => self::heroBlock($archive, $variant, $data),
            'carousel' => self::carouselBlock($variant, $data),
            'post-list' => self::postListBlock($kind, $archive, $variant, $cache, $data),
            'categories' => self::categoriesBlock($variant, $cache, $data),
            'archive-header' => self::archiveHeaderBlock($archive, $data),
            'breadcrumbs' => self::breadcrumbsBlock($archive, $data),
            'post-header' => null,
            'page-header' => self::pageHeaderBlock($archive, $variant, $data),
            'prose' => self::proseBlock($archive, $cache, $data, $kind),
            'tags' => self::tagsBlock($archive, $cache, $data),
            'post-nav' => self::postNavBlock($archive, $cache),
            'comments' => self::commentsBlock($archive, $kind, $cache, $data),
            'notfound' => self::notFoundBlock($archive, $data),
            'search' => self::searchBlock($archive, $variant, $data),
            'cta' => self::ctaBlock($data),
            'alert' => self::alertBlock($variant, $data),
            'notice' => self::noticeBlock($variant, $data),
            'quote' => self::quoteBlock($variant, $data),
            'feature-grid' => self::featureGridBlock($variant, $data),
            'stats' => self::statsBlock($variant, $data),
            'steps' => self::stepsBlock($variant, $data),
            'faq' => self::faqBlock($variant, $data),
            'timeline' => self::timelineBlock($data),
            'gallery' => self::galleryBlock($variant, $data),
            'table' => self::tableBlock($data),
            'media-grid' => self::mediaGridBlock($data),
            'promo-grid' => self::promoGridBlock($variant, $data),
            'post-tabs' => self::postTabsBlock($archive, $variant, $data, $cache),
            'author-grid' => self::authorGridBlock($data),
            'product-grid' => self::productGridBlock($data),
            'logo-cloud' => self::logoCloudBlock($data),
            'heading' => self::headingBlock($variant, $data),
            'button-group' => self::buttonGroupBlock($variant, $data),
            'info-cards' => self::infoCardsBlock($data),
            'partner-scroll' => self::partnerScrollBlock($variant, $data),
            'media-split' => self::mediaSplitBlock($variant, $data),
            'post-author' => self::postAuthorBlock($archive, $data),
            'pricing' => self::pricingBlock($data),
            'author-card' => self::authorCardBlock($archive, $data),
            'subscribe' => self::subscribeBlock($archive, $data),
            'link-list' => self::linkListBlock($data),
            'divider' => ['type' => 'divider', 'variant' => $variant !== '' ? $variant : 'default'],
            'spacer' => ['type' => 'spacer', 'variant' => $variant !== '' ? $variant : 'md'],
            default => null,
        };

        return $block === null ? null : array_merge($block, self::blockLayout($data));
    }

    /**
     * @return array<string, mixed>
     */
    private static function heroBlock(Archive $archive, string $variant, array $data): array
    {
        $site = self::site($archive);
        $lead = $site['subtitle'] !== '' ? $site['subtitle'] : $site['description'];
        $primaryLabel = self::text($data, 'primary_label', '浏览文章');
        $primaryUrl = self::safeUrl($data['primary_url'] ?? '', '#latest');
        $secondaryLabel = self::text($data, 'secondary_label', 'RSS 订阅');
        $secondaryUrl = self::safeUrl($data['secondary_url'] ?? '', $site['feedUrl']);
        $actions = [];

        if ($primaryLabel !== '' && $primaryUrl !== '') {
            $actions[] = ['label' => $primaryLabel, 'url' => $primaryUrl, 'style' => 'primary'];
        }

        if ($secondaryLabel !== '' && $secondaryUrl !== '') {
            $actions[] = ['label' => $secondaryLabel, 'url' => $secondaryUrl, 'style' => 'ghost'];
        }

        $hot = [];
        foreach (self::lines($data['hot'] ?? null, 10) as $line) {
            $line = trim($line);
            if ($line !== '') {
                $hot[] = $line;
            }
        }

        $overlay = is_numeric($data['overlay'] ?? null) ? (int) $data['overlay'] : 55;
        $height = (string) ($data['height'] ?? '');
        $align = (string) ($data['align'] ?? 'center');
        $background = trim((string) ($data['background'] ?? ''));
        if ($background === '') {
            $background = trim((string) ($data['video'] ?? '')) !== ''
                ? 'video'
                : (trim((string) ($data['image'] ?? '')) !== '' ? 'image' : 'color');
        }
        $color = trim((string) ($data['color'] ?? ''));
        if (preg_match('/^#[0-9a-f]{6}$/i', $color) !== 1) {
            $color = '#10141c';
        }
        $cards = [];
        foreach (self::pipeRows(
            $data['cards'] ?? null,
            ['title', 'text', 'url', 'badge'],
            4
        ) as $row) {
            if ($row['title'] === '' && $row['text'] === '') {
                continue;
            }

            $cards[] = [
                'title' => $row['title'],
                'text' => $row['text'],
                'url' => self::safeUrl($row['url']),
                'badge' => $row['badge'],
            ];
        }
        $cardStyle = (string) ($data['card_style'] ?? 'glass');
        $imageFit = (string) ($data['image_fit'] ?? 'cover');
        $imageEffect = (string) ($data['image_effect'] ?? 'none');
        $imagePosition = (string) ($data['image_position'] ?? 'center');

        return [
            'type' => 'hero',
            'variant' => in_array($variant, ['default', 'compact', 'banner', 'search'], true)
                ? $variant
                : 'default',
            'width' => self::blockWidth($data),
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', $site['title']),
            'lead' => self::text($data, 'lead', $lead),
            'background' => in_array($background, ['color', 'image', 'video'], true)
                ? $background
                : 'color',
            'color' => $color,
            'image' => Media::url($data['image'] ?? ''),
            'imageFit' => in_array($imageFit, ['cover', 'contain', 'fill'], true) ? $imageFit : 'cover',
            'imageEffect' => in_array($imageEffect, ['none', 'fixed', 'zoom', 'pan'], true)
                ? $imageEffect
                : 'none',
            'imagePosition' => in_array($imagePosition, ['center', 'top', 'bottom', 'left', 'right'], true)
                ? $imagePosition
                : 'center',
            'video' => self::safeUrl($data['video'] ?? ''),
            'videoPoster' => Media::url($data['video_poster'] ?? ''),
            'height' => in_array($height, ['sm', 'md', 'lg', 'screen'], true) ? $height : '',
            'overlay' => max(0, min(90, $overlay)),
            'align' => in_array($align, ['left', 'center'], true) ? $align : 'center',
            'hot' => $hot,
            'searchAction' => $site['url'],
            'searchPlaceholder' => self::text($data, 'search_placeholder', '输入关键词搜索站内文章…'),
            'actions' => $actions,
            'cards' => $cards,
            'cardStyle' => in_array($cardStyle, ['glass', 'solid'], true) ? $cardStyle : 'glass',
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function postListBlock(string $kind, Archive $archive, string $variant, array &$cache, array $data = []): array
    {
        $category = trim((string) ($data['category'] ?? ''));
        $source = (string) ($data['source'] ?? 'articles');
        $source = in_array($source, ['articles', 'forum', 'mixed'], true) ? $source : 'articles';
        $order = (string) ($data['order'] ?? 'latest');
        $order = $order === 'random' ? 'random' : 'latest';
        $forumCircle = trim((string) ($data['forum_circle'] ?? ''));
        $cacheKey = ($category === '' ? 'posts' : 'posts:' . $category) . ':' . $order;
        $paginationKey = $category === '' ? 'pagination' : 'pagination:' . $category;
        $limit = is_numeric($data['limit'] ?? null) ? (int) $data['limit'] : 0;
        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 0;
        $showPagination = $order !== 'random'
            && (!isset($data['show_pagination']) || (string) $data['show_pagination'] !== '0');
        $fetchLimit = $limit > 0 ? min(30, $limit) : 30;
        $articles = $source === 'forum'
            ? []
            : ($order === 'random'
                ? self::cached(
                    $cache,
                    $cacheKey,
                    static fn (): array => self::randomPostSummaries($fetchLimit, $category)
                )
                : self::cached(
                    $cache,
                    $cacheKey,
                    static fn (): array => $category !== ''
                        ? self::postSummariesByCategory($category)
                        : self::postSummaries($archive)
                ));
        $forumPosts = $source === 'articles'
            ? []
            : self::cached(
                $cache,
                'forum:' . $forumCircle . ':' . $fetchLimit . ':' . $order,
                static fn (): array => Forum::feedSummaries($fetchLimit, $forumCircle, $order)
            );
        $posts = match ($source) {
            'forum' => $forumPosts,
            'mixed' => self::mergeContentFeeds($articles, $forumPosts),
            default => $articles,
        };
        if ($order === 'random') {
            shuffle($posts);
            $posts = array_slice($posts, 0, $fetchLimit);
        }

        return [
            'type' => 'post-list',
            'variant' => $variant !== '' ? $variant : 'list',
            'title' => self::text(
                $data,
                'title',
                $kind === 'home'
                    ? ($order === 'random'
                        ? ($source === 'forum' ? '随机帖子' : '随机文章')
                        : ($source === 'forum' ? '最新帖子' : '最新文章'))
                    : ''
            ),
            'category' => $category,
            'source' => $source,
            'limit' => max(0, min(30, $limit)),
            'columns' => max(0, min(5, $columns)),
            'showPagination' => $showPagination,
            'posts' => $posts,
            'paginationHtml' => $source !== 'articles' || $category !== '' || !$showPagination
                ? ''
                : self::cached($cache, $paginationKey, static fn (): string => self::pagination($archive)),
            'empty' => self::text(
                $data,
                'empty',
                $kind === 'home'
                    ? ($source === 'forum' ? '这里还没有帖子。' : '这里还没有文章。')
                    : '没有找到内容。'
            ),
        ];
    }

    /**
     * Merge article and forum summaries in reverse chronological order. Cards
     * use the same shape, so the mixed feed stays renderer-agnostic.
     *
     * @param list<array<string, mixed>> $articles
     * @param list<array<string, mixed>> $forum
     * @return list<array<string, mixed>>
     */
    private static function mergeContentFeeds(array $articles, array $forum): array
    {
        $merged = array_merge($articles, $forum);
        usort($merged, static function (array $left, array $right): int {
            $leftDate = (string) ($left['dateIso'] ?? '');
            $rightDate = (string) ($right['dateIso'] ?? '');

            return strcmp($rightDate, $leftDate);
        });

        return $merged;
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

        $height = (string) ($data['height'] ?? '');
        $overlay = is_numeric($data['overlay'] ?? null) ? (int) $data['overlay'] : 45;
        $align = (string) ($data['align'] ?? 'center');

        return [
            'type' => 'carousel',
            'variant' => $variant !== '' ? $variant : 'default',
            'width' => self::blockWidth($data),
            'title' => self::text($data, 'title', ''),
            'height' => in_array($height, ['sm', 'md', 'lg', 'screen'], true) ? $height : '',
            'overlay' => max(0, min(90, $overlay)),
            'align' => in_array($align, ['left', 'center'], true) ? $align : 'center',
            'slides' => array_map(static fn (array $slide): array => [
                'image' => Media::url($slide['image'] ?? ''),
                'title' => self::clip((string) ($slide['title'] ?? ''), 160),
                'description' => self::clip((string) ($slide['description'] ?? ''), 300),
                'url' => self::safeUrl($slide['url'] ?? ''),
            ], $slides),
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>
     */
    private static function categoriesBlock(string $variant, array &$cache, array $data = []): array
    {
        $limit = is_numeric($data['limit'] ?? null) ? (int) $data['limit'] : 0;
        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 0;

        return [
            'type' => 'categories',
            'variant' => $variant !== '' ? $variant : 'grid',
            'title' => self::text($data, 'title', '分类'),
            'limit' => max(0, min(24, $limit)),
            'columns' => max(0, min(6, $columns)),
            'items' => self::cached($cache, 'categories', static fn (): array => self::categories()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function archiveHeaderBlock(Archive $archive, array $data = []): array
    {
        $title = self::archiveTitle($archive);
        $scope = null;
        if (is_callable([$archive, 'is'])) {
            if ($archive->is('category')) {
                $scope = [
                    'type' => 'category',
                    'slug' => (string) ($archive->getArchiveSlug() ?? ''),
                    'label' => $title,
                ];
            } elseif ($archive->is('tag')) {
                $scope = [
                    'type' => 'tag',
                    'slug' => (string) ($archive->getArchiveSlug() ?? ''),
                    'label' => $title,
                ];
            }
        }

        return [
            'type' => 'archive-header',
            'title' => self::text($data, 'title', $title !== '' ? $title : '归档'),
            'description' => self::text($data, 'description', self::archiveDescription($archive)),
            'count' => is_callable([$archive, 'getTotal']) ? (int) $archive->getTotal() : 0,
            'searchLabel' => self::text($data, 'search_label', '搜索当前分类'),
            'searchScope' => $scope,
        ];
    }

    /**
     * Breadcrumb trail for a single post or page.
     *
     * @return array<string, mixed>
     */
    private static function breadcrumbsBlock(Archive $archive, array $data = []): array
    {
        $site = self::site($archive);
        $items = [[
            'label' => self::text($data, 'home_label', '首页'),
            'url' => $site['url'],
        ]];

        $categories = self::categoriesOf($archive);
        if ($categories !== []) {
            $first = $categories[0];
            if ((string) ($first['url'] ?? '') !== '') {
                $items[] = [
                    'label' => (string) ($first['label'] ?? ''),
                    'url' => (string) $first['url'],
                ];
            }
        }

        $title = trim((string) ($archive->title ?? ''));
        if ($title !== '') {
            $items[] = ['label' => $title];
        }

        return [
            'type' => 'breadcrumbs',
            'items' => $items,
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
            'share' => self::shareConfig(),
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
        $cid = (int) ($archive->cid ?? 0);
        $meta = $kind === 'post'
            ? self::cached($cache, 'postMeta', static fn (): array => self::postMeta($archive))
            : null;

        return [
            'type' => 'prose',
            'title' => $kind === 'post' ? (string) ($archive->title ?? '') : '',
            'meta' => $meta,
            'share' => self::shareConfig(),
            'layout' => self::contentLayout($archive),
            'html' => self::cached($cache, 'content', static function () use ($archive): string {
                $html = self::content($archive);
                $cid = (int) ($archive->cid ?? 0);

                $html = ContentGate::render($html, $cid);

                return ContentComponents::render($html);
            }),
            'toc' => $theme['showToc'],
            'tocTitle' => self::text($data, 'toc_title', '本页目录'),
            'codeCopy' => true,
            'download' => $kind === 'post' && $cid > 0
                ? Downloads::offer('article', $cid, (string) ($archive->title ?? ''))
                : null,
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
            'image' => Assets::url('img/404.svg'),
            'title' => self::text($data, 'title', '这里没有内容'),
            'text' => self::text($data, 'text', '地址可能已经改变，或者这篇内容被移到了别处。'),
            'action' => [
                'label' => self::text($data, 'action_label', '返回首页'),
                'url' => self::safeUrl($data['action_url'] ?? '', $site['url']),
            ],
            'searchAction' => $site['url'],
            'searchPlaceholder' => self::text($data, 'search_placeholder', '搜索站内文章'),
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
                'url' => self::safeUrl($data['action_url'] ?? '', $site['feedUrl']),
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function alertBlock(string $variant, array $data = []): ?array
    {
        $title = self::text($data, 'title', '');
        $text = self::text($data, 'text', '');

        if ($title === '' && $text === '') {
            return null;
        }

        return [
            'type' => 'alert',
            'variant' => self::blockVariant($variant, ['info', 'success', 'warning', 'danger'], 'info'),
            'title' => $title,
            'text' => $text,
            'action' => [
                'label' => self::text($data, 'action_label', ''),
                'url' => self::safeUrl($data['action_url'] ?? ''),
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function noticeBlock(string $variant, array $data = []): ?array
    {
        $eyebrow = self::text($data, 'eyebrow', '');
        $title = self::text($data, 'title', '');
        $text = self::text($data, 'text', '');
        $action = [
            'label' => self::text($data, 'action_label', ''),
            'url' => self::safeUrl($data['action_url'] ?? ''),
        ];

        if ($eyebrow === '' && $title === '' && $text === '' && $action['url'] === '') {
            return null;
        }

        return [
            'type' => 'notice',
            'variant' => self::blockVariant($variant, ['soft', 'accent', 'dark'], 'soft'),
            'width' => self::blockWidth($data),
            'eyebrow' => $eyebrow,
            'title' => $title,
            'text' => $text,
            'action' => $action,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function quoteBlock(string $variant, array $data = []): ?array
    {
        $text = self::text($data, 'text', '');

        if ($text === '') {
            return null;
        }

        return [
            'type' => 'quote',
            'variant' => self::blockVariant($variant, ['default', 'large'], 'default'),
            'text' => $text,
            'cite' => self::text($data, 'cite', ''),
            'sourceUrl' => self::safeUrl($data['source_url'] ?? ''),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function featureGridBlock(string $variant, array $data = []): ?array
    {
        $items = self::pipeRows($data['items'] ?? null, ['title', 'text', 'url'], 8);
        $items = array_values(array_filter(
            $items,
            static fn (array $row): bool => $row['title'] !== '' || $row['text'] !== ''
        ));

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'feature-grid',
            'variant' => self::blockVariant($variant, ['two', 'three', 'four'], 'three'),
            'width' => self::blockWidth($data),
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => array_map(static fn (array $row): array => [
                'title' => $row['title'],
                'text' => $row['text'],
                'url' => self::safeUrl($row['url']),
            ], $items),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function statsBlock(string $variant, array $data = []): array
    {
        $items = self::pipeRows($data['items'] ?? null, ['value', 'label'], 8);
        $items = array_values(array_filter(
            $items,
            static fn (array $row): bool => $row['value'] !== '' || $row['label'] !== ''
        ));

        if ($items === []) {
            $stats = self::stats();
            $items = [
                ['value' => (string) $stats['posts'], 'label' => '篇文章'],
                ['value' => (string) $stats['comments'], 'label' => '条评论'],
                ['value' => (string) $stats['categories'], 'label' => '个分类'],
                ['value' => (string) $stats['tags'], 'label' => '个标签'],
            ];
        }

        return [
            'type' => 'stats',
            'variant' => self::blockVariant($variant, ['two', 'three', 'four', 'strip'], 'four'),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function stepsBlock(string $variant, array $data = []): ?array
    {
        $items = self::pipeRows($data['items'] ?? null, ['title', 'text'], 8);
        $items = array_values(array_filter(
            $items,
            static fn (array $row): bool => $row['title'] !== '' || $row['text'] !== ''
        ));

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'steps',
            'variant' => self::blockVariant($variant, ['vertical', 'grid'], 'vertical'),
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function faqBlock(string $variant, array $data = []): ?array
    {
        $items = self::pipeRows($data['items'] ?? null, ['question', 'answer'], 12);
        $items = array_values(array_filter(
            $items,
            static fn (array $row): bool => $row['question'] !== '' && $row['answer'] !== ''
        ));

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'faq',
            'variant' => self::blockVariant($variant, ['default', 'panel'], 'default'),
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function timelineBlock(array $data = []): ?array
    {
        $items = self::pipeRows($data['items'] ?? null, ['date', 'title', 'text'], 16);
        $items = array_values(array_filter(
            $items,
            static fn (array $row): bool => $row['date'] !== ''
                || $row['title'] !== ''
                || $row['text'] !== ''
        ));

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'timeline',
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function galleryBlock(string $variant, array $data = []): ?array
    {
        $images = [];

        foreach (self::lines($data['images'] ?? null, 24) as $line) {
            $url = Media::normalizeUrl($line);
            if ($url !== '' && !ctype_digit($url)) {
                $images[] = $url;
            }
        }

        if ($images === []) {
            return null;
        }

        return [
            'type' => 'gallery',
            'variant' => self::blockVariant($variant, ['two', 'three', 'four'], 'three'),
            'width' => self::blockWidth($data),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'images' => array_values(array_unique($images)),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function tableBlock(array $data = []): ?array
    {
        $head = self::cells($data['head'] ?? null);
        $lines = self::lines($data['rows'] ?? null, 20);
        $columns = count($head);

        foreach ($lines as $line) {
            $columns = max($columns, count(explode('|', $line)));
        }

        $columns = max(1, min(8, $columns));
        $head = array_slice(array_pad($head, $columns, ''), 0, $columns);
        $rows = self::tableRows($data['rows'] ?? null, $columns, 20);
        $hasHead = trim(implode('', $head)) !== '';

        if (!$hasHead && $rows === []) {
            return null;
        }

        return [
            'type' => 'table',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'head' => $head,
            'rows' => $rows,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function mediaGridBlock(array $data = []): ?array
    {
        $rows = self::pipeRows($data['items'] ?? null, ['title', 'image', 'url', 'text'], 12);
        $items = [];

        foreach ($rows as $row) {
            $image = Media::url($row['image']);
            if ($image === '' && $row['title'] === '') {
                continue;
            }

            $items[] = [
                'title' => $row['title'],
                'text' => $row['text'],
                'image' => $image,
                'url' => self::safeUrl($row['url'], '#'),
            ];
        }

        if ($items === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 5;

        return [
            'type' => 'media-grid',
            'variant' => self::blockVariant((string) ($data['variant'] ?? ''), ['overlay', 'card'], 'overlay'),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => max(2, min(6, $columns)),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function promoGridBlock(string $variant, array $data = []): ?array
    {
        $rows = self::pipeRows(
            $data['items'] ?? null,
            ['title', 'text', 'image', 'url', 'badge'],
            8
        );
        $items = [];

        foreach ($rows as $row) {
            $image = Media::url($row['image']);
            if ($row['title'] === '' && $row['text'] === '' && $image === '') {
                continue;
            }

            $items[] = [
                'title' => $row['title'],
                'text' => $row['text'],
                'image' => $image,
                'url' => self::safeUrl($row['url']),
                'badge' => $row['badge'],
            ];
        }

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'promo-grid',
            'variant' => self::blockVariant($variant, ['feature', 'duo', 'trio'], 'feature'),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => $items,
        ];
    }

    /**
     * @param array<string, mixed> $cache
     * @return array<string, mixed>|null
     */
    private static function postTabsBlock(Archive $archive, string $variant, array $data, array &$cache): ?array
    {
        unset($variant);

        $limit = is_numeric($data['limit'] ?? null) ? (int) $data['limit'] : 6;
        $limit = max(1, min(12, $limit));
        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 3;
        $columns = max(2, min(4, $columns));
        $rows = self::pipeRows($data['tabs'] ?? null, ['label', 'category', 'url'], 8);

        if ($rows === []) {
            $rows = [[
                'label' => '最新',
                'category' => '',
                'url' => '',
            ]];

            $categories = self::cached($cache, 'categories', static fn (): array => self::categories());
            foreach ($categories as $category) {
                $slug = trim((string) ($category['slug'] ?? ''));
                if ($slug === '' || (int) ($category['count'] ?? 0) <= 0) {
                    continue;
                }

                $rows[] = [
                    'label' => (string) ($category['label'] ?? ''),
                    'category' => $slug,
                    'url' => (string) ($category['url'] ?? ''),
                ];

                if (count($rows) >= 4) {
                    break;
                }
            }
        }

        $tabs = [];
        foreach ($rows as $row) {
            $label = $row['label'] !== '' ? $row['label'] : '内容';
            $category = trim($row['category']);
            $posts = $category === ''
                ? self::cached($cache, 'posts', static fn (): array => self::postSummaries($archive))
                : self::cached(
                    $cache,
                    'post-tab:' . $category,
                    static fn (): array => self::postSummariesByCategory($category)
                );
            $posts = array_slice($posts, 0, $limit);

            if ($posts === []) {
                continue;
            }

            $tabs[] = [
                'label' => $label,
                'url' => self::safeUrl($row['url']),
                'posts' => $posts,
            ];
        }

        if ($tabs === []) {
            return null;
        }

        return [
            'type' => 'post-tabs',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => $columns,
            'tabs' => $tabs,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function authorGridBlock(array $data = []): ?array
    {
        $limit = is_numeric($data['limit'] ?? null) ? (int) $data['limit'] : 8;
        $limit = max(1, min(12, $limit));
        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 3;
        $columns = max(1, min(4, $columns));
        $rows = self::pipeRows($data['items'] ?? null, ['name', 'avatar', 'bio', 'url', 'badge'], 12);
        $items = [];

        foreach ($rows as $row) {
            if ($row['name'] === '') {
                continue;
            }

            $items[] = [
                'name' => $row['name'],
                'avatar' => Media::url($row['avatar']),
                'bio' => $row['bio'],
                'url' => self::safeUrl($row['url']),
                'badge' => $row['badge'],
                'posts' => 0,
                'comments' => 0,
            ];
        }

        if ($items === []) {
            $items = self::siteAuthors($limit);
        }

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'author-grid',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => $columns,
            'items' => $items,
        ];
    }

    /**
     * @return list<array{name: string, avatar: string, bio: string, url: string, badge: string, posts: int, comments: int}>
     */
    private static function siteAuthors(int $limit): array
    {
        if (!class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $users = $db->fetchAll(
                $db->select('uid', 'name', 'screenName', 'mail', 'url', 'group')
                    ->from('table.users')
                    ->order('uid', \Typecho\Db::SORT_ASC)
                    ->limit($limit)
            );
            if (!is_array($users) || $users === []) {
                return [];
            }

            $postCounts = [];
            $postRows = $db->fetchAll(
                $db->select('authorId')
                    ->from('table.contents')
                    ->where('type = ?', 'post')
                    ->where('status = ?', 'publish')
                    ->where('(password IS NULL OR password = ?)', '')
            );
            foreach (is_array($postRows) ? $postRows : [] as $postRow) {
                $uid = (int) ($postRow['authorId'] ?? 0);
                if ($uid > 0) {
                    $postCounts[$uid] = ($postCounts[$uid] ?? 0) + 1;
                }
            }

            $commentCounts = [];
            $commentRows = $db->fetchAll(
                $db->select('authorId')
                    ->from('table.comments')
                    ->where('status = ?', 'approved')
            );
            foreach (is_array($commentRows) ? $commentRows : [] as $commentRow) {
                $uid = (int) ($commentRow['authorId'] ?? 0);
                if ($uid > 0) {
                    $commentCounts[$uid] = ($commentCounts[$uid] ?? 0) + 1;
                }
            }

            $items = [];
            foreach ($users as $user) {
                if (!is_array($user)) {
                    continue;
                }

                $uid = (int) ($user['uid'] ?? 0);
                $name = trim((string) ($user['screenName'] ?? ''));
                if ($name === '') {
                    $name = trim((string) ($user['name'] ?? ''));
                }
                if ($uid <= 0 || $name === '') {
                    continue;
                }

                $group = (string) ($user['group'] ?? '');
                $badge = match ($group) {
                    'administrator' => '管理员',
                    'editor' => '编辑',
                    'contributor' => '贡献者',
                    'subscriber' => '订阅者',
                    default => $group !== '' ? $group : '作者',
                };
                $items[] = [
                    'name' => $name,
                    'avatar' => Avatar::forUser(
                        $uid,
                        (string) ($user['mail'] ?? ''),
                        120
                    ),
                    'bio' => trim((string) ($user['url'] ?? '')),
                    'url' => self::authorUrl($uid),
                    'badge' => $badge,
                    'posts' => (int) ($postCounts[$uid] ?? 0),
                    'comments' => (int) ($commentCounts[$uid] ?? 0),
                ];
            }

            return $items;
        } catch (\Throwable $exception) {
            error_log('TTDF author grid lookup failed: ' . $exception->getMessage());

            return [];
        }
    }

    private static function authorUrl(int $uid): string
    {
        try {
            $path = (string) \Typecho\Router::url('author', ['uid' => $uid]);
            $options = Typecho::options();
            $index = is_scalar($options?->index ?? null) ? (string) $options->index : '';

            return \Typecho\Common::url($path, $index);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function productGridBlock(array $data = []): ?array
    {
        $rows = self::pipeRows(
            $data['items'] ?? null,
            ['title', 'image', 'price', 'original_price', 'url', 'badge', 'text'],
            16
        );
        $items = [];

        foreach ($rows as $row) {
            $image = Media::url($row['image']);
            if ($row['title'] === '' && $image === '') {
                continue;
            }

            $items[] = [
                'title' => $row['title'],
                'text' => $row['text'],
                'image' => $image,
                'price' => $row['price'],
                'originalPrice' => $row['original_price'],
                'badge' => $row['badge'],
                'url' => self::safeUrl($row['url']),
            ];
        }

        if ($items === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 4;

        return [
            'type' => 'product-grid',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => max(2, min(5, $columns)),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function logoCloudBlock(array $data = []): ?array
    {
        $rows = self::pipeRows($data['items'] ?? null, ['name', 'image', 'url'], 24);
        $items = [];

        foreach ($rows as $row) {
            $image = Media::url($row['image']);
            if ($row['name'] === '' && $image === '') {
                continue;
            }

            $items[] = [
                'name' => $row['name'],
                'image' => $image,
                'url' => self::safeUrl($row['url']),
            ];
        }

        if ($items === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 4;

        return [
            'type' => 'logo-cloud',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => max(2, min(6, $columns)),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function headingBlock(string $variant, array $data = []): ?array
    {
        $title = self::text($data, 'title', '');
        $text = self::text($data, 'text', '');
        $eyebrow = self::text($data, 'eyebrow', '');
        if ($title === '' && $text === '' && $eyebrow === '') {
            return null;
        }

        return [
            'type' => 'heading',
            'variant' => self::blockVariant($variant, ['plain', 'bar', 'center', 'boxed'], 'plain'),
            'eyebrow' => $eyebrow,
            'title' => $title,
            'text' => $text,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function buttonGroupBlock(string $variant, array $data = []): ?array
    {
        $items = [];
        foreach (self::pipeRows($data['items'] ?? null, ['label', 'url', 'style', 'icon'], 8) as $row) {
            $url = self::safeUrl($row['url']);
            if ($row['label'] === '' || $url === '') {
                continue;
            }

            $items[] = [
                'label' => $row['label'],
                'url' => $url,
                'style' => in_array($row['style'], ['primary', 'outline', 'ghost'], true)
                    ? $row['style']
                    : 'primary',
                'icon' => in_array($row['icon'], ['arrow', 'plus', 'download', 'external'], true)
                    ? $row['icon']
                    : '',
            ];
        }

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'button-group',
            'variant' => self::blockVariant($variant, ['inline', 'center', 'stack'], 'inline'),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function infoCardsBlock(array $data = []): ?array
    {
        $items = [];
        foreach (self::pipeRows($data['items'] ?? null, ['icon', 'title', 'tag', 'text', 'url'], 12) as $row) {
            if ($row['title'] === '' && $row['text'] === '') {
                continue;
            }

            $items[] = [
                'icon' => in_array(
                    $row['icon'],
                    ['sparkles', 'shield', 'zap', 'book', 'users', 'message', 'star', 'globe', 'layers'],
                    true
                ) ? $row['icon'] : 'sparkles',
                'title' => $row['title'],
                'tag' => $row['tag'],
                'text' => $row['text'],
                'url' => self::safeUrl($row['url']),
            ];
        }

        if ($items === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 3;

        return [
            'type' => 'info-cards',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => max(2, min(4, $columns)),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function partnerScrollBlock(string $variant, array $data = []): ?array
    {
        $items = [];
        foreach (self::pipeRows($data['items'] ?? null, ['name', 'image', 'url'], 30) as $row) {
            $image = Media::url($row['image']);
            if ($row['name'] === '' && $image === '') {
                continue;
            }

            $items[] = [
                'name' => $row['name'],
                'image' => $image,
                'url' => self::safeUrl($row['url']),
            ];
        }

        if ($items === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 4;
        $speed = is_numeric($data['speed'] ?? null) ? (int) $data['speed'] : 32;

        return [
            'type' => 'partner-scroll',
            'variant' => self::blockVariant($variant, ['marquee', 'grid', 'plain'], 'marquee'),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => max(2, min(6, $columns)),
            'speed' => max(8, min(120, $speed)),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function mediaSplitBlock(string $variant, array $data = []): ?array
    {
        $kind = (string) ($data['media_kind'] ?? 'image');
        $kind = in_array($kind, ['image', 'video', 'slides'], true) ? $kind : 'image';
        $media = Media::url($data['media'] ?? '');
        $slides = [];

        foreach ((array) ($data['slides'] ?? []) as $slide) {
            if (!is_array($slide)) {
                continue;
            }

            $image = Media::url($slide['image'] ?? '');
            $title = trim((string) ($slide['title'] ?? ''));
            $description = trim((string) ($slide['description'] ?? ''));
            if ($image === '' && $title === '' && $description === '') {
                continue;
            }

            $slides[] = [
                'image' => $image,
                'title' => $title,
                'description' => $description,
                'url' => self::safeUrl($slide['url'] ?? ''),
            ];
        }

        $items = [];
        foreach (self::pipeRows(
            $data['items'] ?? null,
            ['kind', 'title', 'text', 'media', 'url'],
            8
        ) as $row) {
            $itemKind = $row['kind'] === 'video' ? 'video' : 'image';
            $itemMedia = Media::url($row['media']);
            if ($row['title'] === '' && $itemMedia === '') {
                continue;
            }

            $items[] = [
                'kind' => $itemKind,
                'title' => $row['title'],
                'text' => $row['text'],
                'media' => $itemMedia,
                'poster' => '',
                'url' => self::safeUrl($row['url']),
            ];
        }

        if ($media === '' && $slides === [] && $items === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 2;

        return [
            'type' => 'media-split',
            'variant' => self::blockVariant($variant, ['split'], 'split'),
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'kind' => $kind,
            'media' => $media,
            'poster' => Media::url($data['poster'] ?? ''),
            'slides' => $slides,
            'columns' => max(2, min(3, $columns)),
            'items' => $items,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function postAuthorBlock(Archive $archive, array $data = []): array
    {
        $author = isset($archive->author) ? $archive->author : null;
        $uid = is_object($author)
            ? (int) ($author->uid ?? 0)
            : (int) ($archive->authorId ?? 0);
        $name = self::capture(static fn (): string => (string) $archive->author());
        $mail = is_object($author) ? (string) ($author->mail ?? '') : '';
        $url = is_object($author) ? (string) ($author->permalink ?? '') : '';
        if ($url === '' && $uid > 0) {
            $url = self::authorUrl($uid);
        }

        $showPosts = !isset($data['show_posts']) || (string) $data['show_posts'] !== '0';
        $limit = is_numeric($data['limit'] ?? null) ? (int) $data['limit'] : 4;
        $limit = max(1, min(8, $limit));
        $posts = $showPosts && $uid > 0 ? self::postSummariesByAuthor($uid, $limit) : [];

        return [
            'type' => 'post-author',
            'title' => self::text($data, 'title', '作者的其他文章'),
            'showAuthor' => !isset($data['show_author']) || (string) $data['show_author'] !== '0',
            'showPosts' => $showPosts,
            'author' => [
                'name' => $name !== '' ? $name : '作者',
                'avatar' => $uid > 0
                    ? Avatar::forUser($uid, $mail, 120)
                    : Avatar::url($mail, 120),
                'bio' => '',
                'url' => $url,
                'badge' => '作者',
                'posts' => count($posts),
                'comments' => 0,
            ],
            'posts' => $posts,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function pricingBlock(array $data = []): ?array
    {
        $rows = self::pipeRows(
            $data['plans'] ?? null,
            ['name', 'price', 'period', 'features', 'label', 'url', 'featured'],
            6
        );
        $plans = [];

        foreach ($rows as $row) {
            if ($row['name'] === '' && $row['price'] === '') {
                continue;
            }

            $features = [];
            foreach (preg_split('/[;；]/u', $row['features']) ?: [] as $feature) {
                $feature = trim($feature);
                if ($feature !== '') {
                    $features[] = $feature;
                }
            }

            $plans[] = [
                'name' => $row['name'],
                'price' => $row['price'],
                'period' => $row['period'],
                'features' => $features,
                'action' => [
                    'label' => $row['label'] !== '' ? $row['label'] : '了解详情',
                    'url' => self::safeUrl($row['url'], '#'),
                ],
                'featured' => $row['featured'] === '1' || $row['featured'] === 'true',
            ];
        }

        if ($plans === []) {
            return null;
        }

        $columns = is_numeric($data['columns'] ?? null) ? (int) $data['columns'] : 4;

        return [
            'type' => 'pricing',
            'title' => self::text($data, 'title', ''),
            'text' => self::text($data, 'text', ''),
            'columns' => max(2, min(4, $columns)),
            'plans' => $plans,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function authorCardBlock(Archive $archive, array $data = []): array
    {
        $site = self::site($archive);
        $avatar = self::safeUrl(
            $data['avatar'] ?? '',
            $site['logo'] !== '' ? $site['logo'] : Assets::url('img/null.svg')
        );
        $links = [];

        foreach (self::pipeRows($data['links'] ?? null, ['label', 'url'], 6) as $row) {
            $url = self::safeUrl($row['url']);
            if ($row['label'] !== '' && $url !== '') {
                $links[] = ['label' => $row['label'], 'url' => $url];
            }
        }

        return [
            'type' => 'author-card',
            'name' => self::text($data, 'name', $site['title']),
            'role' => self::text($data, 'role', ''),
            'bio' => self::text($data, 'bio', $site['description']),
            'avatar' => $avatar,
            'links' => $links,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function subscribeBlock(Archive $archive, array $data = []): array
    {
        $site = self::site($archive);
        $primaryLabel = self::text($data, 'action_label', 'RSS 订阅');
        $primaryUrl = self::safeUrl($data['action_url'] ?? '', $site['feedUrl']);
        $secondaryLabel = self::text($data, 'secondary_label', '');
        $secondaryUrl = self::safeUrl($data['secondary_url'] ?? '');
        $actions = [];

        if ($primaryLabel !== '' && $primaryUrl !== '') {
            $actions[] = ['label' => $primaryLabel, 'url' => $primaryUrl, 'style' => 'primary'];
        }

        if ($secondaryLabel !== '' && $secondaryUrl !== '') {
            $actions[] = ['label' => $secondaryLabel, 'url' => $secondaryUrl, 'style' => 'ghost'];
        }

        return [
            'type' => 'subscribe',
            'eyebrow' => self::text($data, 'eyebrow', ''),
            'title' => self::text($data, 'title', '订阅更新'),
            'text' => self::text($data, 'text', '在 RSS 阅读器里跟进最新内容。'),
            'actions' => $actions,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function linkListBlock(array $data = []): ?array
    {
        $items = [];

        foreach (self::pipeRows($data['items'] ?? null, ['label', 'description', 'url'], 12) as $row) {
            $url = self::safeUrl($row['url']);
            if ($row['label'] === '' || $url === '') {
                continue;
            }

            $items[] = [
                'label' => $row['label'],
                'description' => $row['description'],
                'url' => $url,
            ];
        }

        if ($items === []) {
            return null;
        }

        return [
            'type' => 'link-list',
            'title' => self::text($data, 'title', ''),
            'items' => $items,
        ];
    }

    /**
     * @param list<string> $allowed
     */
    private static function blockVariant(string $variant, array $allowed, string $fallback): string
    {
        return in_array($variant, $allowed, true) ? $variant : $fallback;
    }

    /**
     * @param list<string> $keys
     * @return list<array<string, string>>
     */
    private static function pipeRows(mixed $value, array $keys, int $limit): array
    {
        $rows = [];

        foreach (self::lines($value, $limit) as $line) {
            $cells = explode('|', $line);
            $row = [];
            $empty = true;

            foreach ($keys as $index => $key) {
                $cell = self::clip((string) ($cells[$index] ?? ''), 300);
                $row[$key] = $cell;
                if ($cell !== '') {
                    $empty = false;
                }
            }

            if (!$empty) {
                $rows[] = $row;
            }
        }

        return $rows;
    }

    /**
     * @return list<list<string>>
     */
    private static function tableRows(mixed $value, int $columns, int $limit): array
    {
        $columns = max(1, min(8, $columns));
        $rows = [];

        foreach (self::lines($value, $limit) as $line) {
            $cells = array_map(
                static fn (string $cell): string => self::clip(trim($cell), 300),
                explode('|', $line)
            );
            $cells = array_slice($cells, 0, $columns);

            while (count($cells) < $columns) {
                $cells[] = '';
            }

            if (trim(implode('', $cells)) === '') {
                continue;
            }

            $rows[] = array_values($cells);
        }

        return $rows;
    }

    /**
     * @return list<string>
     */
    private static function cells(mixed $value): array
    {
        if (!is_string($value)) {
            return [];
        }

        return array_map(
            static fn (string $cell): string => self::clip(trim($cell), 120),
            explode('|', $value)
        );
    }

    /**
     * @return list<string>
     */
    private static function lines(mixed $value, int $limit): array
    {
        if (!is_string($value)) {
            return [];
        }

        $lines = preg_split('/\r\n|\r|\n/', $value);
        if (!is_array($lines)) {
            return [];
        }

        $result = [];

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            $result[] = self::clip($line, 600);
            if (count($result) >= $limit) {
                break;
            }
        }

        return $result;
    }

    private static function clip(string $value, int $limit): string
    {
        $value = trim($value);
        if ($value === '' || $limit <= 0) {
            return '';
        }

        return function_exists('mb_substr')
            ? mb_substr($value, 0, $limit)
            : substr($value, 0, $limit);
    }

    private static function safeUrl(mixed $value, string $fallback = ''): string
    {
        if (!is_scalar($value)) {
            return $fallback;
        }

        $url = trim((string) $value);
        $url = preg_replace('/[\x00-\x1F\x7F]+/', '', $url) ?? '';

        if ($url === '' || strlen($url) > 2048 || str_contains($url, '\\')) {
            return $fallback;
        }

        if (preg_match('/^([a-z][a-z0-9+.-]*):/i', $url, $match) === 1) {
            $scheme = strtolower($match[1]);

            return in_array($scheme, ['http', 'https', 'mailto', 'tel'], true) ? $url : $fallback;
        }

        if (str_starts_with($url, '//')) {
            return $fallback;
        }

        if (str_starts_with($url, '/') || str_starts_with($url, '#') || str_starts_with($url, '?')) {
            return $url;
        }

        if (preg_match('#(^|/)\.\.(/|$)#', $url) === 1) {
            return $fallback;
        }

        return $url;
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
            'active' => self::navActive($siteUrl, $currentUrl),
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
                    $childUrl = self::safeUrl($child['url'] ?? '');
                    $children[] = [
                        'label' => (string) ($child['label'] ?? ''),
                        'url' => $childUrl,
                        'active' => self::navActive($childUrl, $currentUrl),
                        'icon' => self::navIcon($child['icon'] ?? ''),
                    ];
                }

                $itemUrl = self::safeUrl($item['url'] ?? '');
                $nav[] = [
                    'label' => (string) ($item['label'] ?? ''),
                    'url' => $itemUrl,
                    'active' => self::navActive($itemUrl, $currentUrl),
                    'icon' => self::navIcon($item['icon'] ?? ''),
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
                    'icon' => '',
                ];
            }
        }

        return [
            'title' => trim((string) ($options?->title ?? '')),
            'description' => trim((string) ($options?->description ?? '')),
            'url' => $siteUrl,
            'apiBase' => self::apiBase($siteUrl),
            'feedUrl' => trim((string) ($options?->feedUrl ?? '')),
            'logo' => Media::url((string) Options::instance()->get('Logo', '')),
            'subtitle' => trim((string) ($values['SubTitle'] ?? '')),
            'footerText' => trim((string) ($values['FooterText'] ?? '')),
            'showTitle' => $showTitle,
            'nav' => $nav,
            'year' => (int) date('Y'),
            'frameworkVersion' => Framework::VERSION,
            'themeVersion' => Typecho::themeVersion(),
            'translate' => self::translateConfig($values),
        ];
    }

    private static function navIcon(mixed $value): string
    {
        if (!is_scalar($value)) {
            return '';
        }

        $icon = strtolower(trim((string) $value));

        return preg_match('/^[a-z0-9-]{1,48}$/D', $icon) === 1 ? $icon : '';
    }

    private static function apiBase(string $siteUrl): string
    {
        $index = rtrim(Typecho::indexUrl(), '/');
        if ($index === '') {
            $index = rtrim($siteUrl, '/');
        }

        return $index . '/ttdf/sunken';
    }

    /**
     * @param array<string, mixed> $values
     * @return array{enabled: bool, script: string, local: string, service: string, languages: list<array{code: string, label: string}>}
     */
    private static function translateConfig(array $values): array
    {
        $labels = [
            'english' => 'English',
            'chinese_simplified' => '简体中文',
            'chinese_traditional' => '繁體中文',
            'japanese' => '日本語',
            'korean' => '한국어',
            'french' => 'Français',
            'german' => 'Deutsch',
            'spanish' => 'Español',
            'russian' => 'Русский',
            'portuguese' => 'Português',
            'italian' => 'Italiano',
            'arabic' => 'العربية',
            'thai' => 'ไทย',
            'vietnamese' => 'Tiếng Việt',
            'indonesian' => 'Bahasa Indonesia',
            'turkish' => 'Türkçe',
        ];
        $raw = $values['Translate_Languages'] ?? [];
        $codes = is_array($raw) ? $raw : [$raw];
        $languages = [];
        $seen = [];

        foreach ($codes as $value) {
            if (!is_scalar($value)) {
                continue;
            }
            $code = strtolower(trim((string) $value));
            if ($code === '' || preg_match('/^[a-z0-9_]+$/', $code) !== 1 || isset($seen[$code])) {
                continue;
            }
            $seen[$code] = true;
            $languages[] = [
                'code' => $code,
                'label' => $labels[$code] ?? $code,
            ];
            if (count($languages) >= 16) {
                break;
            }
        }

        $script = trim((string) ($values['Translate_Script'] ?? ''));
        if (filter_var($script, FILTER_VALIDATE_URL) === false) {
            $script = 'https://res.zvo.cn/translate/translate.js';
        }

        $local = strtolower(trim((string) ($values['Translate_Local'] ?? 'chinese_simplified')));
        if (preg_match('/^[a-z0-9_]+$/', $local) !== 1) {
            $local = 'chinese_simplified';
        }

        $service = strtolower(trim((string) ($values['Translate_Service'] ?? 'client.edge')));
        if (!in_array($service, ['client.edge', 'translate.service'], true)) {
            $service = 'client.edge';
        }

        return [
            'enabled' => ($values['Translate_Enabled'] ?? false) === true && $languages !== [],
            'script' => $script,
            'local' => $local,
            'service' => $service,
            'languages' => $languages,
        ];
    }

    private static function currentUrl(?Archive $archive): string
    {
        if ($archive !== null && is_callable([$archive, 'is']) && !$archive->is('index')) {
            $type = $archive->type ?? null;
            if (is_string($type) && $type !== '') {
                $permalink = trim((string) ($archive->permalink ?? ''));
                if ($permalink !== '') {
                    return $permalink;
                }
            }
            // Search and 404 archives have no routing type, so fall through
            // to the request path instead of treating them as the homepage.
        }

        $requestPath = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
        if ($requestPath !== '') {
            return (string) preg_replace('#/index\.php$#i', '/', $requestPath);
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
            $urlPath = rtrim($urlPath, '/');
            $currentPath = rtrim($currentPath, '/');

            return $urlPath === $currentPath
                || ($urlPath !== '' && str_starts_with($currentPath, $urlPath . '/'));
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
            'showUserCenter' => ($values['Show_UserCenter'] ?? false) === true,
            'sidebarPosition' => in_array($sidebarPosition, ['left', 'right'], true)
                ? $sidebarPosition
                : 'right',
            'sidebarSticky' => ($values['Sidebar_Sticky'] ?? true) === true,
            'footerLayout' => in_array($footerLayout, ['columns', 'compact', 'centered'], true)
                ? $footerLayout
                : 'columns',
            'footerShowCategories' => ($values['Footer_Show_Categories'] ?? true) === true,
            'footerShowTags' => ($values['Footer_Show_Tags'] ?? true) === true,
            'footerModules' => self::footerModules($values['Footer_Blocks'] ?? null),
            'layoutModules' => self::layoutModules($values['Layout_Modules'] ?? null),
            'blockAnimations' => ($values['Block_Animations'] ?? true) === true,
            'blockAnimationEffect' => self::blockAnimationEffect($values['Block_Animation_Effect'] ?? null),
            'shareEnabled' => ($values['Share_Enabled'] ?? true) === true,
            'shareItems' => self::shareItems($values['Share_Items'] ?? null),
            'sharePosterBrand' => trim((string) ($values['Share_Poster_Brand'] ?? '')),
            'pageWidth' => self::pageWidth($values['Page_Width'] ?? null),
        ];
    }

    /**
     * @return list<string>
     */
    private static function shareItems(mixed $value): array
    {
        $allowed = ['qzone', 'weibo', 'qq', 'x', 'reddit', 'facebook', 'telegram', 'copy', 'native', 'poster'];
        $items = is_array($value) ? $value : [];
        $result = [];
        foreach ($items as $item) {
            $item = is_scalar($item) ? strtolower(trim((string) $item)) : '';
            if ($item === '' || !in_array($item, $allowed, true) || in_array($item, $result, true)) {
                continue;
            }
            $result[] = $item;
        }

        return $result === [] ? ['copy'] : $result;
    }

    /**
     * Sharing settings are reused by articles and forum topics.
     *
     * @return array{enabled: bool, items: list<string>, brand: string}
     */
    public static function shareConfig(): array
    {
        $values = Settings::values();

        return [
            'enabled' => ($values['Share_Enabled'] ?? true) === true,
            'items' => self::shareItems($values['Share_Items'] ?? null),
            'brand' => trim((string) ($values['Share_Poster_Brand'] ?? '')),
        ];
    }

    private static function blockAnimationEffect(mixed $value): string
    {
        $effect = is_scalar($value) ? trim((string) $value) : 'fade-up';

        return in_array(
            $effect,
            ['fade-up', 'fade', 'zoom', 'slide-left', 'slide-right'],
            true
        ) ? $effect : 'fade-up';
    }

    private static function blockWidth(array $data): string
    {
        $width = (string) ($data['width'] ?? 'content');

        return in_array($width, ['content', 'half', 'full'], true) ? $width : 'content';
    }

    /**
     * Shared layout knobs for every block: width, vertical rhythm and an
     * optional minimum height for full-bleed sections.
     *
     * @return array<string, string>
     */
    private static function blockLayout(array $data): array
    {
        $space = static function (mixed $value): string {
            $value = is_scalar($value) ? (string) $value : 'default';

            return in_array($value, ['default', 'none', 'sm', 'md', 'lg', 'xl'], true)
                ? $value
                : 'default';
        };

        $height = is_scalar($data['min_height'] ?? null) ? trim((string) $data['min_height']) : '';
        if ($height !== '' && preg_match('/^\d{1,4}(?:px|vh|rem|em|%)$/', $height) !== 1) {
            $height = '';
        }

        return [
            'width' => self::blockWidth($data),
            'spaceTop' => $space($data['space_top'] ?? 'default'),
            'spaceBottom' => $space($data['space_bottom'] ?? 'default'),
            'minHeight' => $height,
        ];
    }

    private static function pageWidth(mixed $value): int
    {
        $width = is_numeric($value) ? (int) $value : 1300;

        return max(960, min(1600, $width));
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
     * @return list<array{name: string, variant: string, data: array<string, string>}>
     */
    private static function footerModules(mixed $value): array
    {
        $items = is_array($value) ? $value : [];
        $modules = [];

        foreach ($items as $item) {
            $spec = self::normalizeSpec($item);
            if ($spec === null || !in_array($spec['name'], self::FOOTER_MODULES, true)) {
                continue;
            }

            $modules[] = [
                'name' => $spec['name'],
                'variant' => $spec['variant'],
                'data' => self::footerModuleData($spec['data']),
            ];
        }

        if ($modules !== []) {
            return $modules;
        }

        foreach (['brand', 'nav', 'categories', 'tags', 'meta'] as $name) {
            $modules[] = ['name' => $name, 'variant' => '', 'data' => []];
        }

        return $modules;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, string>
     */
    private static function footerModuleData(array $data): array
    {
        $result = [];

        foreach (['title', 'text'] as $key) {
            $value = $data[$key] ?? '';
            if (is_string($value) && trim($value) !== '') {
                $result[$key] = trim($value);
            }
        }

        return $result;
    }

    /**
     * The v2 surface is preferred for same-origin theme requests because its
     * public extension routes do not require the optional v1 bearer token.
     * When v2 is off, fall back to v1 only while its token switch is off.
     *
     * @return array<string, mixed>
     */
    public static function api(): array
    {
        $index = Typecho::indexUrl();
        if ($index === '') {
            $index = Typecho::siteUrl();
        }

        $base = rtrim($index, '/') . '/ttdf/sunken';
        $v2Base = rtrim($index, '/') . '/' . Prefixes::v2();
        $values = Settings::values();
        $mailConfigured = Mailer::configured();
        $smsConfigured = Sms::configured();
        $registerVerify = ($values['Mail_Verify_Register'] ?? false) === true;
        $smsVerifyRequested = ($values['Sms_Verify_Register'] ?? false) === true;
        $smsRegisterVerify = UserProfile::enabled() && $smsVerifyRequested;
        $resetVerify = ($values['Mail_Verify_Reset'] ?? false) === true;
        $emailVerify = ($values['Mail_Verify_Email'] ?? false) === true;
        $allowRegister = (bool) (Typecho::options()?->allowRegister ?? false);
        $userCenterEnabled = ($values['Show_UserCenter'] ?? false) === true;
        $userApiReady = ThemeConfig::restV2Enabled();

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
                'enabled' => $userCenterEnabled && $userApiReady,
                'centerEnabled' => $userCenterEnabled,
                'apiReady' => $userApiReady,
                'admin' => Typecho::isAdmin(),
                'session' => $v2Base . '/auth/session',
                'login' => $v2Base . '/auth/login',
                'register' => $v2Base . '/auth/register',
                'registerEnabled' => $allowRegister
                    && (!$registerVerify || $mailConfigured)
                    && (!$smsVerifyRequested || ($smsRegisterVerify && $smsConfigured)),
                'registerVerify' => $registerVerify,
                'smsVerify' => $smsRegisterVerify && $smsConfigured,
                'smsCode' => Endpoint::url('sms-code'),
                'emailCode' => $v2Base . '/auth/email-code',
                'resetPassword' => $v2Base . '/auth/reset-password',
                'resetEnabled' => $resetVerify && $mailConfigured,
                'emailVerify' => $emailVerify,
                'emailChangeEnabled' => !$emailVerify || $mailConfigured,
                'password' => $v2Base . '/auth/password',
                'logout' => $v2Base . '/auth/logout',
                'me' => $v2Base . '/me',
                'profile' => Endpoint::url('user-profile'),
                'profileNonce' => Typecho::securityToken(),
                'enhanced' => UserProfile::enabled(),
                'certificationEnabled' => UserProfile::certificationEnabled(),
                'certification' => Endpoint::url('user-certification'),
                'certificationNonce' => Typecho::securityToken(),
                'avatarMedia' => $v2Base . '/media',
                'avatarMediaEnabled' => $userApiReady
                    && UserProfile::enabled()
                    && UserProfile::viewerUid() > 0,
                'downloads' => Downloads::client(),
                'economy' => UserEconomy::client(),
                'captcha' => Captcha::client(),
                'operations' => UserEconomy::operationsClient(),
                'pages' => [
                    'profile' => rtrim($index, '/') . '/user/profile',
                    'account' => rtrim($index, '/') . '/user/account',
                    'social' => rtrim($index, '/') . '/user/social',
                    'content' => rtrim($index, '/') . '/user/content',
                    'editor' => rtrim($index, '/') . '/user/content/editor',
                    'downloads' => rtrim($index, '/') . '/user/downloads',
                    'operations' => rtrim($index, '/') . '/operations',
                    'space' => rtrim($index, '/') . '/users',
                ],
                'content' => [
                    'enabled' => $userCenterEnabled && $userApiReady && UserProfile::canWrite(),
                    'permitted' => $userCenterEnabled && UserProfile::canWrite(),
                    'contents' => $v2Base . '/admin/contents',
                    'item' => $v2Base . '/admin/contents',
                    'posts' => $v2Base . '/admin/posts',
                    'categories' => $v2Base . '/admin/categories',
                    'comments' => $v2Base . '/me/comments',
                    'media' => $v2Base . '/media',
                    'batch' => Endpoint::url('article-batch'),
                ],
                'forum' => self::userForumApi(),
                'mailConfigured' => $mailConfigured,
                'oauth' => OAuth::client(),
            ],
        ];
    }

    /**
     * Forum capabilities for the account panel. The content endpoint uses the
     * theme AJAX entry because it is an authenticated read of the viewer's own
     * topics and circles, not a public REST resource.
     *
     * @return array<string, mixed>
     */
    private static function userForumApi(): array
    {
        $context = Forum::viewerContext();
        $permissions = $context['permissions'];
        $values = Settings::values();
        $label = trim((string) ($values['Forum_Display_Name'] ?? ''));
        $title = trim((string) ($values['Forum_Title'] ?? ''));

        return [
            'enabled' => (bool) $context['enabled'],
            'label' => $label !== '' ? $label : '圈子',
            'title' => $title !== '' ? $title : ($label !== '' ? $label : '圈子广场'),
            'content' => Endpoint::url('forum-user-content'),
            'moderation' => Endpoint::url('forum-moderation'),
            'topicUpdate' => Endpoint::url('forum-topic-update'),
            'topicDelete' => Endpoint::url('forum-topic-delete'),
            'nonce' => Typecho::securityToken(),
            'home' => Forum::homeUrl(),
            'editor' => Forum::editorUrl(),
            'canPost' => (bool) ($permissions['createTopic'] ?? false),
            'canCreateCircle' => (bool) ($permissions['createCircle'] ?? false),
            'canModerate' => (bool) ($permissions['moderate'] ?? false),
            'kinds' => Forum::topicKindOptions(Settings::values()),
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
                        ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
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
        $excerpt = trim(self::plainText((string) ($post['excerpt'] ?? '')));
        if ($excerpt === '') {
            $excerpt = trim(self::plainText($text));
        }

        return $excerpt !== '' ? \Typecho\Common::subStr($excerpt, 0, $length, '…') : '';
    }

    private static function readingMinutes(string $text): int
    {
        $plain = self::plainText($text);

        return max(1, (int) ceil(mb_strlen($plain, 'UTF-8') / 500));
    }

    /**
     * Turn stored HTML or Markdown into a compact plain-text preview.
     */
    private static function plainText(string $text): string
    {
        if ($text === '') {
            return '';
        }

        $text = (string) preg_replace('/<!--.*?-->/s', ' ', $text);
        $text = ContentComponents::stripShortcodes($text);
        $text = (string) preg_replace('/```.*?```/s', ' ', $text);
        $text = (string) preg_replace('/!\[[^\]]*\]\((?:[^()]|\([^)]*\))*\)/u', ' ', $text);
        $text = (string) preg_replace('/!\[[^\]]*\]\[[^\]]*\]/u', ' ', $text);
        $text = (string) preg_replace('/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/u', '$1', $text);
        $text = (string) preg_replace('/\[([^\]]+)\]\[[^\]]*\]/u', '$1', $text);
        $text = (string) preg_replace('/^[ \t]{0,3}#{1,6}[ \t]*/mu', '', $text);
        $text = (string) preg_replace('/^[ \t]*>[ \t]?/mu', '', $text);
        $text = (string) preg_replace('/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/mu', '', $text);
        $text = (string) preg_replace('/(\*\*|__|~~|`)/u', '', $text);
        $text = strip_tags($text);
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim((string) preg_replace('/\s+/u', ' ', $text));
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
            $excerpt = trim(strip_tags(ContentComponents::stripShortcodes(
                (string) ($archive->excerpt ?? '')
            )));
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
                    ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
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

    /**
     * Random article cards are resolved from the content table instead of the
     * current archive page so the module can mix articles from the whole site.
     *
     * @return list<array<string, mixed>>
     */
    private static function randomPostSummaries(int $limit, string $category = ''): array
    {
        if (!class_exists('Typecho\\Db')) {
            return [];
        }

        $limit = max(1, min(30, $limit));

        try {
            $db = \Typecho\Db::get();
            $cids = [];

            if ($category !== '') {
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
                foreach ($cidRows as $cidRow) {
                    $cid = (int) ($cidRow['cid'] ?? 0);
                    if ($cid > 0) {
                        $cids[] = $cid;
                    }
                }

                if ($cids === []) {
                    return [];
                }
            }

            $options = Typecho::options();
            $now = (int) ($options?->time ?? time());
            $query = $db->select('cid', 'title', 'slug', 'created', 'text', 'commentsNum', 'authorId')
                ->from('table.contents')
                ->where('type = ?', 'post')
                ->where('status = ?', 'publish')
                ->where('created < ?', $now)
                ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '');
            if ($cids !== []) {
                $query->where('cid IN ?', $cids);
            }

            $rows = $db->fetchAll(
                $query->order('created', \Typecho\Db::SORT_DESC)->limit(300)
            );
            $rows = array_values(array_filter($rows, 'is_array'));
            shuffle($rows);
            $rows = array_slice($rows, 0, $limit);

            $siteUrl = Typecho::siteUrl();
            $topicIds = array_map(
                static fn (array $row): int => (int) ($row['cid'] ?? 0),
                $rows
            );
            $views = ArticleViews::counts($topicIds);
            self::primeThumbnailFields($topicIds);
            $items = [];

            foreach ($rows as $row) {
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
            error_log('TTDF random post lookup failed: ' . $exception->getMessage());

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
     * @return list<array<string, mixed>>
     */
    private static function postSummariesByAuthor(int $uid, int $limit = 4): array
    {
        if ($uid <= 0 || !class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $options = Typecho::options();
            $now = (int) ($options?->time ?? time());
            $rows = $db->fetchAll(
                $db->select('cid', 'title', 'slug', 'created', 'text', 'commentsNum', 'authorId')
                    ->from('table.contents')
                    ->where('type = ?', 'post')
                    ->where('status = ?', 'publish')
                    ->where('authorId = ?', $uid)
                    ->where('created < ?', $now)
                    ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
                    ->order('created', \Typecho\Db::SORT_DESC)
                    ->limit(max(1, min(12, $limit)))
            );

            $siteUrl = Typecho::siteUrl();
            $rows = is_array($rows) ? $rows : [];
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
            error_log('TTDF author post lookup failed: ' . $exception->getMessage());

            return [];
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
        if ($useFirstImage) {
            $firstImage = self::firstBodyImage(ContentGate::redact($text), $siteUrl);
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
     * Resolve the configured default thumbnail for content that does not live
     * in Typecho's contents table, such as forum topics.
     */
    public static function fallbackThumbnail(int $key = 0): string
    {
        $values = Settings::values();
        $thumbnail = self::defaultThumbnail(
            $key,
            $values['Thumbnail_Default'] ?? '',
            Typecho::siteUrl()
        );

        return $thumbnail !== '' ? $thumbnail : Assets::url('img/thumbnail.svg');
    }

    /**
     * Find the first usable image in the stored body text.
     *
     * Typecho themes receive both rendered HTML and raw Markdown for older
     * posts, so checking only `<img src>` misses the common
     * `![alt](url)` form. Lazy-loaded markup often keeps the real URL in
     * `data-src`/`data-original`, which is preferred over a placeholder `src`.
     */
    public static function firstBodyImage(string $text, string $siteUrl): string
    {
        $candidates = [];

        if (preg_match_all('/<img\b[^>]*>/i', $text, $tags, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($tags[0] as $tag) {
                $url = self::imageUrlFromTag((string) $tag[0]);
                if ($url !== '') {
                    $candidates[] = ['offset' => (int) $tag[1], 'url' => $url];
                }
            }
        }

        $markdown = '/!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+["\'][^"\']*["\'])?\s*\)/u';
        if (preg_match_all($markdown, $text, $images, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($images[1] as $index => $image) {
                $candidates[] = [
                    'offset' => (int) ($images[0][$index][1] ?? 0),
                    'url' => (string) $image[0],
                ];
            }
        }

        $references = [];
        $definition = '/^\s{0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?(?:\s+(?:"[^"]*"|\'[^\']*\'|\([^)]*\)))?\s*$/mu';
        if (preg_match_all($definition, $text, $definitions, PREG_SET_ORDER) > 0) {
            foreach ($definitions as $match) {
                $label = self::referenceLabel((string) ($match[1] ?? ''));
                $url = (string) ($match[2] ?? '');
                if ($label !== '' && $url !== '') {
                    $references[$label] = $url;
                }
            }
        }

        if (
            $references !== []
            && preg_match_all('/!\[([^\]]*)\]\[([^\]]*)\]/u', $text, $images, PREG_OFFSET_CAPTURE) > 0
        ) {
            foreach ($images[1] as $index => $alt) {
                $label = (string) ($images[2][$index][0] ?? '');
                if ($label === '') {
                    $label = (string) $alt[0];
                }
                $url = $references[self::referenceLabel($label)] ?? '';
                if ($url !== '') {
                    $candidates[] = [
                        'offset' => (int) ($images[0][$index][1] ?? 0),
                        'url' => $url,
                    ];
                }
            }
        }

        usort(
            $candidates,
            static fn (array $left, array $right): int => $left['offset'] <=> $right['offset']
        );

        foreach ($candidates as $candidate) {
            $url = self::resolveThumbnailUrl($candidate['url'], $siteUrl);
            if ($url !== '') {
                return $url;
            }
        }

        return '';
    }

    private static function referenceLabel(string $label): string
    {
        $label = trim($label);

        return function_exists('mb_strtolower')
            ? mb_strtolower($label, 'UTF-8')
            : strtolower($label);
    }

    private static function imageUrlFromTag(string $tag): string
    {
        $attributes = [];
        $pattern = '/\b(src|data-src|data-original|srcset)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+))/i';

        if (
            preg_match_all($pattern, $tag, $matches, PREG_SET_ORDER) > 0
        ) {
            foreach ($matches as $match) {
                $name = strtolower((string) ($match[1] ?? ''));
                $value = (string) ($match[2] ?? '');
                if ($value === '') {
                    $value = (string) ($match[3] ?? '');
                }
                if ($value === '') {
                    $value = (string) ($match[4] ?? '');
                }

                $value = trim(html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
                if ($value !== '' && !str_starts_with(strtolower($value), 'data:')) {
                    $attributes[$name][] = $value;
                }
            }
        }

        foreach (['data-src', 'data-original', 'src', 'srcset'] as $name) {
            foreach ($attributes[$name] ?? [] as $value) {
                if ($name === 'srcset') {
                    $value = trim((string) preg_split('/\s+/', $value)[0]);
                }

                if ($value !== '') {
                    return $value;
                }
            }
        }

        return '';
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
            $value = self::resolveRelativeUrl($value, $siteUrl);
        }

        return Media::url($value);
    }

    private static function resolveRelativeUrl(string $value, string $siteUrl): string
    {
        $parts = parse_url($value);
        if (!is_array($parts) || !isset($parts['path'])) {
            return rtrim($siteUrl, '/') . '/' . ltrim($value, '/');
        }

        $segments = [];
        foreach (explode('/', (string) $parts['path']) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            if ($segment === '..') {
                array_pop($segments);
                continue;
            }

            $segments[] = $segment;
        }

        $suffix = '';
        if (isset($parts['query'])) {
            $suffix .= '?' . $parts['query'];
        }
        if (isset($parts['fragment'])) {
            $suffix .= '#' . $parts['fragment'];
        }

        $path = implode('/', $segments);

        return rtrim($siteUrl, '/') . ($path === '' ? '' : '/' . $path) . $suffix;
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

    private static function fieldString(int $cid, string $name): string
    {
        if ($cid <= 0 || $name === '' || !class_exists('Typecho\\Db')) {
            return '';
        }

        try {
            $db = \Typecho\Db::get();
            $row = $db->fetchRow(
                $db->select('type', 'str_value', 'int_value', 'float_value')
                    ->from('table.fields')
                    ->where('cid = ?', $cid)
                    ->where('name = ?', $name)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return '';
        }

        return is_array($row) ? self::fieldValue($row) : '';
    }

    private static function fieldInt(int $cid, string $name): int
    {
        return max(0, (int) self::fieldString($cid, $name));
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
                'slug' => (string) $rows->slug,
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
        $likes = self::fieldInt($cid, 'likesNum');
        $timeMode = (string) (Settings::values()['Post_Time_Mode'] ?? 'published');
        $updated = (int) ($archive->modified ?? 0);
        $useUpdated = $timeMode === 'updated' && $updated > 0;
        $updatedDate = $useUpdated ? new Date($updated) : null;

        return [
            'date' => $useUpdated && $updatedDate !== null
                ? '更新于 ' . $updatedDate->format('Y-m-d')
                : self::capture(static fn () => $archive->date('Y-m-d')),
            'dateIso' => $useUpdated && $updatedDate !== null
                ? $updatedDate->format('c')
                : self::capture(static fn () => $archive->date('c')),
            'author' => self::capture(static fn () => $archive->author()),
            'commentsText' => self::capture(static fn () => $archive->commentsNum(
                '暂无评论',
                '1 条评论',
                '%d 条评论'
            )),
            'categories' => self::categoriesOf($archive),
            'views' => $views,
            'viewsText' => $views > 0 ? (string) $views : '0',
            'likes' => $likes,
            'likesText' => $likes > 0 ? (string) $likes : '0',
        ];
    }

    private static function contentLayout(Archive $archive): string
    {
        $layout = self::fieldString((int) ($archive->cid ?? 0), 'Display_Layout');

        return in_array($layout, ['default', 'wide', 'narrow'], true) ? $layout : 'default';
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
        $data['mediaEndpoint'] = rtrim($indexUrl, '/') . '/' . Prefixes::v2() . '/media';
        $data['mediaEnabled'] = ThemeConfig::restV2Enabled() && UserProfile::canWrite();
        $data['captcha'] = Captcha::client();
        $data['pageSize'] = 20;
        $values = Settings::values();
        $data['collapsed'] = ($values['Comments_Collapsed'] ?? true) === true;
        $data['requireLogin'] = ($values['Comments_Require_Login'] ?? false) === true;
        $data['meme'] = ($values['Comments_Memes'] ?? true) === true ? Meme::client() : null;
        $data['auth'] = null;
        if (ThemeConfig::restV2Enabled()) {
            $api = self::api();
            $data['auth'] = is_array($api['user'] ?? null) ? $api['user'] : null;
        }

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
