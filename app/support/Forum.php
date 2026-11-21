<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Http\Rest\Prefixes;
use TTDF\Theme\Assets;
use TTDF\Theme\Settings;
use TTDF\Theme\ThemeConfig;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Built-in forum and circle module.
 *
 * The feature owns six tables (circles, topics, replies, members, reactions
 * and ratings). Tables are created lazily from the theme settings screen or a
 * successful settings save, never from a public request. Everything the
 * public reads is assembled into one JSON block consumed by React.
 */
final class Forum
{
    private const DEFAULT_TOPIC_KINDS = ['讨论', '提问', '分享'];

    private const MAX_TOPIC_TAGS = 8;

    private const MAX_TOPIC_TAG_LENGTH = 20;

    private const LEGACY_TOPIC_KIND_LABELS = [
        'discussion' => '讨论',
        'question' => '提问',
        'share' => '分享',
    ];

    private const GROUP_RANK = [
        'visitor' => 0,
        'subscriber' => 1,
        'contributor' => 2,
        'editor' => 3,
        'administrator' => 4,
    ];

    private const GROUP_LABELS = [
        'administrator' => '管理员',
        'editor' => '编辑',
        'contributor' => '贡献者',
        'subscriber' => '订阅者',
        'visitor' => '访客',
    ];

    private static bool $installed = false;

    private static bool $settingsWrite = false;

    /** @var array<int, array<string, mixed>> */
    private static array $userCache = [];

    /** @var array<int, array<string, mixed>> */
    private static array $circleCache = [];

    /** @var array<string, mixed>|null */
    private static ?array $viewerCache = null;

    public static function register(): void
    {
        Hooks::addFilter('customizer.block_fields', [self::class, 'customizerBlockFields']);
        Hooks::addFilter('customizer.preview_urls', [self::class, 'customizerPreviewUrls']);

        Endpoint::register('forum-topic-create', [self::class, 'handleTopicCreate'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-topic-update', [self::class, 'handleTopicUpdate'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-topic-delete', [self::class, 'handleTopicDelete'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-circle-create', [self::class, 'handleCircleCreate'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-circle-update', [self::class, 'handleCircleUpdate'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-reply-create', [self::class, 'handleReplyCreate'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-join', [self::class, 'handleJoin'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-react', [self::class, 'handleReact'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-rate', [self::class, 'handleRate'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-install', [self::class, 'handleInstall'], [
            'auth' => 'admin',
            'method' => 'POST',
        ]);
        Endpoint::register('forum-user-content', [self::class, 'handleUserContent'], [
            'auth' => 'user',
            'method' => 'GET',
        ]);
        Endpoint::register('forum-moderation', [self::class, 'handleModeration'], [
            'auth' => 'admin',
            'method' => 'ANY',
        ]);

        Hooks::addAction('rest.request', [self::class, 'restRequest']);
        Hooks::addFilter('rest.response', [self::class, 'restResponse']);
    }

    /**
     * Expose the forum layout fields to the TTDF customizer. The preview
     * route is resolved lazily so a fresh circle slug is picked after the
     * first circle is created.
     *
     * @param array<string, mixed> $fields
     * @return array<string, mixed>
     */
    public static function customizerBlockFields(mixed $fields): array
    {
        $map = is_array($fields) ? $fields : [];
        $map['Forum_Home_Blocks'] = ['kind' => 'forum-home', 'slot' => 'main'];
        $map['Forum_Home_Left_Blocks'] = ['kind' => 'forum-home', 'slot' => 'left'];
        $map['Forum_Home_Right_Blocks'] = ['kind' => 'forum-home', 'slot' => 'right'];
        $map['Forum_Circle_Blocks'] = ['kind' => 'forum-circle', 'slot' => 'main'];
        $map['Forum_Circle_Left_Blocks'] = ['kind' => 'forum-circle', 'slot' => 'left'];
        $map['Forum_Circle_Right_Blocks'] = ['kind' => 'forum-circle', 'slot' => 'right'];

        return $map;
    }

    /**
     * @param array<string, string> $urls
     * @return array<string, string>
     */
    public static function customizerPreviewUrls(mixed $urls): array
    {
        $map = is_array($urls) ? $urls : [];
        if (!self::enabled()) {
            return $map;
        }

        $map['forum-home'] = self::homeUrl();

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('slug')->from('table.sunken_forum_circles')
                    ->where('status = ?', 'publish')
                    ->order('sort', Db::SORT_DESC)
                    ->order('id', Db::SORT_ASC)
                    ->limit(1)
            );
        } catch (\Throwable) {
            $row = null;
        }

        $slug = is_array($row) ? trim((string) ($row['slug'] ?? '')) : '';
        if ($slug !== '') {
            $map['forum-circle'] = self::circleUrl(['slug' => $slug]);
        }

        return $map;
    }

    public static function enabled(): bool
    {
        return (Settings::values()['Forum_Switch'] ?? false) === true;
    }

    /**
     * Viewer context shared by the account panel and the forum blocks.
     *
     * @return array{enabled: bool, viewer: array<string, mixed>, permissions: array<string, bool>}
     */
    public static function viewerContext(): array
    {
        $viewer = self::currentUser();

        return [
            'enabled' => self::enabled(),
            'viewer' => $viewer,
            'permissions' => self::permissions($viewer),
        ];
    }

    /**
     * Normalize the latest forum topics into the same card shape as articles.
     * This keeps the homepage post-list block able to mix both sources without
     * teaching the React card renderer about a second payload.
     *
     * @return list<array<string, mixed>>
     */
    public static function feedSummaries(int $limit = 30, string $circleSlug = '', string $sort = ''): array
    {
        if (!self::enabled()) {
            return [];
        }

        $limit = max(1, min(50, $limit));
        $viewer = self::currentUser();
        $circleId = 0;
        $circle = null;

        if ($circleSlug !== '') {
            $circle = self::circleBySlug($circleSlug, (int) $viewer['uid']);
            if ($circle === null) {
                return [];
            }
            $circleId = (int) ($circle['id'] ?? 0);
        }

        $topics = self::topics([
            'circle' => $circleId,
            'viewer' => (int) $viewer['uid'],
            'page' => 1,
            'perPage' => $limit,
            'sort' => $sort,
        ]);
        $items = [];

        foreach ($topics['items'] as $topic) {
            if (!is_array($topic)) {
                continue;
            }

            $created = (int) ($topic['created'] ?? 0);
            $topicCircle = isset($topic['circle']) && is_array($topic['circle'])
                ? $topic['circle']
                : $circle;
            $categories = [[
                'label' => '圈子',
                'url' => self::homeUrl(),
            ]];

            if (is_array($topicCircle)) {
                $categories[] = [
                    'label' => (string) ($topicCircle['name'] ?? '圈子'),
                    'url' => (string) ($topicCircle['url'] ?? self::homeUrl()),
                ];
            }

            $tags = [];
            foreach ((array) ($topic['tags'] ?? []) as $tag) {
                if (!is_scalar($tag) || trim((string) $tag) === '') {
                    continue;
                }
                $tags[] = [
                    'label' => trim((string) $tag),
                    'url' => (string) ($topic['url'] ?? self::homeUrl()),
                ];
            }

            $excerpt = trim((string) ($topic['excerpt'] ?? ''));
            $items[] = [
                'title' => (string) ($topic['title'] ?? ''),
                'url' => (string) ($topic['url'] ?? ''),
                'excerpt' => $excerpt,
                'date' => $created > 0 ? (new \Typecho\Date($created))->format('Y-m-d') : '',
                'dateIso' => $created > 0 ? (new \Typecho\Date($created))->format('c') : '',
                'thumb' => (string) ($topic['thumbnail'] ?? ''),
                'author' => (string) (
                    $topic['author']['screenName']
                    ?? $topic['author']['name']
                    ?? ''
                ),
                'comments' => (int) ($topic['comments'] ?? 0),
                'readingTime' => max(1, (int) ceil(mb_strlen($excerpt, 'UTF-8') / 500)),
                'views' => (int) ($topic['views'] ?? 0),
                'categories' => $categories,
                'tags' => $tags,
                'source' => 'forum',
            ];
        }

        return $items;
    }

    /**
     * Create and migrate the forum tables. This is idempotent and only runs on
     * admin settings reads plus circle create/update requests.
     */
    public static function install(): bool
    {
        if (self::$installed) {
            return true;
        }

        try {
            $db = Db::get();
            $driver = strtolower($db->getAdapter()->getDriver());
            if ($driver === '') {
                $driver = strtolower($db->getAdapterName());
            }
            $driver = match ($driver) {
                'mysqli', 'pdo_mysql' => 'mysql',
                'sqlite3', 'pdo_sqlite' => 'sqlite',
                'postgres', 'postgresql', 'pdo_pgsql' => 'pgsql',
                default => $driver,
            };
            $prefix = $db->getPrefix();

            foreach (self::schema($driver, $prefix) as $sql) {
                $db->query($sql, Db::WRITE, '');
            }

            self::ensureTopicTagsColumn($db, $driver, $prefix);
            self::ensureCircleBackgroundColumn($db, $driver, $prefix);
            self::ensureTopicSoftDeleteColumns($db, $driver, $prefix);
            self::migrateLegacyTables($db, $driver, $prefix);
            self::$installed = true;

            return true;
        } catch (\Throwable $exception) {
            error_log('SunkenBoat forum schema installation failed: ' . $exception->getMessage());

            return false;
        }
    }

    /**
     * The theme options screen saves through the REST admin endpoint. The
     * action fires before auth, so only administrators may trigger DDL.
     */
    public static function restRequest(string $method, string $path, string $scope): void
    {
        unset($scope);

        $path = trim($path, '/');
        $method = strtoupper($method);
        self::$settingsWrite = false;

        if (!Typecho::isAdmin()) {
            return;
        }

        if (in_array($method, ['POST', 'PATCH'], true) && $path === 'admin/options') {
            self::$settingsWrite = true;
            return;
        }

        if (
            self::enabled()
            &&
            $method === 'GET'
            && in_array($path, ['admin/options', 'admin/schema', 'admin/config', 'admin/form-data'], true)
        ) {
            self::install();
        }
    }

    /**
     * @param mixed $payload
     * @return array<string, mixed>
     */
    public static function restResponse(mixed $payload, int $status, string $scope): array
    {
        unset($scope);

        if (self::$settingsWrite && $status < 400 && self::enabled()) {
            self::install();
        }

        self::$settingsWrite = false;

        return is_array($payload) ? $payload : [];
    }

    public static function handleInstall(array $data): array
    {
        unset($data);
        if (!self::enabled()) {
            Response::error('请先启用论坛&圈子', 404);
        }

        if (!self::install()) {
            Response::error('论坛数据表创建失败，请检查数据库权限', 500);
        }

        return ['installed' => true, 'tables' => array_keys(self::tableNames())];
    }

    /**
     * Content owned by (or joined by) the signed-in user. Used by the account
     * panel content manager, which needs both the lists and the counters.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleUserContent(array $data): array
    {
        $viewer = self::requireViewer();
        $limit = max(1, min(50, self::intValue($data['limit'] ?? 40)));

        return self::userContent((int) $viewer['uid'], $limit);
    }

    /**
     * Admin moderation and batch controls for forum topics.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleModeration(array $data): array
    {
        $viewer = self::requireViewer();
        if (!self::permissions($viewer)['moderate']) {
            Response::error('你没有管理论坛帖子的权限', 403);
        }

        // "action" is reserved by the AJAX router for the endpoint name; use
        // "op" for the sub-operation so the payload key does not collide.
        $action = trim((string) ($data['op'] ?? 'list'));
        if ($action === 'list') {
            return [
                'items' => self::moderationTopics(),
                'status' => 'all',
            ];
        }

        $ids = [];
        foreach ((array) ($data['ids'] ?? []) as $id) {
            $id = self::intValue($id);
            if ($id > 0) {
                $ids[$id] = $id;
            }
            if (count($ids) >= 100) {
                break;
            }
        }
        if ($ids === []) {
            Response::error('请选择要处理的帖子', 422, ['ids' => '至少选择一条帖子']);
        }

        $db = Db::get();
        $updated = 0;
        $purged = 0;
        $status = null;
        $fields = [];

        switch ($action) {
            case 'approve':
                $status = 'publish';
                break;
            case 'reject':
                $status = 'rejected';
                break;
            case 'pin':
                $fields = ['pinned' => 1];
                break;
            case 'unpin':
                $fields = ['pinned' => 0];
                break;
            case 'feature':
                $fields = ['featured' => 1];
                break;
            case 'unfeature':
                $fields = ['featured' => 0];
                break;
            case 'views':
                $fields = ['views' => max(0, min(1000000000, self::intValue($data['views'] ?? 0)))];
                break;
            case 'kind':
                $kind = trim((string) ($data['kind'] ?? ''));
                $kinds = self::topicKinds(Settings::values());
                if (!isset($kinds[$kind])) {
                    Response::error('帖子类型无效', 422, ['kind' => '请选择有效的帖子类型']);
                }
                $fields = ['kind' => $kind];
                break;
            case 'delete':
            case 'restore':
            case 'purge':
                break;
            default:
                Response::error('未知的批量操作', 422);
        }

        if ($status !== null) {
            $fields = ['status' => $status];
        }
        $fields['updated'] = time();

        foreach ($ids as $id) {
            if (in_array($action, ['delete', 'restore', 'purge'], true)) {
                try {
                    $row = $db->fetchRow(
                        $db->select('circle_id', 'status', 'deleted_from')
                            ->from('table.sunken_forum_topics')
                            ->where('id = ?', $id)
                            ->limit(1)
                    );
                } catch (\Throwable) {
                    $row = null;
                }

                if (!is_array($row)) {
                    continue;
                }

                if ($action === 'purge') {
                    $db->query($db->delete('table.sunken_forum_replies')->where('topic_id = ?', $id));
                    $db->query($db->delete('table.sunken_forum_reactions')->where('topic_id = ?', $id));
                    $db->query($db->delete('table.sunken_forum_ratings')->where('topic_id = ?', $id));
                    $purged += (int) $db->query(
                        $db->delete('table.sunken_forum_topics')->where('id = ?', $id)
                    );
                    $circleId = (int) ($row['circle_id'] ?? 0);
                    if ($circleId > 0) {
                        self::recountCircle($circleId);
                    }
                    continue;
                }

                if ($action === 'restore') {
                    $previous = (string) ($row['deleted_from'] ?? '');
                    $restoreStatus = in_array($previous, ['publish', 'waiting', 'rejected'], true)
                        ? $previous
                        : 'publish';
                    $updated += (int) $db->query(
                        $db->update('table.sunken_forum_topics')
                            ->rows([
                                'status' => $restoreStatus,
                                'deleted_at' => 0,
                                'deleted_from' => '',
                                'updated' => time(),
                            ])
                            ->where('id = ?', $id)
                    );
                    self::recountCircleByTopic($id);
                    continue;
                }

                $current = (string) ($row['status'] ?? 'publish');
                if ($current === 'deleted') {
                    continue;
                }
                $updated += (int) $db->query(
                    $db->update('table.sunken_forum_topics')
                        ->rows([
                            'status' => 'deleted',
                            'deleted_at' => time(),
                            'deleted_from' => $current,
                            'updated' => time(),
                        ])
                        ->where('id = ?', $id)
                );
                self::recountCircleByTopic($id);
                continue;
            }

            $updated += (int) $db->query(
                $db->update('table.sunken_forum_topics')
                    ->rows($fields)
                    ->where('id = ?', $id)
            );
            self::recountCircleByTopic($id);
        }

        return [
            'updated' => $updated,
            'purged' => $purged,
            'items' => self::moderationTopics(),
            'message' => match ($action) {
                'approve' => '已通过所选帖子',
                'reject' => '已驳回所选帖子',
                'delete' => '已移入回收站',
                'restore' => '已恢复所选帖子',
                'purge' => '已彻底删除所选帖子',
                'pin' => '已置顶所选帖子',
                'unpin' => '已取消置顶',
                'feature' => '已设为精华',
                'unfeature' => '已取消精华',
                'views' => '已更新阅读量',
                'kind' => '已更新帖子类型',
                default => '已更新',
            },
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function moderationTopics(): array
    {
        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('*')
                    ->from('table.sunken_forum_topics')
                    ->order('created', Db::SORT_DESC)
                    ->limit(100)
            );
        } catch (\Throwable) {
            return [];
        }

        $topicIds = array_map(
            static fn (array $row): int => (int) ($row['id'] ?? 0),
            array_values(array_filter($rows, 'is_array'))
        );
        $reactions = self::viewerReactions(0, $topicIds);
        $ratings = self::ratingsForTopics($topicIds, 0);
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::formatTopic($row, $reactions, $ratings);
            }
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    public static function userContent(int $uid, int $limit = 40): array
    {
        $limit = max(1, min(50, $limit));
        $empty = [
            'topics' => [],
            'circles' => ['joined' => [], 'created' => []],
            'stats' => [
                'topics' => 0,
                'replies' => 0,
                'joinedCircles' => 0,
                'createdCircles' => 0,
            ],
        ];

        if ($uid <= 0 || !self::enabled()) {
            return $empty;
        }

        $topics = self::topics([
            'author' => $uid,
            'viewer' => $uid,
            'ownPending' => true,
            'page' => 1,
            'perPage' => $limit,
        ]);
        $circles = self::userCircles($uid, 30);
        $circleCounts = self::userCircleCounts($uid);

        return [
            'topics' => $topics['items'],
            'circles' => $circles,
            'stats' => [
                'topics' => self::countRows(
                    'table.sunken_forum_topics',
                    'author_id = ? AND status = ?',
                    [$uid, 'publish']
                ),
                'replies' => self::countRows(
                    'table.sunken_forum_replies',
                    'author_id = ? AND status = ?',
                    [$uid, 'approved']
                ),
                'joinedCircles' => (int) ($circleCounts['joined'] ?? 0),
                'createdCircles' => (int) ($circleCounts['created'] ?? 0),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function homePage(): array
    {
        if (!self::enabled()) {
            return self::notFoundPage('论坛尚未开启', '管理员开启论坛&圈子后，这里会显示圈子广场。');
        }

        $values = Settings::values();
        $displayName = self::displayName($values);
        $title = trim((string) ($values['Forum_Title'] ?? '')) ?: $displayName;
        $description = trim((string) ($values['Forum_Description'] ?? ''));
        $viewer = self::currentUser();
        $page = self::pageNumber();
        $perPage = self::perPage($values);
        $circles = self::circles(0, (int) $viewer['uid']);
        $topics = self::topics([
            'viewer' => (int) $viewer['uid'],
            'page' => $page,
            'perPage' => $perPage,
        ]);
        $stats = self::stats();

        $context = [
            'forum' => self::config($values, $viewer, $description),
            'circles' => $circles,
            'topics' => $topics['items'],
            'pager' => $topics['pager'],
            'hotCircles' => array_slice($circles, 0, 8),
            'hotTopics' => self::hotTopics(8, (int) $viewer['uid']),
            'stats' => $stats,
            'authors' => self::topAuthors(5),
            'circle' => null,
        ];
        $layout = self::layout($values, 'home', $context);

        return PageData::forumPage(
            'forum-home',
            $title,
            $layout['main'],
            $title,
            self::homeUrl(),
            $description !== '' ? $description : $displayName,
            $layout['left'],
            $layout['right']
        );
    }

    /**
     * @return array<string, mixed>
     */
    public static function circlePage(string $slug): array
    {
        if (!self::enabled()) {
            return self::notFoundPage('论坛尚未开启', '管理员开启论坛&圈子后，这里会显示圈子内容。');
        }

        $values = Settings::values();
        $viewer = self::currentUser();
        $circle = self::circleBySlug($slug, (int) $viewer['uid']);
        if ($circle === null) {
            return self::notFoundPage('圈子不存在', '这个圈子可能已经被删除，或者地址发生了变化。');
        }

        $forumConfig = self::config($values, $viewer, $circle['description']);
        if (!self::canAccessCircle($circle, $viewer, 'view')) {
            return self::joinGatePage($forumConfig, $circle, 'view');
        }

        $topics = self::topics([
            'circle' => (int) $circle['id'],
            'viewer' => (int) $viewer['uid'],
            'page' => self::pageNumber(),
            'perPage' => self::perPage($values),
        ]);
        $circles = self::circles(8, (int) $viewer['uid']);

        $context = [
            'forum' => $forumConfig,
            'circles' => $circles,
            'topics' => $topics['items'],
            'pager' => $topics['pager'],
            'hotCircles' => $circles,
            'hotTopics' => self::hotTopics(8, (int) $viewer['uid']),
            'stats' => self::stats(),
            'authors' => self::topAuthors(5),
            'circle' => $circle,
        ];
        $layout = self::layout($values, 'circle', $context);

        return PageData::forumPage(
            'forum-circle',
            $circle['name'],
            $layout['main'],
            $circle['name'],
            $circle['url'],
            $circle['description'] !== '' ? $circle['description'] : $circle['name'],
            $layout['left'],
            $layout['right']
        );
    }

    /**
     * @return array<string, mixed>
     */
    public static function topicPage(string $value): array
    {
        if (!self::enabled()) {
            return self::notFoundPage('论坛尚未开启', '管理员开启论坛&圈子后，这里会显示帖子内容。');
        }

        $values = Settings::values();
        $viewer = self::currentUser();
        $topic = self::topicByValue($value, (int) $viewer['uid']);
        if ($topic === null) {
            return self::notFoundPage('帖子不存在', '这个帖子可能已经被删除，或者链接已经失效。');
        }

        $topicCircleId = (int) ($topic['circle']['id'] ?? 0);
        $topicCircle = $topicCircleId > 0 ? self::circleById($topicCircleId, (int) $viewer['uid']) : null;
        $forumConfig = self::config($values, $viewer, (string) ($topic['excerpt'] ?? ''));
        if ($topicCircle !== null && !self::canAccessCircle($topicCircle, $viewer, 'view')) {
            return self::joinGatePage($forumConfig, $topicCircle, 'view');
        }

        if (($topic['restricted'] ?? false) === true) {
            $restricted = [
                'type' => 'forum-topic',
                'variant' => 'default',
                'width' => 'content',
                'forum' => $forumConfig,
                'topic' => $topic,
                'circle' => $topicCircle,
                'breadcrumbs' => self::topicBreadcrumbs($topic),
                'contentHtml' => '',
                'replies' => [],
                'replyCount' => 0,
                'showAuthor' => false,
                'showAuthorTopics' => false,
                'authorTopics' => [],
                'hotCircles' => [],
                'hotTopics' => [],
                'restricted' => true,
                'restrictedText' => '这篇帖子已被作者或管理员移入回收站，仅保留标题与发布时间，正文内容暂不可查看。',
            ];

            return PageData::forumPage(
                'forum-topic',
                $topic['title'],
                [$restricted],
                $topic['title'],
                $topic['url'],
                '帖子已移入回收站'
            );
        }

        self::recordTopicView((int) $topic['id']);
        $topic = self::topicByValue($value, (int) $viewer['uid']) ?? $topic;
        $replies = self::replies((int) $topic['id'], (int) $viewer['uid']);
        $circles = self::circles(8, (int) $viewer['uid']);
        $showAuthor = ($values['Forum_Topic_Author'] ?? true) === true;
        $showAuthorTopics = $showAuthor
            && ($values['Forum_Topic_Author_Posts'] ?? true) === true;
        $authorLimit = max(1, min(8, (int) ($values['Forum_Topic_Author_Limit'] ?? 5)));
        $authorTopics = [];
        $authorUid = (int) ($topic['author']['uid'] ?? 0);
        if ($showAuthorTopics && $authorUid > 0) {
            $authorFeed = self::topics([
                'author' => $authorUid,
                'viewer' => (int) $viewer['uid'],
                'page' => 1,
                'perPage' => $authorLimit + 1,
            ]);
            $authorTopics = array_values(array_filter(
                $authorFeed['items'],
                static fn (array $item): bool => (int) ($item['id'] ?? 0) !== (int) $topic['id']
            ));
            $authorTopics = array_slice($authorTopics, 0, $authorLimit);
        }

        $block = [
            'type' => 'forum-topic',
            'variant' => 'default',
            'width' => 'content',
            'forum' => $forumConfig,
            'topic' => $topic,
            'circle' => $topicCircle,
            'breadcrumbs' => self::topicBreadcrumbs($topic),
            'contentHtml' => self::markdown((string) $topic['rawContent']),
            'replies' => $replies,
            'replyCount' => (int) ($topic['comments'] ?? 0),
            'showAuthor' => $showAuthor,
            'showAuthorTopics' => $showAuthorTopics,
            'authorTopics' => $authorTopics,
            'hotCircles' => $circles,
            'hotTopics' => self::hotTopics(8, (int) $viewer['uid']),
        ];

        unset($block['topic']['rawContent']);

        return PageData::forumPage(
            'forum-topic',
            $topic['title'],
            [$block],
            $topic['title'],
            $topic['url'],
            $topic['excerpt'] !== '' ? $topic['excerpt'] : $topic['title']
        );
    }

    /**
     * @param array<string, mixed> $forum
     * @param array<string, mixed> $circle
     * @return array<string, mixed>
     */
    private static function joinGatePage(array $forum, array $circle, string $mode): array
    {
        $label = (string) ($forum['followLabel'] ?? '关注');
        $modeLabel = $mode === 'post' ? '发布帖子' : '查看内容';

        return PageData::forumPage(
            'forum-circle',
            (string) ($circle['name'] ?? '圈子'),
            [[
                'type' => 'forum-join-gate',
                'variant' => $mode,
                'width' => 'content',
                'forum' => $forum,
                'circle' => $circle,
                'title' => $label . '「' . (string) ($circle['name'] ?? '圈子') . '」后' . $modeLabel,
                'text' => '当前板块仅对已' . $label . '的用户开放，完成' . $label . '后即可继续。',
            ]],
            (string) ($circle['name'] ?? '圈子'),
            (string) ($circle['url'] ?? self::homeUrl()),
            '当前板块需要先' . $label . '。'
        );
    }

    /**
     * Build the three configurable slots used by the forum home and circle
     * pages. Each slot keeps its own ordered Blocks field so the layout can be
     * rearranged without touching the React components.
     *
     * @param array<string, mixed> $values
     * @param array<string, mixed> $context
     * @return array{main: list<array<string, mixed>>, left: list<array<string, mixed>>, right: list<array<string, mixed>>}
     */
    private static function layout(array $values, string $page, array $context): array
    {
        $settings = $page === 'circle'
            ? [
                'main' => ['Forum_Circle_Blocks', ['forum-circle-hero', 'forum-topic-list']],
                'left' => ['Forum_Circle_Left_Blocks', ['forum-circle-info', 'forum-notice', 'forum-stats']],
                'right' => ['Forum_Circle_Right_Blocks', ['forum-hot-circles', 'forum-hot-topics']],
            ]
            : [
                'main' => ['Forum_Home_Blocks', ['forum-home-header', 'forum-circle-grid', 'forum-topic-list']],
                'left' => ['Forum_Home_Left_Blocks', ['forum-create', 'forum-circle-list', 'forum-notice', 'forum-authors']],
                'right' => ['Forum_Home_Right_Blocks', ['forum-stats', 'forum-hot-circles', 'forum-hot-topics']],
            ];

        return [
            'main' => self::layoutBlocks($values[$settings['main'][0]] ?? null, $settings['main'][1], $context),
            'left' => self::layoutBlocks($values[$settings['left'][0]] ?? null, $settings['left'][1], $context),
            'right' => self::layoutBlocks($values[$settings['right'][0]] ?? null, $settings['right'][1], $context),
        ];
    }

    /**
     * @param list<string> $defaults
     * @param array<string, mixed> $context
     * @return list<array<string, mixed>>
     */
    private static function layoutBlocks(mixed $saved, array $defaults, array $context): array
    {
        $specs = self::blockSpecs($saved, $defaults);
        $blocks = [];

        foreach ($specs as $spec) {
            $block = self::layoutBlock($spec['name'], $spec['variant'], $spec['data'], $context);
            if ($block !== null) {
                $blocks[] = array_merge($block, self::layoutMeta($spec['data']), [
                    'settingsIndex' => (int) $spec['index'],
                ]);
            }
        }

        return $blocks;
    }

    /**
     * @param list<string> $defaults
     * @return list<array{name: string, variant: string, data: array<string, mixed>, index: int}>
     */
    private static function blockSpecs(mixed $saved, array $defaults): array
    {
        $specs = [];
        $configured = is_array($saved);
        $items = $configured ? $saved : [];

        foreach ($items as $index => $item) {
            if (is_string($item)) {
                $name = trim($item);
                $variant = '';
                $data = [];
            } elseif (is_array($item)) {
                $name = trim((string) ($item['name'] ?? ($item['block'] ?? '')));
                $variant = trim((string) ($item['variant'] ?? ''));
                $data = isset($item['data']) && is_array($item['data']) ? $item['data'] : [];
            } else {
                continue;
            }

            if (preg_match('/^[a-z0-9][a-z0-9-]*$/', $name) !== 1) {
                continue;
            }
            if ($variant !== '' && preg_match('/^[a-z0-9][a-z0-9-]*$/', $variant) !== 1) {
                continue;
            }

            $specs[] = [
                'name' => $name,
                'variant' => $variant,
                'data' => $data,
                'index' => (int) $index,
            ];
        }

        if ($configured) {
            return $specs;
        }

        foreach ($defaults as $index => $name) {
            if (preg_match('/^[a-z0-9][a-z0-9-]*$/', $name) === 1) {
                $specs[] = [
                    'name' => $name,
                    'variant' => '',
                    'data' => [],
                    'index' => (int) $index,
                ];
            }
        }

        return $specs;
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed> $context
     * @return array<string, mixed>|null
     */
    private static function layoutBlock(string $name, string $variant, array $data, array $context): ?array
    {
        $forum = isset($context['forum']) && is_array($context['forum']) ? $context['forum'] : [];
        $stats = isset($context['stats']) && is_array($context['stats']) ? $context['stats'] : [];
        $circle = isset($context['circle']) && is_array($context['circle']) ? $context['circle'] : null;
        $circles = isset($context['circles']) && is_array($context['circles']) ? $context['circles'] : [];
        $topics = isset($context['topics']) && is_array($context['topics']) ? $context['topics'] : [];
        $pager = isset($context['pager']) && is_array($context['pager']) ? $context['pager'] : [];
        $authors = isset($context['authors']) && is_array($context['authors']) ? $context['authors'] : [];
        $hotCircles = isset($context['hotCircles']) && is_array($context['hotCircles']) ? $context['hotCircles'] : [];
        $hotTopics = isset($context['hotTopics']) && is_array($context['hotTopics']) ? $context['hotTopics'] : [];
        $create = isset($forum['copy']['create']) && is_array($forum['copy']['create'])
            ? $forum['copy']['create']
            : [];
        $moduleSort = trim((string) ($data['sort'] ?? 'inherit'));
        if (
            $name === 'forum-topic-list'
            && in_array($moduleSort, ['latest', 'recommended', 'random'], true)
        ) {
            $moduleLimit = self::limit($data['limit'] ?? null, 0, 0, 30);
            $modulePerPage = $moduleLimit > 0
                ? $moduleLimit
                : max(1, (int) ($pager['perPage'] ?? 12));
            $modulePage = $moduleSort === 'random' ? 1 : max(1, (int) ($pager['page'] ?? 1));
            $moduleTopics = self::topics([
                'circle' => (int) ($circle['id'] ?? 0),
                'viewer' => (int) ($forum['viewer']['uid'] ?? 0),
                'page' => $modulePage,
                'perPage' => $modulePerPage,
                'sort' => $moduleSort,
            ]);
            $topics = $moduleTopics['items'];
            $pager = $moduleTopics['pager'];
        }

        $block = match ($name) {
            'forum-home-header' => [
                'type' => 'forum-home-header',
                'title' => self::plainText($data['title'] ?? '', 60),
                'showStats' => self::flag($data, 'show_stats', true),
                'showCreate' => self::flag($data, 'show_create', true),
                'forum' => $forum,
                'stats' => $stats,
            ],
            'forum-circle-grid' => [
                'type' => 'forum-circle-grid',
                'title' => self::plainText($data['title'] ?? '', 60),
                'limit' => self::limit($data['limit'] ?? null, 6, 1, 12),
                'circles' => $circles,
            ],
            'forum-topic-list' => [
                'type' => 'forum-topic-list',
                'title' => self::plainText(
                    $data['title'] ?? '',
                    60
                ) ?: ($circle === null ? '最新帖子' : '全部帖子'),
                'emptyTitle' => self::plainText($data['empty_title'] ?? '', 80),
                'emptyText' => self::plainText($data['empty_text'] ?? '', 160),
                'showFilters' => self::flag($data, 'show_filters', true),
                'showSearch' => self::flag($data, 'show_search', true),
                'limit' => self::limit($data['limit'] ?? null, 0, 0, 30),
                'forum' => $forum,
                'circle' => $circle,
                'circles' => $circles,
                'topics' => $topics,
                'pager' => $pager,
                'stats' => $stats,
            ],
            'forum-create' => [
                'type' => 'forum-create',
                'title' => self::plainText($data['title'] ?? '', 60)
                    ?: (string) ($create['title'] ?? ''),
                'text' => self::longText($data['text'] ?? '', 160)
                    ?: (string) ($create['text'] ?? ''),
                'forum' => $forum,
            ],
            'forum-circle-list' => [
                'type' => 'forum-circle-list',
                'title' => self::plainText($data['title'] ?? '', 60),
                'limit' => self::limit($data['limit'] ?? null, 8, 1, 12),
                'circles' => $circles,
            ],
            'forum-notice' => [
                'type' => 'forum-notice',
                'title' => self::plainText($data['title'] ?? '', 60),
                'forum' => $forum,
            ],
            'forum-authors' => [
                'type' => 'forum-authors',
                'title' => self::plainText($data['title'] ?? '', 60),
                'limit' => self::limit($data['limit'] ?? null, 5, 1, 10),
                'authors' => $authors,
            ],
            'forum-circle-info' => $circle === null
                ? null
                : [
                    'type' => 'forum-circle-info',
                    'title' => self::plainText($data['title'] ?? '', 60),
                    'forum' => $forum,
                    'circle' => $circle,
                ],
            'forum-circle-hero' => $circle === null
                ? null
                : [
                    'type' => 'forum-circle-hero',
                    'forum' => $forum,
                    'circle' => $circle,
                    'pager' => $pager,
                ],
            'forum-stats' => [
                'type' => 'forum-stats',
                'title' => self::plainText($data['title'] ?? '', 60),
                'showCircle' => self::flag($data, 'show_circle', true),
                'stats' => $stats,
                'circle' => $circle,
            ],
            'forum-hot-circles' => [
                'type' => 'forum-hot-circles',
                'title' => self::plainText($data['title'] ?? '', 60),
                'limit' => self::limit($data['limit'] ?? null, 6, 1, 10),
                'circles' => $hotCircles,
            ],
            'forum-hot-topics' => [
                'type' => 'forum-hot-topics',
                'title' => self::plainText($data['title'] ?? '', 60),
                'limit' => self::limit($data['limit'] ?? null, 6, 1, 10),
                'topics' => $hotTopics,
            ],
            default => null,
        };

        if ($block === null) {
            return null;
        }

        $block['variant'] = $variant !== '' ? $variant : 'default';

        return $block;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, string>
     */
    private static function layoutMeta(array $data): array
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
            'width' => 'content',
            'spaceTop' => $space($data['space_top'] ?? 'default'),
            'spaceBottom' => $space($data['space_bottom'] ?? 'default'),
            'minHeight' => $height,
        ];
    }

    /**
     * @param array<string, mixed> $data
     */
    private static function flag(array $data, string $key, bool $default): bool
    {
        if (!array_key_exists($key, $data)) {
            return $default;
        }

        $value = $data[$key];
        if (is_bool($value)) {
            return $value;
        }

        return !in_array((string) $value, ['0', 'false', 'off', ''], true);
    }

    private static function limit(mixed $value, int $default, int $min, int $max): int
    {
        $limit = is_numeric($value) ? (int) $value : $default;

        return max($min, min($max, $limit));
    }

    /**
     * @param array<string, mixed> $topic
     * @return list<array{label: string, url?: string}>
     */
    private static function topicBreadcrumbs(array $topic): array
    {
        $values = Settings::values();
        $items = [
            ['label' => '首页', 'url' => Typecho::siteUrl()],
            ['label' => self::displayName($values), 'url' => self::homeUrl()],
        ];

        $circle = isset($topic['circle']) && is_array($topic['circle']) ? $topic['circle'] : null;
        if ($circle !== null) {
            $items[] = [
                'label' => (string) ($circle['name'] ?? '圈子'),
                'url' => (string) ($circle['url'] ?? ''),
            ];
        }

        $items[] = ['label' => (string) ($topic['title'] ?? '帖子')];

        return $items;
    }

    /**
     * Dedicated forum-topic editor. It intentionally does not require the
     * Typecho "editor" group used by the article editor: the forum's own
     * publish permission decides who can enter, while the media library stays
     * available only to groups accepted by REST v2.
     *
     * @return array<string, mixed>
     */
    public static function editorPage(string $circleValue = '', int $topicId = 0): array
    {
        if (!self::enabled()) {
            return self::notFoundPage('论坛尚未开启', '管理员开启论坛&圈子后，才能进入发帖编辑器。');
        }

        $values = Settings::values();
        $viewer = self::currentUser();
        $viewerUid = (int) ($viewer['uid'] ?? 0);
        $permissions = self::permissions($viewer);
        $topicRow = $topicId > 0 ? self::topicRowById($topicId, $viewerUid) : null;
        $editing = $topicRow !== null;

        if ($topicId > 0 && $topicRow === null) {
            return self::notFoundPage('帖子不存在', '帖子可能已被删除，或你没有查看该帖子的权限。');
        }

        if ($editing && !self::canManageTopic($viewer, $topicRow)) {
            return self::notFoundPage('无法编辑帖子', '只有帖子作者或管理员可以编辑这篇帖子。');
        }
        if ($editing && (string) ($topicRow['status'] ?? '') === 'deleted') {
            return self::notFoundPage(
                '帖子在回收站',
                '这篇帖子已移入回收站，管理员恢复后才能继续编辑。'
            );
        }

        $circles = self::circles(0, $viewerUid);
        if ($editing && $circleValue === '') {
            $circleValue = (string) ($topicRow['circle_id'] ?? '');
        }

        $selected = null;
        $circleValue = trim($circleValue);
        foreach ($circles as $circle) {
            if (
                ($circleValue !== '' && (string) $circle['id'] === $circleValue)
                || ($circleValue !== '' && (string) $circle['slug'] === $circleValue)
            ) {
                $selected = $circle;
                break;
            }
        }
        if ($selected === null && $circles !== []) {
            $selected = $circles[0];
        }

        $gate = null;
        if (($viewer['loggedIn'] ?? false) !== true) {
            $gate = [
                'type' => 'login',
                'title' => '请先登录',
                'text' => '登录后即可进入圈子发帖编辑器。',
            ];
        } elseif ($circles === []) {
            $gate = [
                'type' => 'no-circle',
                'title' => '还没有可发帖的圈子',
                'text' => $permissions['createCircle']
                    ? '先创建一个圈子，再回来发布第一个帖子。'
                    : '管理员创建圈子后，这里会出现可选的板块。',
            ];
        } elseif (!$editing && !$permissions['createTopic']) {
            $gate = [
                'type' => 'denied',
                'title' => '当前账号没有发帖权限',
                'text' => '你仍然可以浏览圈子与帖子，但不能发布新主题。',
            ];
        } elseif (
            !$editing
            && $selected !== null
            && !self::canAccessCircle($selected, $viewer, 'post')
        ) {
            $label = self::followLabel($values);
            $gate = [
                'type' => 'denied',
                'title' => '请先' . $label . '圈子',
                'text' => '这个圈子要求先' . $label . '后才能发布帖子，完成' . $label . '后再回来。',
            ];
        }

        $mediaEnabled = ThemeConfig::restV2Enabled() && in_array(
            (string) ($viewer['group'] ?? ''),
            ['editor', 'administrator'],
            true
        );

        $kindMap = self::topicKinds($values);
        $defaultKind = (string) (array_key_first($kindMap) ?? '讨论');
        $topicDraft = null;
        if ($editing) {
            $rawKind = trim((string) ($topicRow['kind'] ?? ''));
            $kind = self::LEGACY_TOPIC_KIND_LABELS[$rawKind] ?? $rawKind;
            if (!isset($kindMap[$kind])) {
                $kind = $defaultKind;
            }
            $topicDraft = [
                'id' => (int) ($topicRow['id'] ?? 0),
                'title' => (string) ($topicRow['title'] ?? ''),
                'slug' => (string) ($topicRow['slug'] ?? ''),
                'content' => (string) ($topicRow['content'] ?? ''),
                'kind' => $kind,
                'tags' => self::topicTags($topicRow['tags'] ?? ''),
                'circleId' => (int) ($topicRow['circle_id'] ?? 0),
                'status' => (string) ($topicRow['status'] ?? 'publish'),
                'pinned' => (int) ($topicRow['pinned'] ?? 0) === 1,
                'featured' => (int) ($topicRow['featured'] ?? 0) === 1,
                'url' => self::topicUrl($topicRow),
            ];
        }

        $editor = [
            'mode' => 'forum-topic',
            'isEdit' => $editing,
            'topic' => $topicDraft,
            'gate' => $gate,
            'circle' => $selected === null ? null : self::editorCircle($selected),
            'circles' => array_map([self::class, 'editorCircle'], $circles),
            'topicKinds' => self::topicKindOptions($values),
            'tagSuggestions' => self::popularTags(),
            'showTagInput' => ($values['Forum_Tag_Input'] ?? true) === true,
            'requiresReview' => !$editing
                && ($values['Forum_Topic_Review'] ?? false) === true
                && !in_array((string) ($viewer['group'] ?? ''), ['administrator', 'editor'], true),
            'displayName' => self::displayName($values),
            'maxLength' => 20000,
            'maxTitleLength' => 100,
            'maxSlugLength' => 64,
            'nonce' => Typecho::securityToken(),
            'homeUrl' => self::homeUrl(),
            'contentUrl' => self::indexBase() . '/user/content',
            'canCreateCircle' => $permissions['createCircle'],
            'viewer' => $viewer,
            'permissions' => $permissions,
            'canModerate' => $permissions['moderate'],
            'statusOptions' => [
                ['value' => 'publish', 'label' => '已发布'],
                ['value' => 'waiting', 'label' => '待审核'],
                ['value' => 'rejected', 'label' => '已驳回'],
            ],
            'canUseMedia' => $mediaEnabled,
            'mediaEndpoint' => self::mediaEndpoint(),
            'endpoints' => [
                'topicCreate' => Endpoint::url('forum-topic-create'),
                'topicUpdate' => Endpoint::url('forum-topic-update'),
                'topicDelete' => Endpoint::url('forum-topic-delete'),
            ],
        ];

        $title = $gate === null
            ? ($editing ? '编辑帖子' : '发布帖子')
            : (string) $gate['title'];

        return PageData::editorPage($title, $editor);
    }

    /**
     * @param array<string, mixed> $circle
     * @return array<string, mixed>
     */
    private static function editorCircle(array $circle): array
    {
        return [
            'id' => (int) ($circle['id'] ?? 0),
            'name' => (string) ($circle['name'] ?? ''),
            'slug' => (string) ($circle['slug'] ?? ''),
            'url' => (string) ($circle['url'] ?? ''),
            'icon' => (string) ($circle['icon'] ?? ''),
            'background' => (string) ($circle['background'] ?? ''),
            'description' => (string) ($circle['description'] ?? ''),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function notFoundPage(string $title, string $text): array
    {
        return PageData::forumPage(
            '404',
            $title,
            [[
                'type' => 'notfound',
                'image' => Assets::url('img/404.svg'),
                'title' => $title,
                'text' => $text,
                'action' => [
                    'label' => '返回圈子广场',
                    'url' => self::homeUrl(),
                ],
                'searchAction' => Typecho::siteUrl(),
                'searchPlaceholder' => '搜索站内文章',
            ]],
            $title,
            self::homeUrl(),
            $text
        );
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleCircleCreate(array $data): array
    {
        $viewer = self::requireViewer();
        self::install();
        $permissions = self::permissions($viewer);
        if (!$permissions['createCircle']) {
            Response::error('你没有创建圈子的权限', 403);
        }

        $name = self::plainText($data['name'] ?? '', 40);
        if (self::length($name) < 2) {
            Response::error('圈子名称至少需要 2 个字符', 422, ['name' => '请输入圈子名称']);
        }

        $description = self::plainText($data['description'] ?? '', 200);
        $icon = self::safeImageUrl($data['icon'] ?? '');
        $background = self::safeImageUrl($data['background'] ?? '');
        $slug = self::uniqueSlug((string) ($data['slug'] ?? ''), $name, 'circles');
        $now = time();
        $db = Db::get();
        $id = (int) $db->query($db->insert('table.sunken_forum_circles')->rows([
            'name' => $name,
            'slug' => $slug,
            'description' => $description,
            'icon' => $icon,
            'background' => $background,
            'owner_id' => (int) $viewer['uid'],
            'status' => 'publish',
            'sort' => 0,
            'topic_count' => 0,
            'member_count' => 1,
            'created' => $now,
            'updated' => $now,
        ]));

        if ($id <= 0) {
            Response::error('创建圈子失败', 500);
        }

        self::joinCircleRow($id, (int) $viewer['uid']);
        self::recountCircle($id);

        return [
            'id' => $id,
            'slug' => $slug,
            'url' => self::circleUrl(['slug' => $slug]),
            'message' => '圈子创建成功',
        ];
    }

    /**
     * Circle owners and forum administrators can update the presentation data
     * used by the forum sidebar and circle banner.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleCircleUpdate(array $data): array
    {
        $viewer = self::requireViewer();
        self::install();
        $id = self::intValue($data['id'] ?? 0);
        if ($id <= 0) {
            Response::error('圈子不存在', 404);
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('*')
                    ->from('table.sunken_forum_circles')
                    ->where('id = ?', $id)
                    ->limit(1)
            );
        } catch (\Throwable) {
            $row = null;
        }

        if (!is_array($row)) {
            Response::error('圈子不存在', 404);
        }

        $uid = (int) ($viewer['uid'] ?? 0);
        $isOwner = $uid > 0 && (int) ($row['owner_id'] ?? 0) === $uid;
        if (!$isOwner && !self::permissions($viewer)['moderate']) {
            Response::error('你没有管理这个圈子的权限', 403);
        }

        $name = self::plainText($data['name'] ?? '', 40);
        if (self::length($name) < 2) {
            Response::error('圈子名称至少需要 2 个字符', 422, ['name' => '请输入圈子名称']);
        }

        $currentSlug = (string) ($row['slug'] ?? '');
        $requestedSlug = trim((string) ($data['slug'] ?? ''));
        $slug = $requestedSlug !== '' && $requestedSlug !== $currentSlug
            ? self::uniqueSlug($requestedSlug, $name, 'circles', $id)
            : $currentSlug;
        if ($slug === '') {
            $slug = self::uniqueSlug('', $name, 'circles', $id);
        }

        try {
            Db::get()->query(
                Db::get()->update('table.sunken_forum_circles')
                    ->rows([
                        'name' => $name,
                        'slug' => $slug,
                        'description' => self::plainText($data['description'] ?? '', 200),
                        'icon' => self::safeImageUrl($data['icon'] ?? ''),
                        'background' => self::safeImageUrl($data['background'] ?? ''),
                        'updated' => time(),
                    ])
                    ->where('id = ?', $id)
            );
        } catch (\Throwable $exception) {
            error_log('SunkenBoat forum circle update failed: ' . $exception->getMessage());
            Response::error('保存圈子失败，请稍后再试', 500);
        }

        unset(self::$circleCache[$id]);

        return [
            'id' => $id,
            'slug' => $slug,
            'url' => self::circleUrl(['slug' => $slug]),
            'message' => '圈子已更新',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleTopicCreate(array $data): array
    {
        $viewer = self::requireViewer();
        $permissions = self::permissions($viewer);
        if (!$permissions['createTopic']) {
            Response::error('你没有发布帖子的权限', 403);
        }

        $circleId = self::intValue($data['circle_id'] ?? 0);
        $circle = self::circleById($circleId, (int) $viewer['uid']);
        if ($circle === null) {
            Response::error('圈子不存在', 404, ['circle_id' => '请选择有效的圈子']);
        }
        if (!self::canAccessCircle($circle, $viewer, 'post')) {
            $label = self::followLabel(Settings::values());
            Response::error('请先' . $label . '圈子后再发帖', 403);
        }

        $title = self::plainText($data['title'] ?? '', 100);
        if (self::length($title) < 2) {
            Response::error('标题至少需要 2 个字符', 422, ['title' => '请输入帖子标题']);
        }

        $content = self::longText($data['content'] ?? '', 20000);
        if ($content === '') {
            Response::error('正文不能为空', 422, ['content' => '请输入正文']);
        }

        $topicKinds = self::topicKinds(Settings::values());
        $defaultKind = (string) (array_key_first($topicKinds) ?? '讨论');
        $kind = trim((string) ($data['kind'] ?? $defaultKind));
        if (!isset($topicKinds[$kind])) {
            $kind = $defaultKind;
        }

        $tags = self::topicTags($data['tags'] ?? []);
        $slug = self::uniqueSlug((string) ($data['slug'] ?? ''), $title, 'topics');
        $review = (Settings::values()['Forum_Topic_Review'] ?? false) === true
            && (string) ($viewer['group'] ?? '') !== 'administrator'
            && (string) ($viewer['group'] ?? '') !== 'editor';
        $status = $review ? 'waiting' : 'publish';
        $now = time();
        $db = Db::get();
        $id = (int) $db->query($db->insert('table.sunken_forum_topics')->rows([
            'circle_id' => $circleId,
            'author_id' => (int) $viewer['uid'],
            'title' => $title,
            'slug' => $slug,
            'content' => $content,
            'kind' => $kind,
            'tags' => self::encodeTopicTags($tags),
            'status' => $status,
            'pinned' => 0,
            'featured' => 0,
            'views' => 0,
            'likes' => 0,
            'favorites' => 0,
            'comments' => 0,
            'created' => $now,
            'updated' => $now,
            'last_reply_at' => $now,
        ]));

        if ($id <= 0) {
            Response::error('发布帖子失败', 500);
        }

        if ($status === 'publish') {
            self::recountCircle($circleId);
        }
        $topic = ['id' => $id, 'slug' => $slug];

        return [
            'id' => $id,
            'slug' => $slug,
            'status' => $status,
            'url' => $review ? '' : self::topicUrl($topic),
            'message' => $review ? '帖子已提交审核' : '发布成功',
        ];
    }

    /**
     * Update an existing topic. Ownership is checked against the database row,
     * never against a client-supplied author id.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleTopicUpdate(array $data): array
    {
        $viewer = self::requireViewer();
        $viewerUid = (int) ($viewer['uid'] ?? 0);
        $topicId = self::intValue($data['topic_id'] ?? 0);
        $row = self::topicRowById($topicId, $viewerUid);
        if ($row === null) {
            Response::error('帖子不存在', 404);
        }
        if (!self::canManageTopic($viewer, $row)) {
            Response::error('你没有编辑这篇帖子的权限', 403);
        }
        if ((string) ($row['status'] ?? '') === 'deleted') {
            Response::error('帖子在回收站中，需管理员恢复后才能编辑', 403);
        }

        $currentCircleId = (int) ($row['circle_id'] ?? 0);
        $circleId = self::intValue($data['circle_id'] ?? $currentCircleId);
        if ($circleId <= 0) {
            $circleId = $currentCircleId;
        }
        $circle = self::circleById($circleId, $viewerUid);
        if ($circle === null) {
            Response::error('圈子不存在', 404, ['circle_id' => '请选择有效的圈子']);
        }
        if (
            $circleId !== $currentCircleId
            && !self::canAccessCircle($circle, $viewer, 'post')
        ) {
            $label = self::followLabel(Settings::values());
            Response::error('请先' . $label . '圈子后再发布帖子', 403);
        }

        $title = self::plainText($data['title'] ?? '', 100);
        if (self::length($title) < 2) {
            Response::error('标题至少需要 2 个字符', 422, ['title' => '请输入帖子标题']);
        }

        $content = self::longText($data['content'] ?? '', 20000);
        if ($content === '') {
            Response::error('正文不能为空', 422, ['content' => '请输入正文']);
        }

        $topicKinds = self::topicKinds(Settings::values());
        $defaultKind = (string) (array_key_first($topicKinds) ?? '讨论');
        $kind = trim((string) ($data['kind'] ?? $defaultKind));
        if (!isset($topicKinds[$kind])) {
            $kind = $defaultKind;
        }

        $tags = self::topicTags($data['tags'] ?? []);
        $slugInput = trim((string) ($data['slug'] ?? ''));
        $slug = $slugInput === ''
            ? (string) ($row['slug'] ?? '')
            : self::uniqueSlug($slugInput, $title, 'topics', $topicId);
        if ($slug === '') {
            $slug = self::uniqueSlug('', $title, 'topics', $topicId);
        }

        $fields = [
            'circle_id' => $circleId,
            'title' => $title,
            'slug' => $slug,
            'content' => $content,
            'kind' => $kind,
            'tags' => self::encodeTopicTags($tags),
            'updated' => time(),
        ];
        $oldStatus = (string) ($row['status'] ?? 'publish');
        if (self::permissions($viewer)['moderate']) {
            if (array_key_exists('status', $data)) {
                $newStatus = trim((string) $data['status']);
                if (!in_array($newStatus, ['publish', 'waiting', 'rejected'], true)) {
                    Response::error('帖子状态无效', 422, ['status' => '请选择有效的帖子状态']);
                }
                $fields['status'] = $newStatus;
            }
            if (array_key_exists('pinned', $data)) {
                $fields['pinned'] = ($data['pinned'] === true || $data['pinned'] === 1) ? 1 : 0;
            }
            if (array_key_exists('featured', $data)) {
                $fields['featured'] = ($data['featured'] === true || $data['featured'] === 1) ? 1 : 0;
            }
        } elseif ($oldStatus === 'rejected') {
            // Re-submitting a rejected topic always returns to the review queue.
            $fields['status'] = 'waiting';
        }

        $db = Db::get();
        $db->query(
            $db->update('table.sunken_forum_topics')
                ->rows($fields)
                ->where('id = ?', $topicId)
        );

        $statusChanged = isset($fields['status']) && $fields['status'] !== $oldStatus;
        if ($currentCircleId !== $circleId) {
            self::recountCircle($currentCircleId);
            self::recountCircle($circleId);
        } elseif ($statusChanged) {
            self::recountCircle($circleId);
        }

        $fresh = self::topicRowById($topicId, $viewerUid) ?? $row;
        $reactions = self::viewerReactions($viewerUid, [$topicId]);
        $ratings = self::ratingsForTopics([$topicId], $viewerUid);
        $topic = self::formatTopic($fresh, $reactions, $ratings);

        return [
            'id' => $topicId,
            'slug' => $slug,
            'status' => (string) ($fresh['status'] ?? 'publish'),
            'url' => $topic['url'],
            'message' => '帖子已保存',
            'topic' => $topic,
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleTopicDelete(array $data): array
    {
        $viewer = self::requireViewer();
        $viewerUid = (int) ($viewer['uid'] ?? 0);
        $topicId = self::intValue($data['topic_id'] ?? 0);
        $row = self::topicRowById($topicId, $viewerUid);
        if ($row === null) {
            Response::error('帖子不存在', 404);
        }
        if (!self::canManageTopic($viewer, $row)) {
            Response::error('你没有删除这篇帖子的权限', 403);
        }
        if ((string) ($row['status'] ?? '') === 'deleted') {
            return [
                'id' => $topicId,
                'deleted' => true,
                'status' => 'deleted',
                'message' => '帖子已在回收站中',
            ];
        }

        $circleId = (int) ($row['circle_id'] ?? 0);
        $db = Db::get();
        $db->query(
            $db->update('table.sunken_forum_topics')
                ->rows([
                    'status' => 'deleted',
                    'deleted_from' => (string) ($row['status'] ?? 'publish'),
                    'deleted_at' => time(),
                    'updated' => time(),
                ])
                ->where('id = ?', $topicId)
        );

        if ($circleId > 0) {
            self::recountCircle($circleId);
        }

        return [
            'id' => $topicId,
            'deleted' => true,
            'status' => 'deleted',
            'message' => '帖子已移入回收站',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleReplyCreate(array $data): array
    {
        $viewer = self::requireViewer();
        $permissions = self::permissions($viewer);
        if (!$permissions['reply']) {
            Response::error('当前不允许回复', 403);
        }

        $topicId = self::intValue($data['topic_id'] ?? 0);
        $topic = self::topicRowById($topicId, (int) $viewer['uid']);
        if ($topic === null) {
            Response::error('帖子不存在', 404);
        }
        if ((string) ($topic['status'] ?? '') === 'deleted') {
            Response::error('帖子在回收站中，暂时无法回复', 403);
        }
        self::assertTopicCircleAccess($topic, $viewer, '请先加入圈子后再回复');

        $content = self::longText($data['content'] ?? '', 5000);
        if ($content === '') {
            Response::error('回复不能为空', 422, ['content' => '请输入回复内容']);
        }

        $parentId = self::intValue($data['parent_id'] ?? 0);
        if ($parentId > 0) {
            $parent = self::replyRow($parentId);
            if ($parent === null || (int) ($parent['topic_id'] ?? 0) !== $topicId) {
                $parentId = 0;
            } elseif ((int) ($parent['parent_id'] ?? 0) > 0) {
                $parentId = (int) $parent['parent_id'];
            }
        }

        $now = time();
        $db = Db::get();
        $id = (int) $db->query($db->insert('table.sunken_forum_replies')->rows([
            'topic_id' => $topicId,
            'author_id' => (int) $viewer['uid'],
            'parent_id' => $parentId,
            'content' => $content,
            'status' => 'approved',
            'created' => $now,
        ]));

        if ($id <= 0) {
            Response::error('回复失败', 500);
        }

        self::recountTopic($topicId);
        $db->query(
            $db->update('table.sunken_forum_topics')
                ->rows(['last_reply_at' => $now, 'updated' => $now])
                ->where('id = ?', $topicId)
        );

        return [
            'id' => $id,
            'message' => '回复成功',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleJoin(array $data): array
    {
        $viewer = self::requireViewer();
        $permissions = self::permissions($viewer);
        if (!$permissions['join']) {
            Response::error('当前不允许加入圈子', 403);
        }

        $circleId = self::intValue($data['circle_id'] ?? 0);
        $circle = self::circleById($circleId, (int) $viewer['uid']);
        if ($circle === null) {
            Response::error('圈子不存在', 404);
        }

        $uid = (int) $viewer['uid'];
        $db = Db::get();
        $row = $db->fetchRow(
            $db->select('id')
                ->from('table.sunken_forum_members')
                ->where('circle_id = ?', $circleId)
                ->where('uid = ?', $uid)
                ->limit(1)
        );

        $joined = !is_array($row);
        if ($joined) {
            self::joinCircleRow($circleId, $uid);
        } else {
            $db->query(
                $db->delete('table.sunken_forum_members')
                    ->where('circle_id = ?', $circleId)
                    ->where('uid = ?', $uid)
            );
        }

        self::recountCircle($circleId);

        return [
            'joined' => $joined,
            'memberCount' => self::countCircleMembers($circleId),
            'message' => $joined ? '已加入圈子' : '已退出圈子',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleReact(array $data): array
    {
        $viewer = self::requireViewer();
        $permissions = self::permissions($viewer);
        if (!$permissions['react']) {
            Response::error('当前不允许点赞或收藏', 403);
        }

        $topicId = self::intValue($data['topic_id'] ?? 0);
        $topic = self::topicRowById($topicId, (int) $viewer['uid']);
        if ($topic === null) {
            Response::error('帖子不存在', 404);
        }
        if ((string) ($topic['status'] ?? '') === 'deleted') {
            Response::error('帖子在回收站中，暂时无法互动', 403);
        }
        self::assertTopicCircleAccess($topic, $viewer, '请先加入圈子后再互动');

        $type = strtolower(trim((string) ($data['type'] ?? 'like')));
        if (!in_array($type, ['like', 'favorite'], true)) {
            Response::error('不支持的操作', 422);
        }

        $uid = (int) $viewer['uid'];
        $db = Db::get();
        $row = $db->fetchRow(
            $db->select('id')
                ->from('table.sunken_forum_reactions')
                ->where('topic_id = ?', $topicId)
                ->where('uid = ?', $uid)
                ->where('type = ?', $type)
                ->limit(1)
        );

        $active = !is_array($row);
        if ($active) {
            $db->query($db->insert('table.sunken_forum_reactions')->rows([
                'topic_id' => $topicId,
                'uid' => $uid,
                'type' => $type,
                'created' => time(),
            ]));
        } else {
            $db->query(
                $db->delete('table.sunken_forum_reactions')
                    ->where('topic_id = ?', $topicId)
                    ->where('uid = ?', $uid)
                    ->where('type = ?', $type)
            );
        }

        self::recountTopic($topicId);

        return [
            'active' => $active,
            'type' => $type,
            'likes' => self::countReactions($topicId, 'like'),
            'favorites' => self::countReactions($topicId, 'favorite'),
        ];
    }

    /**
     * One star rating per user. Values are stored on a 1–5 scale; sending the
     * same value again removes the rating, and an explicit 0 also clears it.
     * Legacy ±1 rows are normalized to one star when read.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleRate(array $data): array
    {
        $viewer = self::requireViewer();
        $permissions = self::permissions($viewer);
        if (!$permissions['react']) {
            Response::error('当前不允许评分', 403);
        }

        $topicId = self::intValue($data['topic_id'] ?? 0);
        $topic = self::topicRowById($topicId, (int) $viewer['uid']);
        if ($topic === null) {
            Response::error('帖子不存在', 404);
        }
        if ((string) ($topic['status'] ?? '') === 'deleted') {
            Response::error('帖子在回收站中，暂时无法评分', 403);
        }
        self::assertTopicCircleAccess($topic, $viewer, '请先加入圈子后再评分');

        $value = self::intValue($data['value'] ?? 0);
        if ($value < 0) {
            $value = self::normalizeRatingValue($value);
        }
        if (!in_array($value, [0, 1, 2, 3, 4, 5], true)) {
            Response::error('评分只能是 1–5 星', 422);
        }

        $uid = (int) $viewer['uid'];
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('id', 'value')
                    ->from('table.sunken_forum_ratings')
                    ->where('topic_id = ?', $topicId)
                    ->where('uid = ?', $uid)
                    ->limit(1)
            );

            $active = true;
            if ($value === 0) {
                if (is_array($row)) {
                    $db->query(
                        $db->delete('table.sunken_forum_ratings')
                            ->where('id = ?', (int) ($row['id'] ?? 0))
                    );
                }
                $active = false;
            } elseif (is_array($row)) {
                $current = self::normalizeRatingValue($row['value'] ?? 0);
                if ($current === $value) {
                    $db->query(
                        $db->delete('table.sunken_forum_ratings')
                            ->where('id = ?', (int) ($row['id'] ?? 0))
                    );
                    $active = false;
                    $value = 0;
                } else {
                    $db->query(
                        $db->update('table.sunken_forum_ratings')
                            ->rows(['value' => $value, 'created' => time()])
                            ->where('id = ?', (int) ($row['id'] ?? 0))
                    );
                }
            } else {
                $db->query($db->insert('table.sunken_forum_ratings')->rows([
                    'topic_id' => $topicId,
                    'uid' => $uid,
                    'value' => $value,
                    'created' => time(),
                ]));
            }
        } catch (\Throwable) {
            Response::error('评分功能尚未初始化，请管理员在主题设置中保存一次。', 503);
        }

        $summary = self::ratingSummary($topicId, $uid);

        return [
            'active' => $active,
            'value' => $value,
            'score' => $summary['score'],
            'average' => $summary['average'],
            'count' => $summary['count'],
            'mine' => $summary['mine'],
            'raters' => self::ratingUsers($topicId),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function currentUser(): array
    {
        if (self::$viewerCache !== null) {
            return self::$viewerCache;
        }

        $uid = UserProfile::viewerUid();
        if ($uid <= 0) {
            self::$viewerCache = [
                'uid' => 0,
                'loggedIn' => false,
                'name' => '',
                'screenName' => '',
                'avatar' => '',
                'group' => 'visitor',
                'groupLabel' => self::GROUP_LABELS['visitor'],
            ];

            return self::$viewerCache;
        }

        $user = self::userInfo($uid);
        $user['loggedIn'] = true;
        self::$viewerCache = $user;

        return self::$viewerCache;
    }

    /**
     * @return array<string, mixed>
     */
    private static function requireViewer(): array
    {
        if (!self::enabled()) {
            Response::error('论坛尚未开启', 404);
        }

        $viewer = self::currentUser();
        if (($viewer['loggedIn'] ?? false) !== true) {
            Response::error('请先登录', 401);
        }

        return $viewer;
    }

    /**
     * @param array<string, mixed> $viewer
     * @return array{createCircle: bool, createTopic: bool, reply: bool, join: bool, react: bool, moderate: bool}
     */
    private static function permissions(array $viewer): array
    {
        if (($viewer['loggedIn'] ?? false) !== true) {
            return [
                'createCircle' => false,
                'createTopic' => false,
                'reply' => false,
                'join' => false,
                'react' => false,
                'moderate' => false,
            ];
        }

        $values = Settings::values();
        $group = (string) ($viewer['group'] ?? 'visitor');

        return [
            'createCircle' => self::groupAtLeast($group, (string) ($values['Forum_Circle_Group'] ?? 'administrator')),
            'createTopic' => self::groupAtLeast($group, (string) ($values['Forum_Topic_Group'] ?? 'subscriber')),
            'reply' => ($values['Forum_Allow_Reply'] ?? true) === true,
            'join' => ($values['Forum_Allow_Join'] ?? true) === true,
            'react' => ($values['Forum_Allow_Reactions'] ?? true) === true,
            'moderate' => $group === 'administrator',
        ];
    }

    /**
     * Authors can maintain their own topics; only forum administrators can
     * maintain someone else's topic.
     *
     * @param array<string, mixed> $viewer
     * @param array<string, mixed> $topic
     */
    private static function canManageTopic(array $viewer, array $topic): bool
    {
        if (($viewer['loggedIn'] ?? false) !== true) {
            return false;
        }

        $uid = (int) ($viewer['uid'] ?? 0);
        if ($uid > 0 && (int) ($topic['author_id'] ?? 0) === $uid) {
            return true;
        }

        return self::permissions($viewer)['moderate'];
    }

    private static function groupAtLeast(string $group, string $minimum): bool
    {
        $rank = self::GROUP_RANK[$group] ?? 0;
        $need = self::GROUP_RANK[$minimum] ?? self::GROUP_RANK['administrator'];

        return $rank >= $need;
    }

    /**
     * @param array<string, mixed> $circle
     * @param array<string, mixed> $viewer
     */
    private static function canAccessCircle(array $circle, array $viewer, string $mode): bool
    {
        $values = Settings::values();
        $required = $mode === 'post'
            ? ($values['Forum_Join_To_Post'] ?? false) === true
            : ($values['Forum_Join_To_View'] ?? false) === true;

        if (!$required) {
            return true;
        }

        $group = (string) ($viewer['group'] ?? 'visitor');
        if (in_array($group, ['editor', 'administrator'], true)) {
            return true;
        }

        if ((int) ($circle['ownerId'] ?? $circle['owner_id'] ?? 0) === (int) ($viewer['uid'] ?? 0)) {
            return true;
        }

        return ($circle['joined'] ?? false) === true;
    }

    /**
     * Reject interactions with topics in circles that the current viewer may
     * not read. Circle pages already render a join gate, but write endpoints
     * are reachable directly and must enforce the same rule.
     *
     * @param array<string, mixed> $topic
     * @param array<string, mixed> $viewer
     */
    private static function assertTopicCircleAccess(array $topic, array $viewer, string $message): void
    {
        if ((Settings::values()['Forum_Join_To_View'] ?? false) !== true) {
            return;
        }

        if (in_array((string) ($viewer['group'] ?? ''), ['editor', 'administrator'], true)) {
            return;
        }

        $circle = self::circleById((int) ($topic['circle_id'] ?? 0), (int) ($viewer['uid'] ?? 0));
        if ($circle === null || !self::canAccessCircle($circle, $viewer, 'view')) {
            Response::error($message, 403);
        }
    }

    /**
     * Circle ids that the current viewer may browse, or null when the
     * join-to-view rule is disabled (and therefore every published circle is
     * visible). An empty list means the viewer cannot browse any circle.
     *
     * @return list<int>|null
     */
    private static function visibleCircleIds(): ?array
    {
        if ((Settings::values()['Forum_Join_To_View'] ?? false) !== true) {
            return null;
        }

        $viewer = self::currentUser();
        if (in_array((string) ($viewer['group'] ?? ''), ['editor', 'administrator'], true)) {
            return null;
        }

        $uid = (int) ($viewer['uid'] ?? 0);
        if ($uid <= 0) {
            return [];
        }

        $ids = array_keys(self::joinedCircleIds($uid));
        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('id')
                    ->from('table.sunken_forum_circles')
                    ->where('owner_id = ?', $uid)
                    ->where('status = ?', 'publish')
            );
            foreach ($rows as $row) {
                if (is_array($row)) {
                    $id = (int) ($row['id'] ?? 0);
                    if ($id > 0) {
                        $ids[] = $id;
                    }
                }
            }
        } catch (\Throwable) {
            return [];
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
        sort($ids);

        return $ids;
    }

    /**
     * @param array<string, mixed> $values
     * @param array<string, mixed> $viewer
     * @return array<string, mixed>
     */
    private static function config(array $values, array $viewer, string $description): array
    {
        $mediaEnabled = ThemeConfig::restV2Enabled() && in_array(
            (string) ($viewer['group'] ?? ''),
            ['editor', 'administrator'],
            true
        );

        return [
            'title' => trim((string) ($values['Forum_Title'] ?? '')) ?: self::displayName($values),
            'displayName' => self::displayName($values),
            'description' => $description,
            'notice' => trim((string) ($values['Forum_Notice'] ?? '')),
            'copy' => [
                'create' => self::createCopy($values),
            ],
            'share' => PageData::shareConfig(),
            'followLabel' => self::followLabel($values),
            'joinToView' => ($values['Forum_Join_To_View'] ?? false) === true,
            'joinToPost' => ($values['Forum_Join_To_Post'] ?? false) === true,
            'quickPost' => ($values['Forum_Quick_Post'] ?? true) === true,
            'urlMode' => self::urlMode($values),
            'homeUrl' => self::homeUrl(),
            'editorUrl' => self::editorUrl(),
            'nonce' => Typecho::securityToken(),
            'endpoints' => self::endpoints(),
            'viewer' => $viewer,
            'permissions' => self::permissions($viewer),
            'topicKinds' => self::topicKindOptions($values),
            'quickReply' => self::quickReply($values),
            'canUseMedia' => $mediaEnabled,
            'mediaEndpoint' => self::mediaEndpoint(),
            'nullImage' => Assets::url('img/null.svg'),
            'reportEmail' => self::reportEmail($values),
            'postPerPage' => self::perPage($values),
        ];
    }

    /**
     * @return array<string, string>
     */
    private static function endpoints(): array
    {
        return [
            'circleCreate' => Endpoint::url('forum-circle-create'),
            'circleUpdate' => Endpoint::url('forum-circle-update'),
            'topicCreate' => Endpoint::url('forum-topic-create'),
            'topicUpdate' => Endpoint::url('forum-topic-update'),
            'topicDelete' => Endpoint::url('forum-topic-delete'),
            'moderation' => Endpoint::url('forum-moderation'),
            'replyCreate' => Endpoint::url('forum-reply-create'),
            'join' => Endpoint::url('forum-join'),
            'react' => Endpoint::url('forum-react'),
            'rate' => Endpoint::url('forum-rate'),
        ];
    }

    public static function editorUrl(): string
    {
        return self::indexBase() . '/user/content/editor';
    }

    private static function mediaEndpoint(): string
    {
        return self::indexBase() . '/' . Prefixes::v2() . '/media';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function urlMode(array $values): string
    {
        $mode = strtolower(trim((string) ($values['Forum_Url_Mode'] ?? 'slug')));

        return $mode === 'id' ? 'id' : 'slug';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function perPage(array $values): int
    {
        $value = (int) ($values['Forum_Posts_Per_Page'] ?? 12);

        return max(4, min(50, $value));
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function reportEmail(array $values): string
    {
        $mail = trim((string) ($values['Forum_Report_Email'] ?? ''));

        return filter_var($mail, FILTER_VALIDATE_EMAIL) !== false ? $mail : '';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function displayName(array $values): string
    {
        $name = trim((string) ($values['Forum_Display_Name'] ?? ''));

        return $name !== '' ? self::clip($name, 24) : '圈子';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function followLabel(array $values): string
    {
        $label = trim((string) ($values['Forum_Follow_Label'] ?? ''));

        return $label !== '' ? self::clip($label, 8) : '关注';
    }

    /**
     * @param array<string, mixed> $values
     * @return array{title: string, text: string, hint: string, action: string}
     */
    private static function createCopy(array $values): array
    {
        $displayName = self::displayName($values);
        $title = trim((string) ($values['Forum_Create_Title'] ?? ''));
        $text = trim((string) ($values['Forum_Create_Text'] ?? ''));
        $hint = trim((string) ($values['Forum_Create_Hint'] ?? ''));
        $action = trim((string) ($values['Forum_Create_Action'] ?? ''));

        return [
            'title' => self::clip($title !== '' ? $title : '创建自己的' . $displayName, 60),
            'text' => self::clip($text, 200),
            'hint' => self::clip($hint !== '' ? $hint : 'slug 留空会自动生成随机地址。', 160),
            'action' => self::clip($action !== '' ? $action : '创建' . $displayName, 20),
        ];
    }

    /**
     * Topic names are stored exactly as the user typed them. Legacy
     * "key|label" entries are still accepted so existing installs keep their
     * labels, while new topics store the human-readable name directly.
     *
     * @param array<string, mixed> $values
     * @return array<string, string>
     */
    private static function topicKinds(array $values): array
    {
        $raw = $values['Forum_Topic_Kinds'] ?? '';
        $entries = is_array($raw) ? $raw : [$raw];
        $items = [];

        foreach ($entries as $entry) {
            foreach (preg_split('/\r\n|\r|\n/', (string) $entry) ?: [] as $line) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }

                $parts = explode('|', $line, 2);
                $label = self::clip(trim((string) ($parts[1] ?? $parts[0] ?? '')), 12);
                if ($label === '' || isset($items[$label])) {
                    continue;
                }

                $items[$label] = $label;
                if (count($items) >= 12) {
                    break 2;
                }
            }
        }

        if ($items === []) {
            foreach (self::DEFAULT_TOPIC_KINDS as $label) {
                $items[$label] = $label;
            }
        }

        return $items;
    }

    /**
     * @param array<string, mixed> $values
     * @return list<array{value: string, label: string}>
     */
    public static function topicKindOptions(array $values): array
    {
        $items = [];
        foreach (self::topicKinds($values) as $value => $label) {
            $items[] = ['value' => $value, 'label' => $label];
        }

        return $items;
    }

    /**
     * Topics use article-like tags: multiple free-form names are normalized,
     * de-duplicated and stored as JSON in the topic row.
     *
     * @return list<string>
     */
    private static function topicTags(mixed $value): array
    {
        $entries = [];

        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                $entries = $decoded;
            } else {
                $entries = preg_split('/[,，\r\n]+/u', $value) ?: [];
            }
        } elseif (is_array($value)) {
            $entries = $value;
        }

        $tags = [];
        $seen = [];

        foreach ($entries as $entry) {
            if (!is_scalar($entry)) {
                continue;
            }

            $tag = self::plainText((string) $entry, self::MAX_TOPIC_TAG_LENGTH);
            $tag = trim((string) preg_replace('/^#+/u', '', $tag));
            $tag = trim((string) preg_replace('/\s+/u', ' ', $tag));
            if ($tag === '') {
                continue;
            }

            $key = strtolower($tag);
            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $tags[] = $tag;
            if (count($tags) >= self::MAX_TOPIC_TAGS) {
                break;
            }
        }

        return $tags;
    }

    /**
     * @param list<string> $tags
     */
    private static function encodeTopicTags(array $tags): string
    {
        if ($tags === []) {
            return '';
        }

        $encoded = json_encode(array_values($tags), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return is_string($encoded) ? $encoded : '';
    }

    /**
     * Suggestions are collected from recent published topics so the editor
     * feels close to Typecho's article-tag input.
     *
     * @return list<string>
     */
    private static function popularTags(int $limit = 16): array
    {
        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('tags')
                    ->from('table.sunken_forum_topics')
                    ->where('status = ?', 'publish')
                    ->order('last_reply_at', Db::SORT_DESC)
                    ->limit(200)
            );
        } catch (\Throwable) {
            return [];
        }

        $counts = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            foreach (self::topicTags($row['tags'] ?? '') as $tag) {
                $counts[$tag] = ($counts[$tag] ?? 0) + 1;
            }
        }

        uksort($counts, static function (string $left, string $right) use ($counts): int {
            $byCount = ($counts[$right] ?? 0) <=> ($counts[$left] ?? 0);

            return $byCount !== 0 ? $byCount : strcmp($left, $right);
        });

        return array_slice(array_keys($counts), 0, max(0, $limit));
    }

    /**
     * @param array<string, mixed> $values
     * @return array{enabled: bool, items: list<string>}
     */
    private static function quickReply(array $values): array
    {
        $raw = (string) ($values['Forum_Quick_Reply_Items'] ?? '');
        $items = [];

        foreach (preg_split('/\r\n|\r|\n/', $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            $items[] = self::clip($line, 200);
            if (count($items) >= 20) {
                break;
            }
        }

        $enabled = ($values['Forum_Quick_Reply'] ?? true) === true;

        return [
            'enabled' => $enabled && $items !== [],
            'items' => $items,
        ];
    }

    private static function pageNumber(): int
    {
        $page = isset($_GET['page']) && is_scalar($_GET['page']) ? (int) $_GET['page'] : 1;

        return max(1, min(1000, $page));
    }

    public static function homeUrl(): string
    {
        return self::indexBase() . '/circles';
    }

    /**
     * @param array<string, mixed> $circle
     */
    public static function circleUrl(array $circle): string
    {
        $slug = (string) ($circle['slug'] ?? '');

        return self::indexBase() . '/circle/' . rawurlencode($slug);
    }

    /**
     * @param array<string, mixed> $topic
     */
    public static function topicUrl(array $topic): string
    {
        $mode = self::urlMode(Settings::values());
        $value = $mode === 'id'
            ? (string) ($topic['id'] ?? '')
            : (string) ($topic['slug'] ?? '');

        return self::indexBase() . '/circles/' . rawurlencode($value);
    }

    private static function indexBase(): string
    {
        $index = Typecho::indexUrl();
        if ($index === '') {
            $index = Typecho::siteUrl();
        }

        return rtrim($index, '/');
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function circles(int $limit, int $viewerUid): array
    {
        try {
            $db = Db::get();
            $query = $db->select('*')
                ->from('table.sunken_forum_circles')
                ->where('status = ?', 'publish')
                ->order('sort', Db::SORT_DESC)
                ->order('topic_count', Db::SORT_DESC)
                ->order('id', Db::SORT_ASC);

            if ($limit > 0) {
                $query->limit($limit);
            }

            $rows = $db->fetchAll($query);
        } catch (\Throwable) {
            return [];
        }

        $joined = self::joinedCircleIds($viewerUid);
        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $items[] = self::formatCircle($row, $joined);
        }

        return $items;
    }

    /**
     * Circle totals for one user. Created circles are counted separately and
     * removed from the joined total so the two numbers can be shown together
     * without double counting the owner's own circles.
     *
     * @return array{enabled: bool, joined: int, created: int}
     */
    public static function userCircleCounts(int $uid): array
    {
        $off = ['enabled' => false, 'joined' => 0, 'created' => 0];
        if ($uid <= 0 || !self::enabled()) {
            return $off;
        }

        try {
            $db = Db::get();
            $created = (int) ($db->fetchObject(
                $db->select('COUNT(*) AS num')
                    ->from('table.sunken_forum_circles')
                    ->where('owner_id = ?', $uid)
                    ->where('status = ?', 'publish')
            )->num ?? 0);
            $joined = (int) ($db->fetchObject(
                $db->select('COUNT(*) AS num')
                    ->from('table.sunken_forum_circles')
                    ->join(
                        'table.sunken_forum_members',
                        'table.sunken_forum_members.circle_id = table.sunken_forum_circles.id'
                    )
                    ->where('table.sunken_forum_members.uid = ?', $uid)
                    ->where('table.sunken_forum_circles.owner_id <> ?', $uid)
                    ->where('table.sunken_forum_circles.status = ?', 'publish')
            )->num ?? 0);
        } catch (\Throwable) {
            return ['enabled' => true, 'joined' => 0, 'created' => 0];
        }

        return ['enabled' => true, 'joined' => $joined, 'created' => $created];
    }

    /**
     * Circle lists for the public user space and the account panel.
     *
     * @return array{joined: list<array<string, mixed>>, created: list<array<string, mixed>>}
     */
    public static function userCircles(int $uid, int $limit = 12): array
    {
        $empty = ['joined' => [], 'created' => []];
        if ($uid <= 0 || !self::enabled()) {
            return $empty;
        }

        $limit = max(1, min(30, $limit));
        try {
            $db = Db::get();
            $createdRows = $db->fetchAll(
                $db->select('*')
                    ->from('table.sunken_forum_circles')
                    ->where('owner_id = ?', $uid)
                    ->where('status = ?', 'publish')
                    ->order('topic_count', Db::SORT_DESC)
                    ->order('id', Db::SORT_DESC)
                    ->limit($limit)
            );
            $joinedRows = $db->fetchAll(
                $db->select('table.sunken_forum_circles.*')
                    ->from('table.sunken_forum_circles')
                    ->join(
                        'table.sunken_forum_members',
                        'table.sunken_forum_members.circle_id = table.sunken_forum_circles.id'
                    )
                    ->where('table.sunken_forum_members.uid = ?', $uid)
                    ->where('table.sunken_forum_circles.owner_id <> ?', $uid)
                    ->where('table.sunken_forum_circles.status = ?', 'publish')
                    ->order('table.sunken_forum_circles.topic_count', Db::SORT_DESC)
                    ->order('table.sunken_forum_circles.id', Db::SORT_ASC)
                    ->limit($limit)
            );
        } catch (\Throwable) {
            return $empty;
        }

        $joined = self::joinedCircleIds($uid);
        $format = static function (array $rows) use ($joined): array {
            $items = [];
            foreach ($rows as $row) {
                if (is_array($row)) {
                    $items[] = self::formatCircle($row, $joined);
                }
            }

            return $items;
        };

        return [
            'joined' => $format(is_array($joinedRows) ? $joinedRows : []),
            'created' => $format(is_array($createdRows) ? $createdRows : []),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param array<int, bool> $joined
     * @return array<string, mixed>
     */
    private static function formatCircle(array $row, array $joined = []): array
    {
        $id = (int) ($row['id'] ?? 0);
        $slug = (string) ($row['slug'] ?? '');

        self::$circleCache[$id] = [
            'id' => $id,
            'name' => (string) ($row['name'] ?? ''),
            'slug' => $slug,
            'description' => (string) ($row['description'] ?? ''),
            'icon' => self::safeImageUrl($row['icon'] ?? ''),
            'background' => self::safeImageUrl($row['background'] ?? ''),
            'url' => self::circleUrl(['slug' => $slug]),
            'topicCount' => (int) ($row['topic_count'] ?? 0),
            'memberCount' => (int) ($row['member_count'] ?? 0),
            'ownerId' => (int) ($row['owner_id'] ?? 0),
            'joined' => isset($joined[$id]),
        ];

        return self::$circleCache[$id];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function circleBySlug(string $slug, int $viewerUid): ?array
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('*')
                    ->from('table.sunken_forum_circles')
                    ->where('slug = ?', $slug)
                    ->where('status = ?', 'publish')
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        if (!is_array($row)) {
            return null;
        }

        return self::formatCircle($row, self::joinedCircleIds($viewerUid));
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function circleById(int $id, int $viewerUid): ?array
    {
        if ($id <= 0) {
            return null;
        }

        if (isset(self::$circleCache[$id])) {
            $circle = self::$circleCache[$id];
            $circle['joined'] = isset(self::joinedCircleIds($viewerUid)[$id]);

            return $circle;
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('*')
                    ->from('table.sunken_forum_circles')
                    ->where('id = ?', $id)
                    ->where('status = ?', 'publish')
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        if (!is_array($row)) {
            return null;
        }

        return self::formatCircle($row, self::joinedCircleIds($viewerUid));
    }

    /**
     * @param array<string, mixed> $options
     * @return array{items: list<array<string, mixed>>, pager: array<string, mixed>}
     */
    private static function topics(array $options): array
    {
        $page = max(1, (int) ($options['page'] ?? 1));
        $perPage = max(1, (int) ($options['perPage'] ?? 12));
        $offset = ($page - 1) * $perPage;
        $viewerUid = (int) ($options['viewer'] ?? 0);
        $circleId = (int) ($options['circle'] ?? 0);
        $authorId = (int) ($options['author'] ?? 0);
        $ownPending = ($options['ownPending'] ?? false) === true;
        $values = Settings::values();
        $sort = strtolower(trim((string) ($options['sort'] ?? $values['Forum_Sort_Mode'] ?? 'latest')));
        if (!in_array($sort, ['latest', 'recommended', 'random'], true)) {
            $sort = 'latest';
        }
        $recommended = $sort === 'recommended';
        $random = $sort === 'random';

        try {
            $db = Db::get();
            $query = $db->select('*')
                ->from('table.sunken_forum_topics');
            $countQuery = $db->select('COUNT(*) AS num')
                ->from('table.sunken_forum_topics');

            if ($ownPending && $viewerUid > 0) {
                $query->where('(status = ? OR author_id = ?)', 'publish', $viewerUid);
                $countQuery->where('(status = ? OR author_id = ?)', 'publish', $viewerUid);
            } else {
                $query->where('status = ?', 'publish');
                $countQuery->where('status = ?', 'publish');
            }

            if ($circleId > 0) {
                $query->where('circle_id = ?', $circleId);
                $countQuery->where('circle_id = ?', $circleId);
            }

            if ($authorId > 0) {
                $query->where('author_id = ?', $authorId);
                $countQuery->where('author_id = ?', $authorId);
            }

            $visibleCircleIds = self::visibleCircleIds();
            if ($visibleCircleIds !== null) {
                if ($visibleCircleIds === []) {
                    return [
                        'items' => [],
                        'pager' => self::pager($page, $perPage, 0),
                    ];
                }
                $query->where('circle_id IN ?', $visibleCircleIds);
                $countQuery->where('circle_id IN ?', $visibleCircleIds);
            }

            $query->order('pinned', Db::SORT_DESC);
            if ($recommended) {
                $query->order('created', Db::SORT_DESC)->limit(400);
            } elseif ($random) {
                $query->order('created', Db::SORT_DESC)->limit(400);
            } else {
                $query->order('last_reply_at', Db::SORT_DESC)
                    ->order('id', Db::SORT_DESC)
                    ->limit($perPage)
                    ->offset($offset);
            }

            $rows = $db->fetchAll($query);
            $total = (int) ($db->fetchObject($countQuery)->num ?? 0);
        } catch (\Throwable) {
            return [
                'items' => [],
                'pager' => self::pager($page, $perPage, 0),
            ];
        }

        if ($recommended && $rows !== []) {
            $candidateIds = array_map(
                static fn (array $row): int => (int) ($row['id'] ?? 0),
                $rows
            );
            $candidateRatings = self::ratingsForTopics($candidateIds, $viewerUid);
            $weights = [
                'time' => max(0, min(10, (int) ($values['Forum_Weight_Time'] ?? 3))),
                'views' => max(0, min(10, (int) ($values['Forum_Weight_Views'] ?? 2))),
                'favorites' => max(0, min(10, (int) ($values['Forum_Weight_Favorites'] ?? 3))),
                'comments' => max(0, min(10, (int) ($values['Forum_Weight_Comments'] ?? 3))),
                'rating' => max(0, min(10, (int) ($values['Forum_Weight_Rating'] ?? 4))),
            ];
            usort($rows, static function (array $left, array $right) use ($candidateRatings, $weights): int {
                $pinnedLeft = (int) ($left['pinned'] ?? 0);
                $pinnedRight = (int) ($right['pinned'] ?? 0);
                if ($pinnedLeft !== $pinnedRight) {
                    return $pinnedRight <=> $pinnedLeft;
                }

                $scoreLeft = self::recommendedScore($left, $candidateRatings[(int) ($left['id'] ?? 0)] ?? [], $weights);
                $scoreRight = self::recommendedScore($right, $candidateRatings[(int) ($right['id'] ?? 0)] ?? [], $weights);

                return $scoreRight <=> $scoreLeft;
            });
            $rows = array_slice($rows, $offset, $perPage);
        } elseif ($random && $rows !== []) {
            $pinnedRows = [];
            $regularRows = [];
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                if ((int) ($row['pinned'] ?? 0) === 1) {
                    $pinnedRows[] = $row;
                } else {
                    $regularRows[] = $row;
                }
            }

            shuffle($regularRows);
            $rows = array_merge($pinnedRows, $regularRows);
            $rows = array_slice($rows, $offset, $perPage);
        }

        $topicIds = array_map(
            static fn (array $row): int => (int) ($row['id'] ?? 0),
            $rows
        );
        $reactions = self::viewerReactions($viewerUid, $topicIds);
        $ratings = self::ratingsForTopics($topicIds, $viewerUid);
        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $items[] = self::formatTopic($row, $reactions, $ratings);
        }

        $pager = self::pager($page, $perPage, $total);
        if ($random) {
            $pager['hasMore'] = false;
            $pager['nextUrl'] = '';
        }

        return [
            'items' => $items,
            'pager' => $pager,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param array{score?: int, average?: float, count?: int} $rating
     * @param array{time: int, views: int, favorites: int, comments: int, rating: int} $weights
     */
    private static function recommendedScore(array $row, array $rating, array $weights): float
    {
        $age = max(0, time() - (int) ($row['created'] ?? 0));
        $timeScore = exp(-$age / 1209600);
        $viewsScore = min(1.0, log10(1 + max(0, (int) ($row['views'] ?? 0))) / 4);
        $favoriteScore = min(1.0, log10(1 + max(0, (int) ($row['favorites'] ?? 0))) / 2);
        $commentScore = min(1.0, log10(1 + max(0, (int) ($row['comments'] ?? 0))) / 2);
        $average = max(0.0, min(5.0, (float) ($rating['average'] ?? 0)));
        $count = max(0, (int) ($rating['count'] ?? 0));
        $ratingScore = ($average / 5) * min(1.0, log10(1 + $count) / 1.5);

        return $timeScore * $weights['time']
            + $viewsScore * $weights['views']
            + $favoriteScore * $weights['favorites']
            + $commentScore * $weights['comments']
            + $ratingScore * $weights['rating'];
    }

    /**
     * @return array<string, mixed>
     */
    private static function pager(int $page, int $perPage, int $total): array
    {
        $hasMore = $page * $perPage < $total;
        $nextUrl = '';
        if ($hasMore) {
            $path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
            $query = $_GET;
            $query['page'] = $page + 1;
            $nextUrl = $path . '?' . http_build_query($query);
        }

        return [
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'hasMore' => $hasMore,
            'nextUrl' => $nextUrl,
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @param array{liked: array<int, bool>, favorited: array<int, bool>} $reactions
     * @param array<int, array{score: int, average: float, count: int, mine: int}> $ratings
     * @return array<string, mixed>
     */
    private static function formatTopic(array $row, array $reactions, array $ratings = []): array
    {
        $id = (int) ($row['id'] ?? 0);
        $circleId = (int) ($row['circle_id'] ?? 0);
        $circle = self::circleById($circleId, 0);
        $content = (string) ($row['content'] ?? '');
        $created = (int) ($row['created'] ?? 0);
        $viewer = self::currentUser();
        $isManager = in_array((string) ($viewer['group'] ?? ''), ['editor', 'administrator'], true);
        $status = (string) ($row['status'] ?? 'publish');
        $deleted = $status === 'deleted';
        $restricted = $deleted && !$isManager;
        $topicKinds = self::topicKinds(Settings::values());
        $defaultKind = (string) (array_key_first($topicKinds) ?? '讨论');
        $rawKind = trim((string) ($row['kind'] ?? ''));
        $kind = self::LEGACY_TOPIC_KIND_LABELS[$rawKind] ?? ($rawKind !== '' ? $rawKind : $defaultKind);
        $tags = self::topicTags($row['tags'] ?? '');
        $rating = $ratings[$id] ?? ['score' => 0, 'average' => 0.0, 'count' => 0, 'mine' => 0];

        return [
            'id' => $id,
            'slug' => (string) ($row['slug'] ?? ''),
            'title' => (string) ($row['title'] ?? ''),
            'status' => $status,
            'deleted' => $deleted,
            'restricted' => $restricted,
            'url' => self::topicUrl($row),
            'excerpt' => $restricted ? '' : self::excerpt($content, 150),
            'thumbnail' => $restricted ? '' : self::firstImage($content),
            'kind' => $kind,
            'kindLabel' => $topicKinds[$kind] ?? ($kind !== '' ? $kind : $defaultKind),
            'tags' => $tags,
            'pinned' => (int) ($row['pinned'] ?? 0) === 1,
            'featured' => (int) ($row['featured'] ?? 0) === 1,
            'views' => (int) ($row['views'] ?? 0),
            'likes' => (int) ($row['likes'] ?? 0),
            'favorites' => (int) ($row['favorites'] ?? 0),
            'comments' => (int) ($row['comments'] ?? 0),
            'ratingScore' => (int) ($rating['score'] ?? 0),
            'ratingAverage' => (float) ($rating['average'] ?? 0.0),
            'ratingCount' => (int) ($rating['count'] ?? 0),
            'ratingMine' => (int) ($rating['mine'] ?? 0),
            'created' => $created,
            'createdText' => self::timeText($created),
            'lastReplyText' => self::timeText((int) ($row['last_reply_at'] ?? $created)),
            'circle' => $circle === null ? null : [
                'id' => $circle['id'],
                'name' => $circle['name'],
                'slug' => $circle['slug'],
                'url' => $circle['url'],
            ],
            'author' => self::userInfo((int) ($row['author_id'] ?? 0)),
            'liked' => isset($reactions['liked'][$id]),
            'favorited' => isset($reactions['favorited'][$id]),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function topicByValue(string $value, int $viewerUid): ?array
    {
        $mode = self::urlMode(Settings::values());
        $row = null;

        if ($mode === 'id' && ctype_digit($value)) {
            $row = self::topicRowById((int) $value, $viewerUid);
        } else {
            $row = self::topicRowBySlug($value, $viewerUid);
            if ($row === null && ctype_digit($value)) {
                $row = self::topicRowById((int) $value, $viewerUid);
            }
        }

        if ($row === null) {
            return null;
        }

        $topicId = (int) ($row['id'] ?? 0);
        $reactions = self::viewerReactions($viewerUid, [$topicId]);
        $ratings = self::ratingsForTopics([$topicId], $viewerUid);
        $topic = self::formatTopic($row, $reactions, $ratings);
        $topic['ratingUsers'] = self::ratingUsers($topicId);
        $topic['rawContent'] = (string) ($row['content'] ?? '');

        return $topic;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function topicRowById(int $id, int $viewerUid): ?array
    {
        if ($id <= 0) {
            return null;
        }

        try {
            $db = Db::get();
            $viewer = self::currentUser();
            $isManager = in_array((string) ($viewer['group'] ?? ''), ['editor', 'administrator'], true);
            $row = $db->fetchRow(
                $db->select('*')
                    ->from('table.sunken_forum_topics')
                    ->where('id = ?', $id)
                    ->where(
                        $isManager ? '1 = 1' : '(status = ? OR author_id = ?)',
                        ...($isManager ? [] : ['publish', $viewerUid])
                    )
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        return is_array($row) ? $row : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function topicRowBySlug(string $slug, int $viewerUid): ?array
    {
        if ($slug === '') {
            return null;
        }

        try {
            $db = Db::get();
            $viewer = self::currentUser();
            $isManager = in_array((string) ($viewer['group'] ?? ''), ['editor', 'administrator'], true);
            $row = $db->fetchRow(
                $db->select('*')
                    ->from('table.sunken_forum_topics')
                    ->where('slug = ?', $slug)
                    ->where(
                        $isManager ? '1 = 1' : '(status = ? OR author_id = ?)',
                        ...($isManager ? [] : ['publish', $viewerUid])
                    )
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        return is_array($row) ? $row : null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function hotTopics(int $limit, int $viewerUid): array
    {
        $visibleCircleIds = self::visibleCircleIds();
        if ($visibleCircleIds === []) {
            return [];
        }

        try {
            $db = Db::get();
            $query = $db->select('*')
                ->from('table.sunken_forum_topics')
                ->where('status = ?', 'publish');
            if ($visibleCircleIds !== null) {
                $query->where('circle_id IN ?', $visibleCircleIds);
            }
            $rows = $db->fetchAll(
                $query->order('views', Db::SORT_DESC)
                    ->order('comments', Db::SORT_DESC)
                    ->order('last_reply_at', Db::SORT_DESC)
                    ->limit($limit)
            );
        } catch (\Throwable) {
            return [];
        }

        $topicIds = array_map(
            static fn (array $row): int => (int) ($row['id'] ?? 0),
            $rows
        );
        $reactions = self::viewerReactions($viewerUid, $topicIds);
        $ratings = self::ratingsForTopics($topicIds, $viewerUid);
        $items = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $items[] = self::formatTopic($row, $reactions, $ratings);
            }
        }

        return $items;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function replies(int $topicId, int $viewerUid): array
    {
        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('*')
                    ->from('table.sunken_forum_replies')
                    ->where('topic_id = ?', $topicId)
                    ->where('status = ?', 'approved')
                    ->order('created', Db::SORT_ASC)
                    ->order('id', Db::SORT_ASC)
            );
        } catch (\Throwable) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $id = (int) ($row['id'] ?? 0);
            $created = (int) ($row['created'] ?? 0);
            $items[$id] = [
                'id' => $id,
                'parentId' => (int) ($row['parent_id'] ?? 0),
                'contentHtml' => self::markdown((string) ($row['content'] ?? '')),
                'created' => $created,
                'createdText' => self::timeText($created),
                'author' => self::userInfo((int) ($row['author_id'] ?? 0)),
                'children' => [],
            ];
        }

        foreach ($items as $id => $item) {
            $parentId = (int) $item['parentId'];
            if ($parentId > 0 && isset($items[$parentId])) {
                $items[$parentId]['children'][] = $item;
            }
        }

        $roots = [];
        foreach ($items as $item) {
            $parentId = (int) $item['parentId'];
            if ($parentId > 0 && isset($items[$parentId])) {
                continue;
            }

            $roots[] = $item;
        }

        unset($viewerUid);

        return array_values($roots);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function replyRow(int $id): ?array
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('*')
                    ->from('table.sunken_forum_replies')
                    ->where('id = ?', $id)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        return is_array($row) ? $row : null;
    }

    /**
     * @return array{liked: array<int, bool>, favorited: array<int, bool>}
     */
    private static function viewerReactions(int $viewerUid, array $topicIds): array
    {
        $result = ['liked' => [], 'favorited' => []];
        if ($viewerUid <= 0 || $topicIds === []) {
            return $result;
        }

        $topicIds = array_values(array_filter(array_map('intval', $topicIds)));
        if ($topicIds === []) {
            return $result;
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('topic_id', 'type')
                    ->from('table.sunken_forum_reactions')
                    ->where('uid = ?', $viewerUid)
                    ->where('topic_id IN ?', $topicIds)
            );
        } catch (\Throwable) {
            return $result;
        }

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $topicId = (int) ($row['topic_id'] ?? 0);
            $type = (string) ($row['type'] ?? '');
            if ($type === 'like') {
                $result['liked'][$topicId] = true;
            } elseif ($type === 'favorite') {
                $result['favorited'][$topicId] = true;
            }
        }

        return $result;
    }

    /**
     * @param list<int|mixed> $topicIds
     * @return array<int, array{score: int, average: float, count: int, mine: int}>
     */
    private static function ratingsForTopics(array $topicIds, int $viewerUid): array
    {
        $topicIds = array_values(array_filter(array_map('intval', $topicIds)));
        if ($topicIds === []) {
            return [];
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('topic_id', 'uid', 'value')
                    ->from('table.sunken_forum_ratings')
                    ->where('topic_id IN ?', $topicIds)
            );
        } catch (\Throwable) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $topicId = (int) ($row['topic_id'] ?? 0);
            if ($topicId <= 0) {
                continue;
            }

            $result[$topicId] ??= ['score' => 0, 'average' => 0.0, 'count' => 0, 'mine' => 0];
            $value = self::normalizeRatingValue($row['value'] ?? 0);
            if ($value === 0) {
                continue;
            }

            $result[$topicId]['score'] += $value;
            $result[$topicId]['count']++;
            if ($viewerUid > 0 && (int) ($row['uid'] ?? 0) === $viewerUid) {
                $result[$topicId]['mine'] = $value;
            }
        }

        foreach ($result as &$summary) {
            if ($summary['count'] > 0) {
                $summary['average'] = round($summary['score'] / $summary['count'], 1);
            }
        }
        unset($summary);

        return $result;
    }

    /**
     * @return array{score: int, average: float, count: int, mine: int}
     */
    private static function ratingSummary(int $topicId, int $viewerUid): array
    {
        $items = self::ratingsForTopics([$topicId], $viewerUid);

        return $items[$topicId] ?? ['score' => 0, 'average' => 0.0, 'count' => 0, 'mine' => 0];
    }

    private static function normalizeRatingValue(mixed $value): int
    {
        $score = is_numeric($value) ? (int) $value : 0;
        if ($score < 0) {
            $score = abs($score);
        }

        return max(0, min(5, $score));
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function ratingUsers(int $topicId): array
    {
        if ($topicId <= 0) {
            return [];
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('uid', 'value', 'created')
                    ->from('table.sunken_forum_ratings')
                    ->where('topic_id = ?', $topicId)
                    ->order('created', Db::SORT_DESC)
                    ->limit(12)
            );
        } catch (\Throwable) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $uid = (int) ($row['uid'] ?? 0);
            if ($uid <= 0) {
                continue;
            }

            $user = self::userInfo($uid);
            $value = self::normalizeRatingValue($row['value'] ?? 0);
            if ($value === 0) {
                continue;
            }

            $items[] = [
                'uid' => $uid,
                'name' => (string) ($user['name'] ?? ''),
                'screenName' => (string) ($user['screenName'] ?? ''),
                'avatar' => (string) ($user['avatar'] ?? ''),
                'url' => self::indexBase() . '/users/' . $uid,
                'value' => $value,
            ];
        }

        return $items;
    }

    /**
     * @return array<int, bool>
     */
    private static function joinedCircleIds(int $uid): array
    {
        if ($uid <= 0) {
            return [];
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('circle_id')
                    ->from('table.sunken_forum_members')
                    ->where('uid = ?', $uid)
            );
        } catch (\Throwable) {
            return [];
        }

        $ids = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $ids[(int) ($row['circle_id'] ?? 0)] = true;
            }
        }

        return $ids;
    }

    /**
     * @return array<string, int>
     */
    private static function stats(): array
    {
        return [
            'circles' => self::countRows('table.sunken_forum_circles', 'status = ?', ['publish']),
            'topics' => self::countRows('table.sunken_forum_topics', 'status = ?', ['publish']),
            'replies' => self::countRows('table.sunken_forum_replies', 'status = ?', ['approved']),
            'members' => self::countRows('table.sunken_forum_members'),
            'todayTopics' => self::countRows(
                'table.sunken_forum_topics',
                'status = ? AND created >= ?',
                ['publish', strtotime('today') ?: 0]
            ),
        ];
    }

    /**
     * @param list<mixed> $params
     */
    private static function countRows(string $table, string $condition = '', array $params = []): int
    {
        try {
            $db = Db::get();
            $query = $db->select('COUNT(*) AS num')->from($table);
            if ($condition !== '') {
                $query->where($condition, ...$params);
            }
            $row = $db->fetchObject($query);

            return (int) ($row->num ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    /**
     * @return list<array{user: array<string, mixed>, topics: int}>
     */
    private static function topAuthors(int $limit): array
    {
        $visibleCircleIds = self::visibleCircleIds();
        if ($visibleCircleIds === []) {
            return [];
        }

        try {
            $db = Db::get();
            $query = $db->select('author_id', 'COUNT(*) AS num')
                ->from('table.sunken_forum_topics')
                ->where('status = ?', 'publish');
            if ($visibleCircleIds !== null) {
                $query->where('circle_id IN ?', $visibleCircleIds);
            }
            $rows = $db->fetchAll(
                $query->group('author_id')
                    ->order('num', Db::SORT_DESC)
                    ->limit($limit)
            );
        } catch (\Throwable) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $uid = (int) ($row['author_id'] ?? 0);
            if ($uid <= 0) {
                continue;
            }
            $items[] = [
                'user' => self::userInfo($uid),
                'topics' => (int) ($row['num'] ?? 0),
            ];
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    private static function userInfo(int $uid): array
    {
        if ($uid <= 0) {
            return [
                'uid' => 0,
                'loggedIn' => false,
                'name' => '访客',
                'screenName' => '访客',
                'avatar' => '',
                'group' => 'visitor',
                'groupLabel' => self::GROUP_LABELS['visitor'],
            ];
        }

        if (isset(self::$userCache[$uid])) {
            return self::$userCache[$uid];
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('uid', 'name', 'screenName', 'mail', 'group')
                    ->from('table.users')
                    ->where('uid = ?', $uid)
                    ->limit(1)
            );
        } catch (\Throwable) {
            $row = null;
        }

        $row = is_array($row) ? $row : [];
        $group = (string) ($row['group'] ?? 'subscriber');
        $display = trim((string) ($row['screenName'] ?? ''));
        if ($display === '') {
            $display = trim((string) ($row['name'] ?? '用户'));
        }
        $user = [
            'uid' => $uid,
            'loggedIn' => false,
            'name' => (string) ($row['name'] ?? ''),
            'screenName' => $display,
            'avatar' => Avatar::forUser($uid, (string) ($row['mail'] ?? '')),
            'group' => $group,
            'groupLabel' => self::GROUP_LABELS[$group] ?? $group,
            'url' => self::indexBase() . '/users/' . $uid,
        ];

        self::$userCache[$uid] = $user;

        return $user;
    }

    private static function joinCircleRow(int $circleId, int $uid): void
    {
        try {
            $db = Db::get();
            $db->query($db->insert('table.sunken_forum_members')->rows([
                'circle_id' => $circleId,
                'uid' => $uid,
                'joined' => time(),
            ]));
        } catch (\Throwable $exception) {
            error_log('SunkenBoat forum member insert failed: ' . $exception->getMessage());
        }
    }

    private static function recountCircle(int $circleId): void
    {
        try {
            $db = Db::get();
            $db->query(
                $db->update('table.sunken_forum_circles')
                    ->rows([
                        'topic_count' => self::countRows(
                            'table.sunken_forum_topics',
                            'circle_id = ? AND status = ?',
                            [$circleId, 'publish']
                        ),
                        'member_count' => self::countCircleMembers($circleId),
                        'updated' => time(),
                    ])
                    ->where('id = ?', $circleId)
            );
        } catch (\Throwable $exception) {
            error_log('SunkenBoat forum circle recount failed: ' . $exception->getMessage());
        }
    }

    private static function countCircleMembers(int $circleId): int
    {
        return self::countRows('table.sunken_forum_members', 'circle_id = ?', [$circleId]);
    }

    private static function recountCircleByTopic(int $topicId): void
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('circle_id')
                    ->from('table.sunken_forum_topics')
                    ->where('id = ?', $topicId)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return;
        }

        $circleId = is_array($row) ? (int) ($row['circle_id'] ?? 0) : 0;
        if ($circleId > 0) {
            self::recountCircle($circleId);
        }
    }

    private static function recountTopic(int $topicId): void
    {
        try {
            $db = Db::get();
            $db->query(
                $db->update('table.sunken_forum_topics')
                    ->rows([
                        'comments' => self::countRows(
                            'table.sunken_forum_replies',
                            'topic_id = ? AND status = ?',
                            [$topicId, 'approved']
                        ),
                        'likes' => self::countReactions($topicId, 'like'),
                        'favorites' => self::countReactions($topicId, 'favorite'),
                        'updated' => time(),
                    ])
                    ->where('id = ?', $topicId)
            );
        } catch (\Throwable $exception) {
            error_log('SunkenBoat forum topic recount failed: ' . $exception->getMessage());
        }
    }

    private static function countReactions(int $topicId, string $type): int
    {
        return self::countRows(
            'table.sunken_forum_reactions',
            'topic_id = ? AND type = ?',
            [$topicId, $type]
        );
    }

    private static function recordTopicView(int $topicId): void
    {
        if ($topicId <= 0) {
            return;
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('views')
                    ->from('table.sunken_forum_topics')
                    ->where('id = ?', $topicId)
                    ->limit(1)
            );
            $views = is_array($row) ? (int) ($row['views'] ?? 0) : 0;
            $db->query(
                $db->update('table.sunken_forum_topics')
                    ->rows(['views' => $views + 1])
                    ->where('id = ?', $topicId)
            );
        } catch (\Throwable) {
            // Incrementing a view counter must never break the page.
        }
    }

    private static function uniqueSlug(
        string $value,
        string $fallback,
        string $table,
        int $ignoreId = 0
    ): string
    {
        $value = trim($value);
        $slug = $value !== ''
            ? Typecho::slugName($value, '', 64)
            : '';

        $slug = strtolower((string) preg_replace('/[^a-z0-9_-]+/i', '-', $slug));
        $slug = trim((string) preg_replace('/-+/', '-', $slug), '-');

        if ($slug === '' || preg_match('/^[a-z0-9][a-z0-9_-]{0,63}$/', $slug) !== 1) {
            $slug = Typecho::random(10);
            if ($slug === '') {
                $slug = bin2hex(random_bytes(5));
            }
        }

        $slug = strtolower((string) preg_replace('/[^a-z0-9_-]+/', '-', $slug));
        $slug = trim((string) preg_replace('/-+/', '-', $slug), '-');
        if ($slug === '') {
            $slug = substr(sha1($fallback . microtime(true)), 0, 10);
        }
        $slug = substr($slug, 0, 64);

        $base = $slug;
        $suffix = 1;
        while (self::slugExists($table, $slug, $ignoreId)) {
            $suffix++;
            $slug = substr($base, 0, 56) . '-' . $suffix;
            if ($suffix > 20) {
                $slug = Typecho::random(10) ?: bin2hex(random_bytes(5));
                break;
            }
        }

        return $slug;
    }

    private static function slugExists(string $table, string $slug, int $ignoreId = 0): bool
    {
        $table = $table === 'circles' ? 'table.sunken_forum_circles' : 'table.sunken_forum_topics';

        try {
            $db = Db::get();
            $query = $db->select('id')
                ->from($table)
                ->where('slug = ?', $slug);
            if ($ignoreId > 0) {
                $query->where('id <> ?', $ignoreId);
            }
            $row = $db->fetchRow($query->limit(1));
        } catch (\Throwable) {
            return false;
        }

        return is_array($row);
    }

    private static function markdown(string $source): string
    {
        $html = Typecho::markdown($source);
        $allowed = '<p><br><h2><h3><h4><strong><em><del><blockquote><ul><ol><li>'
            . '<pre><code><a href title rel><img src alt title loading>'
            . '<table><thead><tbody><tr><th><td><hr>';

        try {
            $html = \Typecho\Common::stripTags($html, $allowed);
        } catch (\Throwable) {
            $html = strip_tags($html, $allowed);
        }

        return (string) preg_replace_callback(
            '/\s(href|src)\s*=\s*(["\'])(.*?)\2/is',
            static function (array $match): string {
                $attribute = strtolower((string) ($match[1] ?? ''));
                $value = html_entity_decode(
                    (string) ($match[3] ?? ''),
                    ENT_QUOTES | ENT_HTML5,
                    'UTF-8'
                );
                $value = strtolower((string) preg_replace('/[\x00-\x20\x7f]+/', '', trim($value)));
                if ($value === '') {
                    return $match[0];
                }

                if ($attribute === 'href' && str_starts_with($value, '#')) {
                    return $match[0];
                }

                if (str_starts_with($value, '/') && !str_starts_with($value, '//')) {
                    return $match[0];
                }

                return preg_match('#^https?://[^/\s]+#', $value) === 1 ? $match[0] : '';
            },
            $html
        );
    }

    private static function excerpt(string $source, int $limit): string
    {
        $text = self::plainText(strip_tags(Typecho::markdown($source)), $limit);
        if ($text === '') {
            $text = self::plainText($source, $limit);
        }

        return $text;
    }

    private static function firstImage(string $source): string
    {
        if (preg_match('/<img[^>]+src\s*=\s*(["\'])([^"\']+)\1/i', Typecho::markdown($source), $match) !== 1) {
            return '';
        }

        return self::safeImageUrl($match[2] ?? '');
    }

    private static function plainText(mixed $value, int $limit): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = strip_tags($value);
        $value = html_entity_decode($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $value = (string) preg_replace('/\s+/u', ' ', $value);
        $value = trim($value);

        return self::clip($value, $limit);
    }

    private static function longText(mixed $value, int $limit): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = str_replace("\0", '', trim($value));
        if (self::length($value) <= $limit) {
            return $value;
        }

        return function_exists('mb_substr')
            ? mb_substr($value, 0, $limit, 'UTF-8')
            : substr($value, 0, $limit);
    }

    private static function clip(string $value, int $limit): string
    {
        if (self::length($value) <= $limit) {
            return $value;
        }

        $value = function_exists('mb_substr')
            ? mb_substr($value, 0, $limit, 'UTF-8')
            : substr($value, 0, $limit);

        return rtrim($value) . '…';
    }

    private static function length(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    }

    private static function intValue(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private static function safeImageUrl(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        if ($value === '') {
            return '';
        }

        $site = rtrim(Typecho::siteUrl(), '/');
        if (str_starts_with($value, '/')) {
            return str_contains($value, '..') || str_contains($value, '\\')
                ? ''
                : $site . $value;
        }

        if (
            str_starts_with($value, '//')
            || preg_match('/[\x00-\x20\x7f"\'<>`\\\\]/', $value) === 1
            || filter_var($value, FILTER_VALIDATE_URL) === false
        ) {
            return '';
        }

        $parts = parse_url($value);
        if (!is_array($parts)) {
            return '';
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (
            !in_array($scheme, ['http', 'https'], true)
            || (string) ($parts['host'] ?? '') === ''
            || isset($parts['user'])
            || isset($parts['pass'])
        ) {
            return '';
        }

        return $value;
    }

    private static function timeText(int $timestamp): string
    {
        if ($timestamp <= 0) {
            return '';
        }

        $now = time();
        $diff = $now - $timestamp;
        if ($diff >= 0 && $diff < 60) {
            return '刚刚';
        }
        if ($diff >= 60 && $diff < 3600) {
            return intdiv($diff, 60) . ' 分钟前';
        }
        if ($diff >= 3600 && $diff < 86400) {
            return intdiv($diff, 3600) . ' 小时前';
        }
        if ($diff >= 86400 && $diff < 604800) {
            return intdiv($diff, 86400) . ' 天前';
        }
        if ($timestamp >= strtotime('today') ?: 0) {
            return date('H:i', $timestamp);
        }
        if ($timestamp >= (strtotime('this year') ?: 0)) {
            return date('n月j日', $timestamp);
        }

        return date('Y年n月j日', $timestamp);
    }

    /**
     * @return array<string, string>
     */
    private static function tableNames(): array
    {
        $prefix = Db::get()->getPrefix();
        $names = [];
        foreach (['circles', 'topics', 'replies', 'members', 'reactions', 'ratings'] as $name) {
            $names[$name] = $prefix . 'sunken_forum_' . $name;
        }

        return $names;
    }

    private static function ensureTopicTagsColumn(Db $db, string $driver, string $prefix): void
    {
        $table = $prefix . 'sunken_forum_topics';
        $exists = false;

        if ($driver === 'sqlite') {
            $name = str_replace('"', '', $table);
            $columns = $db->fetchAll('PRAGMA table_info("' . $name . '")');
            foreach ($columns as $column) {
                if (is_array($column) && ($column['name'] ?? '') === 'tags') {
                    $exists = true;
                    break;
                }
            }
        } elseif ($driver === 'mysql') {
            $name = str_replace('`', '', $table);
            $exists = $db->fetchRow("SHOW COLUMNS FROM `{$name}` LIKE 'tags'") !== null;
        } elseif ($driver === 'pgsql') {
            $name = str_replace("'", "''", $table);
            $exists = $db->fetchRow(
                "SELECT column_name FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = '{$name}'
                  AND column_name = 'tags'
                LIMIT 1"
            ) !== null;
        } else {
            return;
        }

        if ($exists) {
            return;
        }

        $sql = match ($driver) {
            'sqlite' => 'ALTER TABLE "' . str_replace('"', '', $table)
                . '" ADD COLUMN "tags" TEXT NOT NULL DEFAULT \'\'',
            'mysql' => 'ALTER TABLE `' . str_replace('`', '', $table)
                . '` ADD COLUMN `tags` TEXT NULL AFTER `kind`',
            'pgsql' => 'ALTER TABLE "' . str_replace('"', '', $table)
                . '" ADD COLUMN "tags" TEXT NOT NULL DEFAULT \'\'',
            default => '',
        };

        if ($sql !== '') {
            $db->query($sql, Db::WRITE, '');
        }
    }

    private static function ensureCircleBackgroundColumn(Db $db, string $driver, string $prefix): void
    {
        $table = $prefix . 'sunken_forum_circles';
        $exists = false;

        if ($driver === 'sqlite') {
            $name = str_replace('"', '', $table);
            $columns = $db->fetchAll('PRAGMA table_info("' . $name . '")');
            foreach ($columns as $column) {
                if (is_array($column) && ($column['name'] ?? '') === 'background') {
                    $exists = true;
                    break;
                }
            }
        } elseif ($driver === 'mysql') {
            $name = str_replace('`', '', $table);
            $exists = $db->fetchRow("SHOW COLUMNS FROM `{$name}` LIKE 'background'") !== null;
        } elseif ($driver === 'pgsql') {
            $name = str_replace("'", "''", $table);
            $exists = $db->fetchRow(
                "SELECT column_name FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = '{$name}'
                  AND column_name = 'background'
                LIMIT 1"
            ) !== null;
        } else {
            return;
        }

        if ($exists) {
            return;
        }

        $sql = match ($driver) {
            'sqlite' => 'ALTER TABLE "' . str_replace('"', '', $table)
                . '" ADD COLUMN "background" TEXT NOT NULL DEFAULT \'\'',
            'mysql' => 'ALTER TABLE `' . str_replace('`', '', $table)
                . '` ADD COLUMN `background` VARCHAR(255) NOT NULL DEFAULT \'\' AFTER `icon`',
            'pgsql' => 'ALTER TABLE "' . str_replace('"', '', $table)
                . '" ADD COLUMN "background" VARCHAR(255) NOT NULL DEFAULT \'\'',
            default => '',
        };

        if ($sql !== '') {
            $db->query($sql, Db::WRITE, '');
        }
    }

    private static function ensureTopicSoftDeleteColumns(Db $db, string $driver, string $prefix): void
    {
        $table = $prefix . 'sunken_forum_topics';
        $columns = [
            'deleted_at' => [
                'sqlite' => 'INTEGER NOT NULL DEFAULT 0',
                'mysql' => 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER `status`',
                'pgsql' => 'INTEGER NOT NULL DEFAULT 0',
            ],
            'deleted_from' => [
                'sqlite' => 'TEXT NOT NULL DEFAULT \'\'',
                'mysql' => 'VARCHAR(16) NOT NULL DEFAULT \'\' AFTER `deleted_at`',
                'pgsql' => 'VARCHAR(16) NOT NULL DEFAULT \'\'',
            ],
        ];

        foreach ($columns as $column => $definitions) {
            $exists = false;

            if ($driver === 'sqlite') {
                $name = str_replace('"', '', $table);
                $rows = $db->fetchAll('PRAGMA table_info("' . $name . '")');
                foreach ($rows as $row) {
                    if (is_array($row) && ($row['name'] ?? '') === $column) {
                        $exists = true;
                        break;
                    }
                }
            } elseif ($driver === 'mysql') {
                $name = str_replace('`', '', $table);
                $exists = $db->fetchRow(
                    "SHOW COLUMNS FROM `{$name}` LIKE '" . str_replace("'", "''", $column) . "'"
                ) !== null;
            } elseif ($driver === 'pgsql') {
                $name = str_replace("'", "''", $table);
                $exists = $db->fetchRow(
                    "SELECT column_name FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND table_name = '{$name}'
                      AND column_name = '" . str_replace("'", "''", $column) . "'
                    LIMIT 1"
                ) !== null;
            }

            if ($exists || !isset($definitions[$driver])) {
                continue;
            }

            $quoted = $driver === 'mysql'
                ? '`' . str_replace('`', '', $table) . '`'
                : '"' . str_replace('"', '', $table) . '"';
            $columnSql = $driver === 'mysql'
                ? '`' . str_replace('`', '', $column) . '`'
                : '"' . str_replace('"', '', $column) . '"';
            $db->query(
                'ALTER TABLE ' . $quoted . ' ADD COLUMN ' . $columnSql . ' ' . $definitions[$driver],
                Db::WRITE,
                ''
            );
        }
    }

    /**
     * Copy legacy forum rows into the new sunken_* tables. Old tables are kept
     * untouched so the migration stays reversible for site owners.
     */
    private static function migrateLegacyTables(Db $db, string $driver, string $prefix): void
    {
        foreach (['circles', 'topics', 'replies', 'members', 'reactions', 'ratings'] as $name) {
            try {
                $target = 'table.sunken_forum_' . $name;
                $targetRows = $db->fetchObject(
                    $db->select('COUNT(*) AS num')->from($target)
                );
                if ((int) ($targetRows->num ?? 0) > 0) {
                    continue;
                }

                try {
                    $db->fetchRow(
                        $db->select('id')->from('table.forum_' . $name)->limit(1)
                    );
                } catch (\Throwable) {
                    continue;
                }

                $legacyRows = $db->fetchAll(
                    $db->select('*')->from('table.forum_' . $name)
                );
                if ($legacyRows === []) {
                    continue;
                }

                $inserted = [];
                foreach ($legacyRows as $row) {
                    if (!is_array($row)) {
                        continue;
                    }

                    $db->query($db->insert($target)->rows($row));
                    $id = (int) ($row['id'] ?? 0);
                    if ($id > 0) {
                        $inserted[] = $id;
                    }
                }

                if ($driver === 'pgsql' && $inserted !== []) {
                    $safe = str_replace('"', '', $prefix . 'sunken_forum_' . $name);
                    $max = max($inserted);
                    $db->query(
                        "SELECT setval(pg_get_serial_sequence('\"{$safe}\"', 'id'), {$max}, true)",
                        Db::READ,
                        ''
                    );
                }
            } catch (\Throwable $exception) {
                error_log(
                    'SunkenBoat legacy forum migration skipped for ' . $name . ': '
                    . $exception->getMessage()
                );
            }
        }
    }

    /**
     * @return list<string>
     */
    private static function schema(string $driver, string $prefix): array
    {
        $quote = static fn (string $name): string => $driver === 'mysql'
            ? '`' . str_replace('`', '', $name) . '`'
            : '"' . str_replace('"', '', $name) . '"';

        $circles = $prefix . 'sunken_forum_circles';
        $topics = $prefix . 'sunken_forum_topics';
        $replies = $prefix . 'sunken_forum_replies';
        $members = $prefix . 'sunken_forum_members';
        $reactions = $prefix . 'sunken_forum_reactions';
        $ratings = $prefix . 'sunken_forum_ratings';

        if ($driver === 'sqlite') {
            return [
                'CREATE TABLE IF NOT EXISTS ' . $quote($circles) . ' (
                    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "name" TEXT NOT NULL,
                    "slug" TEXT NOT NULL,
                    "description" TEXT NOT NULL DEFAULT \'\',
                    "icon" TEXT NOT NULL DEFAULT \'\',
                    "background" TEXT NOT NULL DEFAULT \'\',
                    "owner_id" INTEGER NOT NULL DEFAULT 0,
                    "status" TEXT NOT NULL DEFAULT \'publish\',
                    "sort" INTEGER NOT NULL DEFAULT 0,
                    "topic_count" INTEGER NOT NULL DEFAULT 0,
                    "member_count" INTEGER NOT NULL DEFAULT 0,
                    "created" INTEGER NOT NULL DEFAULT 0,
                    "updated" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("slug")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($circles . '_sort') . ' ON ' . $quote($circles) . ' ("sort", "topic_count")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($topics) . ' (
                    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "circle_id" INTEGER NOT NULL DEFAULT 0,
                    "author_id" INTEGER NOT NULL DEFAULT 0,
                    "title" TEXT NOT NULL,
                    "slug" TEXT NOT NULL,
                    "content" TEXT NOT NULL,
                    "kind" TEXT NOT NULL DEFAULT \'discussion\',
                    "tags" TEXT NOT NULL DEFAULT \'\',
                    "status" TEXT NOT NULL DEFAULT \'publish\',
                    "deleted_at" INTEGER NOT NULL DEFAULT 0,
                    "deleted_from" TEXT NOT NULL DEFAULT \'\',
                    "pinned" INTEGER NOT NULL DEFAULT 0,
                    "featured" INTEGER NOT NULL DEFAULT 0,
                    "views" INTEGER NOT NULL DEFAULT 0,
                    "likes" INTEGER NOT NULL DEFAULT 0,
                    "favorites" INTEGER NOT NULL DEFAULT 0,
                    "comments" INTEGER NOT NULL DEFAULT 0,
                    "created" INTEGER NOT NULL DEFAULT 0,
                    "updated" INTEGER NOT NULL DEFAULT 0,
                    "last_reply_at" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("slug")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_feed') . ' ON ' . $quote($topics) . ' ("circle_id", "status", "pinned", "last_reply_at")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_author') . ' ON ' . $quote($topics) . ' ("author_id", "status", "created")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_status') . ' ON ' . $quote($topics) . ' ("status", "pinned", "last_reply_at")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_hot') . ' ON ' . $quote($topics) . ' ("views", "comments")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($replies) . ' (
                    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "topic_id" INTEGER NOT NULL DEFAULT 0,
                    "author_id" INTEGER NOT NULL DEFAULT 0,
                    "parent_id" INTEGER NOT NULL DEFAULT 0,
                    "content" TEXT NOT NULL,
                    "status" TEXT NOT NULL DEFAULT \'approved\',
                    "created" INTEGER NOT NULL DEFAULT 0
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($replies . '_topic') . ' ON ' . $quote($replies) . ' ("topic_id", "status", "created")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($replies . '_author') . ' ON ' . $quote($replies) . ' ("author_id")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($members) . ' (
                    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "circle_id" INTEGER NOT NULL DEFAULT 0,
                    "uid" INTEGER NOT NULL DEFAULT 0,
                    "joined" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("circle_id", "uid")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($members . '_uid') . ' ON ' . $quote($members) . ' ("uid", "circle_id")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($reactions) . ' (
                    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "topic_id" INTEGER NOT NULL DEFAULT 0,
                    "uid" INTEGER NOT NULL DEFAULT 0,
                    "type" TEXT NOT NULL DEFAULT \'like\',
                    "created" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("topic_id", "uid", "type")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($reactions . '_topic') . ' ON ' . $quote($reactions) . ' ("topic_id", "type")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($reactions . '_uid') . ' ON ' . $quote($reactions) . ' ("uid", "type")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($ratings) . ' (
                    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                    "topic_id" INTEGER NOT NULL DEFAULT 0,
                    "uid" INTEGER NOT NULL DEFAULT 0,
                    "value" INTEGER NOT NULL DEFAULT 0,
                    "created" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("topic_id", "uid")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($ratings . '_topic') . ' ON ' . $quote($ratings) . ' ("topic_id", "value")',
            ];
        }

        if ($driver === 'pgsql') {
            return [
                'CREATE TABLE IF NOT EXISTS ' . $quote($circles) . ' (
                    "id" SERIAL PRIMARY KEY,
                    "name" VARCHAR(80) NOT NULL,
                    "slug" VARCHAR(64) NOT NULL UNIQUE,
                    "description" VARCHAR(280) NOT NULL DEFAULT \'\',
                    "icon" VARCHAR(255) NOT NULL DEFAULT \'\',
                    "background" VARCHAR(255) NOT NULL DEFAULT \'\',
                    "owner_id" INTEGER NOT NULL DEFAULT 0,
                    "status" VARCHAR(16) NOT NULL DEFAULT \'publish\',
                    "sort" INTEGER NOT NULL DEFAULT 0,
                    "topic_count" INTEGER NOT NULL DEFAULT 0,
                    "member_count" INTEGER NOT NULL DEFAULT 0,
                    "created" INTEGER NOT NULL DEFAULT 0,
                    "updated" INTEGER NOT NULL DEFAULT 0
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($circles . '_sort') . ' ON ' . $quote($circles) . ' ("sort", "topic_count")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($topics) . ' (
                    "id" SERIAL PRIMARY KEY,
                    "circle_id" INTEGER NOT NULL DEFAULT 0,
                    "author_id" INTEGER NOT NULL DEFAULT 0,
                    "title" VARCHAR(140) NOT NULL,
                    "slug" VARCHAR(80) NOT NULL UNIQUE,
                    "content" TEXT NOT NULL,
                    "kind" VARCHAR(16) NOT NULL DEFAULT \'discussion\',
                    "tags" TEXT NOT NULL DEFAULT \'\',
                    "status" VARCHAR(16) NOT NULL DEFAULT \'publish\',
                    "deleted_at" INTEGER NOT NULL DEFAULT 0,
                    "deleted_from" VARCHAR(16) NOT NULL DEFAULT \'\',
                    "pinned" SMALLINT NOT NULL DEFAULT 0,
                    "featured" SMALLINT NOT NULL DEFAULT 0,
                    "views" INTEGER NOT NULL DEFAULT 0,
                    "likes" INTEGER NOT NULL DEFAULT 0,
                    "favorites" INTEGER NOT NULL DEFAULT 0,
                    "comments" INTEGER NOT NULL DEFAULT 0,
                    "created" INTEGER NOT NULL DEFAULT 0,
                    "updated" INTEGER NOT NULL DEFAULT 0,
                    "last_reply_at" INTEGER NOT NULL DEFAULT 0
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_feed') . ' ON ' . $quote($topics) . ' ("circle_id", "status", "pinned", "last_reply_at")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_author') . ' ON ' . $quote($topics) . ' ("author_id", "status", "created")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_status') . ' ON ' . $quote($topics) . ' ("status", "pinned", "last_reply_at")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($topics . '_hot') . ' ON ' . $quote($topics) . ' ("views", "comments")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($replies) . ' (
                    "id" SERIAL PRIMARY KEY,
                    "topic_id" INTEGER NOT NULL DEFAULT 0,
                    "author_id" INTEGER NOT NULL DEFAULT 0,
                    "parent_id" INTEGER NOT NULL DEFAULT 0,
                    "content" TEXT NOT NULL,
                    "status" VARCHAR(16) NOT NULL DEFAULT \'approved\',
                    "created" INTEGER NOT NULL DEFAULT 0
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($replies . '_topic') . ' ON ' . $quote($replies) . ' ("topic_id", "status", "created")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($replies . '_author') . ' ON ' . $quote($replies) . ' ("author_id")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($members) . ' (
                    "id" SERIAL PRIMARY KEY,
                    "circle_id" INTEGER NOT NULL DEFAULT 0,
                    "uid" INTEGER NOT NULL DEFAULT 0,
                    "joined" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("circle_id", "uid")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($members . '_uid') . ' ON ' . $quote($members) . ' ("uid", "circle_id")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($reactions) . ' (
                    "id" SERIAL PRIMARY KEY,
                    "topic_id" INTEGER NOT NULL DEFAULT 0,
                    "uid" INTEGER NOT NULL DEFAULT 0,
                    "type" VARCHAR(16) NOT NULL DEFAULT \'like\',
                    "created" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("topic_id", "uid", "type")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($reactions . '_topic') . ' ON ' . $quote($reactions) . ' ("topic_id", "type")',
                'CREATE INDEX IF NOT EXISTS ' . $quote($reactions . '_uid') . ' ON ' . $quote($reactions) . ' ("uid", "type")',
                'CREATE TABLE IF NOT EXISTS ' . $quote($ratings) . ' (
                    "id" SERIAL PRIMARY KEY,
                    "topic_id" INTEGER NOT NULL DEFAULT 0,
                    "uid" INTEGER NOT NULL DEFAULT 0,
                    "value" SMALLINT NOT NULL DEFAULT 0,
                    "created" INTEGER NOT NULL DEFAULT 0,
                    UNIQUE ("topic_id", "uid")
                )',
                'CREATE INDEX IF NOT EXISTS ' . $quote($ratings . '_topic') . ' ON ' . $quote($ratings) . ' ("topic_id", "value")',
            ];
        }

        return [
            'CREATE TABLE IF NOT EXISTS ' . $quote($circles) . ' (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `name` VARCHAR(80) NOT NULL,
                `slug` VARCHAR(64) NOT NULL,
                `description` VARCHAR(280) NOT NULL DEFAULT \'\',
                `icon` VARCHAR(255) NOT NULL DEFAULT \'\',
                `background` VARCHAR(255) NOT NULL DEFAULT \'\',
                `owner_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `status` VARCHAR(16) NOT NULL DEFAULT \'publish\',
                `sort` INT NOT NULL DEFAULT 0,
                `topic_count` INT UNSIGNED NOT NULL DEFAULT 0,
                `member_count` INT UNSIGNED NOT NULL DEFAULT 0,
                `created` INT UNSIGNED NOT NULL DEFAULT 0,
                `updated` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                UNIQUE KEY `' . $circles . '_slug` (`slug`),
                KEY `' . $circles . '_sort` (`sort`, `topic_count`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS ' . $quote($topics) . ' (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `circle_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `author_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `title` VARCHAR(140) NOT NULL,
                `slug` VARCHAR(80) NOT NULL,
                `content` MEDIUMTEXT NOT NULL,
                `kind` VARCHAR(16) NOT NULL DEFAULT \'discussion\',
                `tags` TEXT NULL,
                `status` VARCHAR(16) NOT NULL DEFAULT \'publish\',
                `deleted_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `deleted_from` VARCHAR(16) NOT NULL DEFAULT \'\',
                `pinned` TINYINT UNSIGNED NOT NULL DEFAULT 0,
                `featured` TINYINT UNSIGNED NOT NULL DEFAULT 0,
                `views` INT UNSIGNED NOT NULL DEFAULT 0,
                `likes` INT UNSIGNED NOT NULL DEFAULT 0,
                `favorites` INT UNSIGNED NOT NULL DEFAULT 0,
                `comments` INT UNSIGNED NOT NULL DEFAULT 0,
                `created` INT UNSIGNED NOT NULL DEFAULT 0,
                `updated` INT UNSIGNED NOT NULL DEFAULT 0,
                `last_reply_at` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                UNIQUE KEY `' . $topics . '_slug` (`slug`),
                KEY `' . $topics . '_feed` (`circle_id`, `status`, `pinned`, `last_reply_at`),
                KEY `' . $topics . '_author` (`author_id`, `status`, `created`),
                KEY `' . $topics . '_status` (`status`, `pinned`, `last_reply_at`),
                KEY `' . $topics . '_hot` (`views`, `comments`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS ' . $quote($replies) . ' (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `topic_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `author_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `parent_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `content` TEXT NOT NULL,
                `status` VARCHAR(16) NOT NULL DEFAULT \'approved\',
                `created` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                KEY `' . $replies . '_topic` (`topic_id`, `status`, `created`),
                KEY `' . $replies . '_author` (`author_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS ' . $quote($members) . ' (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `circle_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `uid` INT UNSIGNED NOT NULL DEFAULT 0,
                `joined` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                UNIQUE KEY `' . $members . '_uniq` (`circle_id`, `uid`),
                KEY `' . $members . '_uid` (`uid`, `circle_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS ' . $quote($reactions) . ' (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `topic_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `uid` INT UNSIGNED NOT NULL DEFAULT 0,
                `type` VARCHAR(16) NOT NULL DEFAULT \'like\',
                `created` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                UNIQUE KEY `' . $reactions . '_uniq` (`topic_id`, `uid`, `type`),
                KEY `' . $reactions . '_topic` (`topic_id`, `type`),
                KEY `' . $reactions . '_uid` (`uid`, `type`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
            'CREATE TABLE IF NOT EXISTS ' . $quote($ratings) . ' (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `topic_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `uid` INT UNSIGNED NOT NULL DEFAULT 0,
                `value` TINYINT NOT NULL DEFAULT 0,
                `created` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                UNIQUE KEY `' . $ratings . '_uniq` (`topic_id`, `uid`),
                KEY `' . $ratings . '_topic` (`topic_id`, `value`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
        ];
    }
}
