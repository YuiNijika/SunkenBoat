<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * User balance, points, experience, levels, daily check-in and account status.
 *
 * The Typecho users table is left untouched. Economy and moderation state live
 * in {prefix}sunken_user_meta and are written only by server-side code.
 */
final class UserEconomy
{
    public const STATUS_NORMAL = 'normal';

    public const STATUS_BANNED = 'banned';

    private const TABLE = 'table.sunken_user_meta';

    private static bool $installed = false;

    private static bool $settingsWrite = false;

    public static function register(): void
    {
        Endpoint::register('user-economy', [self::class, 'handleSummary'], [
            'auth' => 'user',
            'method' => 'GET',
        ]);
        Endpoint::register('user-checkin', [self::class, 'handleCheckin'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
        Endpoint::register('economy-install', [self::class, 'handleInstall'], [
            'auth' => 'admin',
            'method' => 'POST',
        ]);
        Endpoint::register('operations-overview', [self::class, 'handleOverview'], [
            'auth' => 'user',
            'method' => 'GET',
        ]);
        Endpoint::register('operations-users', [self::class, 'handleUsers'], [
            'auth' => 'admin',
            'method' => 'GET',
        ]);
        Endpoint::register('operations-user-update', [self::class, 'handleUserUpdate'], [
            'auth' => 'admin',
            'method' => 'POST',
        ]);
        Endpoint::register('operations-user-status', [self::class, 'handleUserStatus'], [
            'auth' => 'admin',
            'method' => 'POST',
        ]);

        Hooks::addFilter('rest.v2.login.decision', [self::class, 'loginDecision']);
        Hooks::addAction('rest.v2.auth', [self::class, 'guardRequest']);
        Hooks::addAction('ajax.authorize', [self::class, 'guardAjax']);
        Hooks::addAction('rest.request', [self::class, 'settingsRequest']);
        Hooks::addFilter('rest.response', [self::class, 'settingsResponse']);
    }

    public static function enabled(): bool
    {
        return (Settings::values()['Economy_Enabled'] ?? false) === true;
    }

    public static function checkinEnabled(): bool
    {
        return self::enabled()
            && (Settings::values()['Economy_Checkin_Enabled'] ?? false) === true;
    }

    public static function install(): bool
    {
        if (self::$installed) {
            return true;
        }

        try {
            $db = Db::get();
            $driver = DownloadStore::driver();
            $prefix = $db->getPrefix();
            $quote = static fn (string $name): string => $driver === 'mysql'
                ? '`' . str_replace('`', '', $name) . '`'
                : '"' . str_replace('"', '', $name) . '"';
            $table = $quote($prefix . 'sunken_user_meta');
            $suffix = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
            $db->query('CREATE TABLE IF NOT EXISTS ' . $table . ' (
                uid INTEGER PRIMARY KEY,
                balance_cents INTEGER NOT NULL DEFAULT 0,
                points INTEGER NOT NULL DEFAULT 0,
                experience INTEGER NOT NULL DEFAULT 0,
                level INTEGER NOT NULL DEFAULT 0,
                checkin_last VARCHAR(10) NOT NULL DEFAULT \'\',
                checkin_streak INTEGER NOT NULL DEFAULT 0,
                checkin_total INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(16) NOT NULL DEFAULT \'normal\',
                ban_type VARCHAR(16) NOT NULL DEFAULT \'none\',
                ban_until INTEGER NOT NULL DEFAULT 0,
                ban_reason VARCHAR(200) NOT NULL DEFAULT \'\',
                created INTEGER NOT NULL DEFAULT 0,
                updated INTEGER NOT NULL DEFAULT 0
            )' . $suffix, Db::WRITE, '');

            $indexes = [
                [$prefix . 'sunken_user_meta_status', $table, 'status, ban_until'],
                [$prefix . 'sunken_user_meta_checkin', $table, 'checkin_last'],
            ];
            foreach ($indexes as [$name, $target, $columns]) {
                if ($driver === 'mysql') {
                    $existing = $db->fetchAll($db->query('SHOW INDEX FROM ' . $target, Db::WRITE));
                    foreach ($existing as $row) {
                        if (is_array($row) && (string) ($row['Key_name'] ?? '') === $name) {
                            continue 2;
                        }
                    }
                }
                $db->query(
                    'CREATE INDEX ' . ($driver === 'mysql' ? '' : 'IF NOT EXISTS ')
                    . $quote($name) . ' ON ' . $target . ' (' . $columns . ')',
                    Db::WRITE,
                    ''
                );
            }

            return self::$installed = true;
        } catch (\Throwable $exception) {
            error_log('SunkenBoat economy installation failed: ' . $exception->getMessage());

            return false;
        }
    }

    public static function available(): bool
    {
        if (self::$installed) {
            return true;
        }

        try {
            $db = Db::get();
            $db->fetchRow($db->select('uid')->from(self::TABLE)->limit(1));
        } catch (\Throwable) {
            return false;
        }

        return self::$installed = true;
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'uid' => 0,
            'balance_cents' => 0,
            'points' => 0,
            'experience' => 0,
            'level' => 0,
            'checkin_last' => '',
            'checkin_streak' => 0,
            'checkin_total' => 0,
            'status' => self::STATUS_NORMAL,
            'ban_type' => 'none',
            'ban_until' => 0,
            'ban_reason' => '',
            'created' => 0,
            'updated' => 0,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function row(int $uid): array
    {
        if ($uid <= 0 || !self::available()) {
            return self::defaults();
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('*')->from(self::TABLE)->where('uid = ?', $uid)->limit(1)
            );
        } catch (\Throwable) {
            return self::defaults();
        }

        return is_array($row) ? array_replace(self::defaults(), $row) : array_replace(self::defaults(), ['uid' => $uid]);
    }

    /**
     * @return array<string, mixed>
     */
    public static function status(int $uid): array
    {
        $row = self::row($uid);
        if ($uid <= 0 || (string) ($row['status'] ?? self::STATUS_NORMAL) !== self::STATUS_BANNED) {
            return self::statusPayload($row);
        }

        $until = (int) ($row['ban_until'] ?? 0);
        if ((string) ($row['ban_type'] ?? '') === 'temporary' && $until > 0 && $until <= time()) {
            self::unban($uid);
            $row = self::row($uid);
        }

        return self::statusPayload($row);
    }

    public static function isBanned(int $uid): bool
    {
        $status = self::status($uid);

        return $status['banned'] === true;
    }

    /**
     * @return array<string, mixed>
     */
    public static function summary(int $uid): array
    {
        $values = Settings::values();
        $enabled = ($values['Economy_Enabled'] ?? false) === true;
        $row = self::row($uid);
        $level = self::levelFor((int) ($row['experience'] ?? 0), $values);
        $status = self::status($uid);
        $today = date('Y-m-d');
        $streak = (string) ($row['checkin_last'] ?? '') === $today
            ? (int) ($row['checkin_streak'] ?? 0)
            : self::nextStreak($row);

        return [
            'enabled' => $enabled,
            'uid' => $uid,
            'balance' => self::money((int) ($row['balance_cents'] ?? 0)),
            'balanceCents' => (int) ($row['balance_cents'] ?? 0),
            'points' => (int) ($row['points'] ?? 0),
            'experience' => (int) ($row['experience'] ?? 0),
            'level' => $level,
            'status' => $status,
            'labels' => [
                'balance' => self::label('Economy_Balance_Name', '余额'),
                'points' => self::label('Economy_Points_Name', '积分'),
            ],
            'checkin' => [
                'enabled' => $enabled && ($values['Economy_Checkin_Enabled'] ?? false) === true,
                'checkedIn' => (string) ($row['checkin_last'] ?? '') === $today,
                'streak' => $streak,
                'total' => (int) ($row['checkin_total'] ?? 0),
                'rewards' => self::checkinRewards($row),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleSummary(array $data): array
    {
        unset($data);
        $uid = UserProfile::viewerUid();
        if ($uid <= 0) {
            Response::error('请先登录', 401);
        }

        return ['economy' => self::summary($uid)];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleCheckin(array $data): array
    {
        $uid = UserProfile::viewerUid();
        if ($uid <= 0) {
            Response::error('请先登录', 401);
        }
        if (!self::checkinEnabled()) {
            Response::error('签到功能未开启', 403);
        }
        if (!self::available()) {
            Response::error('用户数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        Captcha::require($data, 'checkin');
        WriteThrottle::guard('user-checkin', $uid, 10, 60);

        $result = self::transaction($uid, static function () use ($uid): array {
            $row = self::row($uid);
            $today = date('Y-m-d');
            if (!self::available()) {
                return ['error' => '用户数据表尚未初始化', 'status' => 503];
            }
            if ((string) ($row['checkin_last'] ?? '') === $today) {
                return ['error' => '今天已经签到过了', 'status' => 409];
            }

            $streak = self::nextStreak($row);
            $rewards = self::checkinRewards($row);
            $experience = (int) ($row['experience'] ?? 0) + $rewards['experience'];
            $points = (int) ($row['points'] ?? 0) + $rewards['points'];
            $balance = (int) ($row['balance_cents'] ?? 0) + $rewards['balanceCents'];
            $level = self::levelFor($experience, Settings::values());

            self::upsert($uid, [
                'checkin_last' => $today,
                'checkin_streak' => $streak,
                'checkin_total' => (int) ($row['checkin_total'] ?? 0) + 1,
                'experience' => $experience,
                'points' => $points,
                'balance_cents' => $balance,
                'level' => (int) ($level['level'] ?? 0),
            ]);

            return ['rewards' => $rewards];
        });

        if (isset($result['error'])) {
            Response::error((string) $result['error'], (int) ($result['status'] ?? 400));
        }

        return [
            'rewards' => $result['rewards'],
            'economy' => self::summary($uid),
        ];
    }

    /**
     * Credit or debit balance inside an existing database transaction.
     * Returns the new balance in cents, or null when funds are insufficient.
     */
    public static function changeBalanceInTransaction(int $uid, int $deltaCents): ?int
    {
        $row = self::row($uid);
        $balance = (int) ($row['balance_cents'] ?? 0);
        $next = $balance + $deltaCents;
        if ($next < 0) {
            return null;
        }

        self::upsert($uid, ['balance_cents' => $next]);

        return $next;
    }

    public static function markOrderPaidWithBalance(array $order, int $uid): array
    {
        if (!self::enabled() || !self::available()) {
            Response::error('余额支付暂不可用', 403);
        }
        if (!DownloadPayment::balanceEnabled()) {
            Response::error('余额支付未开启', 403);
        }

        $number = (string) ($order['number'] ?? '');
        $amount = (int) ($order['amount_cents'] ?? 0);
        if ($amount <= 0) {
            Response::error('订单金额无效', 422);
        }

        $paid = DownloadStore::transaction($uid, static function () use ($number, $uid, $amount): array {
            $fresh = DownloadStore::orderByNumber($number);
            if ($fresh === null || (int) ($fresh['user_id'] ?? 0) !== $uid) {
                return ['error' => '订单不存在', 'status' => 404];
            }
            if ((string) ($fresh['status'] ?? '') === 'paid') {
                return ['order' => $fresh];
            }
            if ((string) ($fresh['status'] ?? '') !== 'pending') {
                return ['error' => '订单状态不可支付', 'status' => 409];
            }

            $balance = self::changeBalanceInTransaction($uid, -$amount);
            if ($balance === null) {
                return ['error' => '余额不足，请先充值', 'status' => 402];
            }

            $updated = DownloadStore::markPaid($number, 'BAL' . bin2hex(random_bytes(10)), $amount);
            if ($updated === null) {
                return ['error' => '支付确认失败，请稍后重试', 'status' => 409];
            }

            return ['order' => $updated];
        });

        if (isset($result['error'])) {
            Response::error((string) $result['error'], (int) ($result['status'] ?? 400));
        }

        return is_array($result['order'] ?? null) ? $result['order'] : [];
    }

    public static function handleInstall(array $data): array
    {
        unset($data);

        return ['installed' => self::install()];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleOverview(array $data): array
    {
        unset($data);
        if (!UserProfile::canOperate()) {
            Response::error('没有运营中心权限', 403);
        }

        $users = self::count('table.users', 'uid');
        $admin = UserProfile::viewerIsAdmin();
        $topics = 0;
        try {
            $topics = self::count('table.sunken_forum_topics', 'id');
        } catch (\Throwable) {
            $topics = 0;
        }

        $banned = 0;
        $balance = 0;
        $points = 0;
        $todayCheckin = 0;
        if (self::available()) {
            $db = Db::get();
            $banned = (int) (self::fetchOne(
                $db->select('COUNT(*) AS total')
                    ->from(self::TABLE)
                    ->where('status = ?', self::STATUS_BANNED)
            )['total'] ?? 0);
            if ($admin) {
                $sum = self::fetchOne(
                    $db->select('SUM(balance_cents) AS balance', 'SUM(points) AS points')
                        ->from(self::TABLE)
                );
                $balance = (int) ($sum['balance'] ?? 0);
                $points = (int) ($sum['points'] ?? 0);
            }
            $todayCheckin = (int) (self::fetchOne(
                $db->select('COUNT(*) AS total')
                    ->from(self::TABLE)
                    ->where('checkin_last = ?', date('Y-m-d'))
            )['total'] ?? 0);
        }

        return [
            'overview' => [
                'users' => $users,
                'banned' => $banned,
                'topics' => $topics,
                'balance' => self::money($balance),
                'points' => $points,
                'todayCheckin' => $todayCheckin,
                'economyEnabled' => self::enabled(),
                'financial' => $admin,
            ],
            'labels' => [
                'balance' => self::label('Economy_Balance_Name', '余额'),
                'points' => self::label('Economy_Points_Name', '积分'),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleUsers(array $data): array
    {
        if (!self::available()) {
            Response::error('用户数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $db = Db::get();
        $search = mb_substr(trim((string) ($data['search'] ?? '')), 0, 64, 'UTF-8');
        $page = max(1, (int) ($data['page'] ?? 1));
        $pageSize = 20;
        $offset = ($page - 1) * $pageSize;
        $select = $db->select('uid', 'name', 'screenName', 'mail', 'group', 'created')
            ->from('table.users');
        $countSelect = $db->select('COUNT(*) AS total')->from('table.users');
        if ($search !== '') {
            if (ctype_digit($search)) {
                $select->where('uid = ?', (int) $search);
                $countSelect->where('uid = ?', (int) $search);
            } else {
                $like = '%' . $search . '%';
                $select->where('name LIKE ? OR screenName LIKE ?', $like, $like);
                $countSelect->where('name LIKE ? OR screenName LIKE ?', $like, $like);
            }
        }

        $rows = $db->fetchAll(
            $select->order('uid', Db::SORT_DESC)->offset($offset)->limit($pageSize)
        );
        $total = (int) (self::fetchOne($countSelect)['total'] ?? 0);
        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $uid = (int) ($row['uid'] ?? 0);
            $economy = self::summary($uid);
            $items[] = [
                'uid' => $uid,
                'name' => (string) ($row['name'] ?? ''),
                'screenName' => (string) ($row['screenName'] ?? ''),
                'mail' => (string) ($row['mail'] ?? ''),
                'group' => (string) ($row['group'] ?? ''),
                'created' => (int) ($row['created'] ?? 0),
                'balance' => $economy['balance'],
                'points' => $economy['points'],
                'experience' => $economy['experience'],
                'level' => $economy['level'],
                'status' => $economy['status'],
            ];
        }

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'lastPage' => max(1, (int) ceil($total / $pageSize)),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleUserUpdate(array $data): array
    {
        if (!self::available()) {
            Response::error('用户数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $uid = max(0, (int) ($data['uid'] ?? 0));
        if ($uid <= 0) {
            Response::error('用户不存在', 404);
        }
        self::assertManageable($uid);

        $changes = [];
        if (array_key_exists('balance', $data)) {
            $cents = self::amountCents($data['balance']);
            if ($cents === null || $cents < 0) {
                Response::error('余额格式无效', 422);
            }
            $changes['balance_cents'] = $cents;
        }
        foreach (['points', 'experience'] as $key) {
            if (!array_key_exists($key, $data)) {
                continue;
            }
            $value = $data[$key];
            if (!is_numeric($value) || (int) $value < 0 || (int) $value > 100000000) {
                Response::error('数值格式无效', 422);
            }
            $changes[$key] = (int) $value;
        }

        if ($changes !== []) {
            if (isset($changes['experience'])) {
                $level = self::levelFor((int) $changes['experience'], Settings::values());
                $changes['level'] = (int) ($level['level'] ?? 0);
            }
            self::upsert($uid, $changes);
        }

        return ['economy' => self::summary($uid)];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleUserStatus(array $data): array
    {
        if (!self::available()) {
            Response::error('用户数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $uid = max(0, (int) ($data['uid'] ?? 0));
        if ($uid <= 0) {
            Response::error('用户不存在', 404);
        }
        self::assertManageable($uid);

        $action = (string) ($data['action'] ?? '');
        if ($action === 'unban') {
            self::unban($uid);
        } elseif ($action === 'ban') {
            $type = (string) ($data['type'] ?? 'permanent');
            if (!in_array($type, ['permanent', 'temporary'], true)) {
                Response::error('封禁类型无效', 422);
            }
            $until = 0;
            if ($type === 'temporary') {
                $until = (int) ($data['until'] ?? 0);
                if ($until <= time()) {
                    Response::error('封禁到期时间必须晚于当前时间', 422);
                }
            }
            self::ban($uid, $type, $until, (string) ($data['reason'] ?? ''));
        } else {
            Response::error('操作无效', 422);
        }

        return ['status' => self::status($uid)];
    }

    /**
     * Block banned accounts before the login token is issued.
     *
     * @param mixed $decision
     * @param mixed $user
     * @param array<string, mixed> $body
     * @return array<string, mixed>|null
     */
    public static function loginDecision(mixed $decision, mixed $user, array $body): ?array
    {
        unset($body);
        if ($decision !== null || !is_array($user)) {
            return is_array($decision) ? $decision : null;
        }

        $uid = (int) ($user['uid'] ?? 0);
        if ($uid <= 0 || !self::isBanned($uid)) {
            return null;
        }

        $status = self::status($uid);

        return [
            'message' => $status['message'],
            'status' => 403,
        ];
    }

    /**
     * @param array<string, mixed> $identity
     */
    public static function guardRequest(array $identity, string $tier, string $path, string $method): void
    {
        unset($tier);
        $uid = (int) ($identity['uid'] ?? 0);
        if ($uid <= 0 || !self::available()) {
            return;
        }
        if ($path === 'auth/logout') {
            return;
        }

        // Banned accounts keep read access so the user center can display the
        // ban notice; every write path is rejected.
        if (!in_array(strtoupper($method), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return;
        }

        $status = self::status($uid);
        if ($status['banned'] === true) {
            Response::error($status['message'], 403, ['code' => 'account_banned']);
        }
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function guardAjax(string $action, array $data, string $auth): void
    {
        unset($action, $data);
        if ($auth === 'public') {
            return;
        }
        if (in_array(strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        $uid = UserProfile::viewerUid();
        if ($uid <= 0 || !self::available()) {
            return;
        }

        $status = self::status($uid);
        if ($status['banned'] === true) {
            Response::error($status['message'], 403, ['code' => 'account_banned']);
        }
    }

    public static function settingsRequest(string $method, string $path, string $scope): void
    {
        unset($scope);
        self::$settingsWrite = in_array(strtoupper($method), ['POST', 'PUT', 'PATCH'], true)
            && ($path === 'admin/options' || str_starts_with($path, 'admin/options/'));
    }

    public static function settingsResponse(mixed $payload, int $status, string $scope): array
    {
        unset($scope);
        if (self::$settingsWrite && $status < 400) {
            self::install();
        }
        self::$settingsWrite = false;

        return is_array($payload) ? $payload : [];
    }

    public static function ban(int $uid, string $type, int $until, string $reason): void
    {
        $reason = trim($reason);
        if (mb_strlen($reason, 'UTF-8') > 120) {
            $reason = mb_substr($reason, 0, 120, 'UTF-8');
        }
        self::upsert($uid, [
            'status' => self::STATUS_BANNED,
            'ban_type' => $type,
            'ban_until' => $until,
            'ban_reason' => $reason,
        ]);
    }

    public static function unban(int $uid): void
    {
        self::upsert($uid, [
            'status' => self::STATUS_NORMAL,
            'ban_type' => 'none',
            'ban_until' => 0,
            'ban_reason' => '',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public static function client(): array
    {
        return [
            'enabled' => self::enabled(),
            'checkinEnabled' => self::checkinEnabled(),
            'summary' => Endpoint::url('user-economy'),
            'checkin' => Endpoint::url('user-checkin'),
            'nonce' => Typecho::securityToken(),
            'labels' => [
                'balance' => self::label('Economy_Balance_Name', '余额'),
                'points' => self::label('Economy_Points_Name', '积分'),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function operationsClient(): array
    {
        $canOperate = UserProfile::canOperate();
        $admin = UserProfile::viewerIsAdmin();

        return [
            'enabled' => $canOperate,
            'admin' => $admin,
            'home' => rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/') . '/operations',
            'overview' => Endpoint::url('operations-overview'),
            'users' => Endpoint::url('operations-users'),
            'userUpdate' => Endpoint::url('operations-user-update'),
            'userStatus' => Endpoint::url('operations-user-status'),
            'nonce' => Typecho::securityToken(),
            'labels' => [
                'balance' => self::label('Economy_Balance_Name', '余额'),
                'points' => self::label('Economy_Points_Name', '积分'),
            ],
        ];
    }

    /**
     * Configurable levels, sorted by required experience.
     *
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    public static function levelFor(int $experience, array $values): array
    {
        $levels = [];
        $blocks = $values['Economy_Levels'] ?? [];
        if (is_array($blocks)) {
            foreach ($blocks as $block) {
                if (!is_array($block)) {
                    continue;
                }
                $data = is_array($block['data'] ?? null) ? $block['data'] : [];
                $min = max(0, (int) ($data['min_experience'] ?? 0));
                $title = trim((string) ($data['title'] ?? ''));
                $color = self::color((string) ($data['color'] ?? ''));
                if ($title === '') {
                    continue;
                }
                $levels[] = ['min' => $min, 'title' => $title, 'color' => $color];
            }
        }
        if ($levels === []) {
            $levels = [['min' => 0, 'title' => '新手', 'color' => '#94a3b8']];
        }
        usort($levels, static fn (array $a, array $b): int => $a['min'] <=> $b['min']);

        $current = $levels[0];
        $next = null;
        $index = 1;
        foreach ($levels as $position => $level) {
            if ($experience >= $level['min']) {
                $current = $level;
                $index = $position + 1;
            } elseif ($next === null) {
                $next = $level;
            }
        }

        return [
            'level' => $index,
            'title' => $current['title'],
            'color' => $current['color'],
            'minExperience' => $current['min'],
            'nextTitle' => $next['title'] ?? '',
            'nextExperience' => $next['min'] ?? 0,
            'progress' => $next === null
                ? 100
                : max(0, min(100, (int) round(
                    ($experience - $current['min']) / max(1, $next['min'] - $current['min']) * 100
                ))),
        ];
    }

    /**
     * @param array<string, mixed> $row
     * @return array{experience: int, points: int, balanceCents: int, streak: int}
     */
    private static function checkinRewards(array $row): array
    {
        $values = Settings::values();
        $streak = self::nextStreak($row);
        $max = max(1, min(60, (int) ($values['Economy_Checkin_Streak_Max'] ?? 7)));
        $multiplier = max(0, min($max - 1, $streak - 1));
        $balance = (int) round((float) ($values['Economy_Checkin_Base_Balance'] ?? 0) * 100);
        $bonus = (int) round((float) ($values['Economy_Checkin_Streak_Balance'] ?? 0) * 100);

        return [
            'experience' => max(0, (int) ($values['Economy_Checkin_Base_Experience'] ?? 0))
                + max(0, (int) ($values['Economy_Checkin_Streak_Experience'] ?? 0)) * $multiplier,
            'points' => max(0, (int) ($values['Economy_Checkin_Base_Points'] ?? 0))
                + max(0, (int) ($values['Economy_Checkin_Streak_Points'] ?? 0)) * $multiplier,
            'balanceCents' => max(0, $balance) + max(0, $bonus) * $multiplier,
            'streak' => $streak,
        ];
    }

    /**
     * @param array<string, mixed> $row
     */
    private static function nextStreak(array $row): int
    {
        $last = (string) ($row['checkin_last'] ?? '');
        $streak = max(0, (int) ($row['checkin_streak'] ?? 0));
        if ($last === '') {
            return 1;
        }
        if ($last === date('Y-m-d')) {
            return max(1, $streak);
        }
        if ($last === date('Y-m-d', strtotime('-1 day'))) {
            return $streak + 1;
        }

        return 1;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function statusPayload(array $row): array
    {
        $banned = (string) ($row['status'] ?? self::STATUS_NORMAL) === self::STATUS_BANNED;
        $type = (string) ($row['ban_type'] ?? 'none');
        $until = max(0, (int) ($row['ban_until'] ?? 0));
        $reason = trim((string) ($row['ban_reason'] ?? ''));
        $message = '账号状态正常';
        if ($banned) {
            $message = $type === 'permanent'
                ? '账号已被永久封禁，如有疑问请联系站点管理员。'
                : '账号已被封禁至 ' . date('Y-m-d H:i', $until) . '，到期后自动解除。';
            if ($reason !== '') {
                $message .= ' 原因：' . $reason;
            }
        }

        return [
            'banned' => $banned,
            'status' => $banned ? self::STATUS_BANNED : self::STATUS_NORMAL,
            'type' => $banned ? $type : 'none',
            'until' => $banned ? $until : 0,
            'reason' => $banned ? $reason : '',
            'message' => $message,
        ];
    }

    /**
     * @param array<string, mixed> $changes
     */
    private static function upsert(int $uid, array $changes): void
    {
        if ($uid <= 0 || !self::available()) {
            return;
        }

        $db = Db::get();
        $now = time();
        $changes['updated'] = $now;
        $exists = (int) (self::fetchOne(
            $db->select('COUNT(*) AS total')->from(self::TABLE)->where('uid = ?', $uid)
        )['total'] ?? 0) > 0;

        if ($exists) {
            $db->query(
                $db->update(self::TABLE)->rows($changes)->where('uid = ?', $uid)
            );

            return;
        }

        $defaults = self::defaults();
        $defaults['uid'] = $uid;
        $defaults['created'] = $now;
        $defaults['updated'] = $now;
        try {
            $db->query($db->insert(self::TABLE)->rows(array_replace($defaults, $changes)));
        } catch (\Throwable) {
            $db->query(
                $db->update(self::TABLE)->rows($changes)->where('uid = ?', $uid)
            );
        }
    }

    public static function transaction(int $uid, callable $operation): mixed
    {
        $db = Db::get();
        $driver = DownloadStore::driver();
        $db->query($driver === 'sqlite' ? 'BEGIN IMMEDIATE' : ($driver === 'mysql' ? 'START TRANSACTION' : 'BEGIN'), Db::WRITE, '');

        try {
            $db->query($db->update('table.users')->expression('uid', 'uid')->where('uid = ?', $uid));
            $result = $operation();
            $db->query('COMMIT', Db::WRITE, '');

            return $result;
        } catch (\Throwable $exception) {
            $db->query('ROLLBACK', Db::WRITE, '');
            throw $exception;
        }
    }

    private static function assertManageable(int $uid): void
    {
        if ($uid === UserProfile::viewerUid()) {
            Response::error('不能修改自己的账号状态', 422);
        }

        $db = Db::get();
        $row = $db->fetchRow(
            $db->select('group')->from('table.users')->where('uid = ?', $uid)->limit(1)
        );
        if (!is_array($row)) {
            Response::error('用户不存在', 404);
        }
        if ((string) ($row['group'] ?? '') === 'administrator') {
            Response::error('不能管理管理员账号', 403);
        }
    }

    private static function count(string $table, string $column): int
    {
        try {
            $db = Db::get();

            return (int) (self::fetchOne(
                $db->select('COUNT(' . $column . ') AS total')->from($table)
            )['total'] ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function fetchOne(\Typecho\Db\Query $query): ?array
    {
        $row = Db::get()->fetchRow($query);

        return is_array($row) ? $row : null;
    }

    private static function amountCents(mixed $value): ?int
    {
        if (is_int($value) || is_float($value)) {
            $value = (string) $value;
        }
        if (!is_string($value) || preg_match('/^\d{1,7}(?:\.\d{1,2})?$/D', trim($value)) !== 1) {
            return null;
        }

        $parts = explode('.', trim($value), 2);
        $yuan = (int) $parts[0];
        $cents = isset($parts[1]) ? (int) str_pad($parts[1], 2, '0') : 0;

        return $yuan * 100 + $cents;
    }

    private static function money(int $cents): string
    {
        return number_format(max(0, $cents) / 100, 2, '.', '');
    }

    private static function color(string $value): string
    {
        return preg_match('/^#[0-9a-fA-F]{6}$/D', $value) === 1 ? $value : '#64748b';
    }

    private static function label(string $key, string $fallback): string
    {
        $value = trim((string) (Settings::values()[$key] ?? ''));

        return $value !== '' ? $value : $fallback;
    }
}
