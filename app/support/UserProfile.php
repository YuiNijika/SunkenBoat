<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Http\Response;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Extra profile fields for the enhanced user center.
 *
 * Typecho's users table is intentionally left untouched. The fields use the
 * same user-scoped options row pattern as personal plugin settings, so a
 * theme switch does not alter the site schema.
 * Social accounts are OAuth bindings handled by OAuth.php, not free-form
 * profile text.
 */
final class UserProfile
{
    private const GROUP_RANK = [
        'visitor' => 0,
        'subscriber' => 1,
        'contributor' => 2,
        'editor' => 3,
        'administrator' => 4,
    ];

    public const OPTION_NAME = 'sunken_user_profile';

    public const LEGACY_OPTION_NAME = '_ttdf_user_profile';

    private const TEXT_FIELDS = [
        'signature' => 120,
        'location' => 64,
    ];

    private const GENDERS = ['secret', 'male', 'female', 'other'];

    private const PRIVACY = ['public', 'members', 'private'];

    private const CERTIFICATION_TYPES = ['personal', 'organization'];

    private const CERTIFICATION_STATUS = ['none', 'pending', 'approved', 'rejected'];

    /** @var array<int, string> */
    private static array $customAvatarCache = [];

    public static function register(): void
    {
        Endpoint::register('user-profile', [self::class, 'handle'], [
            'auth' => 'user',
            'method' => 'ANY',
        ]);
        Endpoint::register('user-certification', [self::class, 'handleCertification'], [
            'auth' => 'user',
            'method' => 'ANY',
        ]);
    }

    public static function enabled(): bool
    {
        $values = Settings::values();

        return ($values['Show_UserCenter'] ?? false) === true
            && ($values['User_Center_Enhanced'] ?? false) === true;
    }

    /**
     * Return the custom avatar URL for one user without exposing the rest of
     * their private profile options.
     */
    public static function customAvatar(int $uid): string
    {
        if ($uid <= 0 || !self::enabled()) {
            return '';
        }

        if (array_key_exists($uid, self::$customAvatarCache)) {
            return self::$customAvatarCache[$uid];
        }

        try {
            $extra = self::read($uid);
            $avatar = Avatar::normalizeUrl($extra['avatar'] ?? '');
        } catch (\Throwable) {
            $avatar = '';
        }

        return self::$customAvatarCache[$uid] = $avatar;
    }

    public static function certificationEnabled(): bool
    {
        return self::enabled() && (Settings::values()['User_Certification'] ?? false) === true;
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            'avatar' => '',
            'background' => '',
            'signature' => '',
            'gender' => 'secret',
            'privacy' => 'public',
            'location' => '',
            'certificationType' => '',
            'certificationName' => '',
            'certificationNote' => '',
            'certificationStatus' => 'none',
            'certificationSubmitted' => 0,
            'certificationReviewed' => 0,
            'certificationReviewer' => 0,
            'certificationReason' => '',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handle(array $data): array
    {
        $uid = self::currentUid();
        if ($uid <= 0) {
            Response::error('Authentication required', 401);
        }

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method !== 'GET') {
            if (!self::enabled()) {
                Response::error('Enhanced user center is disabled', 403);
            }

            WriteThrottle::guard('user-profile-update', $uid, 30, 60);
            self::save($uid, $data);
        }

        return [
            'enhanced' => self::enabled(),
            'user' => self::viewer($uid),
        ];
    }

    /**
     * User-facing certification submission plus administrator review actions.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleCertification(array $data): array
    {
        $uid = self::currentUid();
        if ($uid <= 0) {
            Response::error('Authentication required', 401);
        }

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        $admin = self::viewerIsAdmin();
        $certification = self::certification(self::read($uid));

        if ($method === 'GET') {
            if ($admin && self::intValue($data['pending'] ?? 0) === 1) {
                return [
                    'enabled' => self::certificationEnabled(),
                    'certification' => $certification,
                    'items' => self::pendingCertifications(),
                ];
            }

            return [
                'enabled' => self::certificationEnabled(),
                'certification' => $certification,
            ];
        }

        $action = trim((string) ($data['op'] ?? 'submit'));
        if ($action === 'submit') {
            if (!self::certificationEnabled()) {
                Response::error('认证功能尚未开启', 403);
            }
            if ($certification['status'] === 'pending') {
                Response::error('认证申请正在审核中，请耐心等待', 409);
            }

            $type = trim((string) ($data['type'] ?? ''));
            if (!in_array($type, self::CERTIFICATION_TYPES, true)) {
                Response::error('请选择认证类型', 422, ['type' => '认证类型无效']);
            }
            $name = self::text($data['name'] ?? '', 64);
            if (self::length($name) < 2) {
                Response::error('认证名称至少需要 2 个字符', 422, [
                    'name' => '请填写真实姓名或组织名称',
                ]);
            }
            $note = self::text($data['note'] ?? '', 500);
            if ($note === '') {
                Response::error('请填写认证说明', 422, ['note' => '请补充认证依据']);
            }

            $next = self::read($uid);
            $next['certificationType'] = $type;
            $next['certificationName'] = $name;
            $next['certificationNote'] = $note;
            $next['certificationStatus'] = 'pending';
            $next['certificationSubmitted'] = time();
            $next['certificationReviewed'] = 0;
            $next['certificationReviewer'] = 0;
            $next['certificationReason'] = '';
            self::write($uid, $next);

            return [
                'message' => '认证申请已提交，请等待管理员审核',
                'certification' => self::certification($next),
            ];
        }

        if (!$admin) {
            Response::error('只有管理员可以审核认证', 403);
        }

        $targetUid = self::intValue($data['uid'] ?? 0);
        if ($targetUid <= 0) {
            Response::error('请选择要审核的用户', 422, ['uid' => '用户 UID 无效']);
        }

        $next = self::read($targetUid);
        if ($action === 'approve') {
            $next['certificationStatus'] = 'approved';
        } elseif ($action === 'reject') {
            $next['certificationStatus'] = 'rejected';
        } elseif ($action === 'revoke') {
            $next['certificationStatus'] = 'none';
        } else {
            Response::error('未知的认证操作', 422);
        }

        $next['certificationReason'] = self::text($data['reason'] ?? '', 200);
        $next['certificationReviewed'] = time();
        $next['certificationReviewer'] = $uid;
        self::write($targetUid, $next);

        return [
            'message' => match ($action) {
                'approve' => '认证已通过',
                'reject' => '认证已驳回',
                default => '认证已撤销',
            },
            'uid' => $targetUid,
            'certification' => self::certification($next),
        ];
    }

    /**
     * @param array<string, mixed> $values
     * @return array{status: string, type: string, name: string, note: string, reason: string, submitted: int, reviewed: int}
     */
    private static function certification(array $values): array
    {
        $status = (string) ($values['certificationStatus'] ?? 'none');
        $type = (string) ($values['certificationType'] ?? '');

        return [
            'status' => in_array($status, self::CERTIFICATION_STATUS, true) ? $status : 'none',
            'type' => in_array($type, self::CERTIFICATION_TYPES, true) ? $type : '',
            'name' => self::text($values['certificationName'] ?? '', 64),
            'note' => self::text($values['certificationNote'] ?? '', 500),
            'reason' => self::text($values['certificationReason'] ?? '', 200),
            'submitted' => self::timestamp($values['certificationSubmitted'] ?? 0),
            'reviewed' => self::timestamp($values['certificationReviewed'] ?? 0),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function pendingCertifications(): array
    {
        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('user', 'value')
                    ->from('table.options')
                    ->where('name = ?', self::OPTION_NAME)
                    ->limit(200)
            );
        } catch (\Throwable) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            $targetUid = (int) ($row['user'] ?? 0);
            $raw = (string) ($row['value'] ?? '');
            $decoded = json_decode($raw, true);
            if ($targetUid <= 0 || !is_array($decoded)) {
                continue;
            }

            $certification = self::certification($decoded);
            if ($certification['status'] !== 'pending') {
                continue;
            }

            try {
                $user = $db->fetchRow(
                    $db->select('uid', 'name', 'screenName', 'mail')
                        ->from('table.users')
                        ->where('uid = ?', $targetUid)
                        ->limit(1)
                );
            } catch (\Throwable) {
                $user = null;
            }

            $mail = is_array($user) ? (string) ($user['mail'] ?? '') : '';
            $customAvatar = self::enabled() ? (string) ($decoded['avatar'] ?? '') : '';
            $items[] = [
                'uid' => $targetUid,
                'name' => is_array($user) ? (string) ($user['name'] ?? '') : '',
                'screenName' => is_array($user) ? (string) ($user['screenName'] ?? '') : '',
                'avatar' => Avatar::forUser($targetUid, $mail, 160, $customAvatar),
                'certification' => $certification,
            ];
        }

        return $items;
    }

    /**
     * @return array<string, mixed>
     */
    public static function viewer(int $uid): array
    {
        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('uid', 'name', 'screenName', 'mail', 'url', 'group', 'created')
                ->from('table.users')
                ->where('uid = ?', $uid)
                ->limit(1)
        );
        $row = $rows[0] ?? null;
        if (!is_array($row)) {
            Response::error('User not found', 404);
        }

        $mail = (string) ($row['mail'] ?? '');
        $created = is_numeric($row['created'] ?? null) ? (int) $row['created'] : 0;
        $extra = self::read($uid);
        $customAvatar = self::enabled() ? ($extra['avatar'] ?? '') : '';
        $customBackground = self::enabled() ? ($extra['background'] ?? '') : '';
        unset($extra['avatar']);
        unset($extra['background']);

        $profile = array_merge([
            'uid' => (int) ($row['uid'] ?? 0),
            'name' => (string) ($row['name'] ?? ''),
            'screenName' => (string) ($row['screenName'] ?? ''),
            'mail' => $mail,
            'url' => self::website($row['url'] ?? ''),
            'group' => (string) ($row['group'] ?? ''),
            'created' => $created > 0 ? date('c', $created) : '',
            'avatar' => Avatar::forUser($uid, $mail, 160, $customAvatar),
            'customAvatar' => $customAvatar,
            'background' => $customBackground,
            'posts' => self::countPosts($uid),
            'comments' => self::countComments($uid),
            'canWrite' => self::canWriteGroup((string) ($row['group'] ?? '')),
            'certificationEnabled' => self::certificationEnabled(),
            'certification' => self::certification($extra),
        ], $extra);

        $circles = Forum::userCircleCounts($uid);
        if ($circles['enabled']) {
            $profile['circles'] = $circles['joined'] + $circles['created'];
            $profile['joinedCircles'] = $circles['joined'];
            $profile['createdCircles'] = $circles['created'];
        }

        return $profile;
    }

    public static function viewerUid(): int
    {
        return self::currentUid();
    }

    public static function viewerIsAdmin(): bool
    {
        try {
            return \Widget\User::alloc()->pass('administrator', true);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Public user-space payload. Email is never exposed; extra profile fields
     * follow the saved privacy mode and the current viewer.
     *
     * @return array<string, mixed>|null
     */
    public static function spaceProfile(int $uid, int $viewerUid, bool $admin): ?array
    {
        if ($uid <= 0) {
            return null;
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('uid', 'name', 'screenName', 'mail', 'url', 'group', 'created')
                    ->from('table.users')
                    ->where('uid = ?', $uid)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        $row = $rows[0] ?? null;
        if (!is_array($row)) {
            return null;
        }

        $enabled = self::enabled();
        $extra = $enabled ? self::read($uid) : self::defaults();
        $privacy = (string) ($extra['privacy'] ?? 'public');
        $self = $viewerUid === $uid;
        $detailsVisible = $enabled && (
            $privacy === 'public'
            || ($privacy === 'members' && $viewerUid > 0)
            || ($privacy === 'private' && ($self || $admin))
        );
        $customAvatar = $enabled ? (string) ($extra['avatar'] ?? '') : '';
        $customBackground = $enabled ? (string) ($extra['background'] ?? '') : '';
        $created = is_numeric($row['created'] ?? null) ? (int) $row['created'] : 0;
        $certification = self::certification($extra);
        $publicCertification = $certification['status'] === 'approved'
            || $self
            || $admin
                ? $certification
                : null;

        $profile = [
            'uid' => (int) ($row['uid'] ?? 0),
            'name' => (string) ($row['name'] ?? ''),
            'screenName' => (string) ($row['screenName'] ?? ''),
            'avatar' => Avatar::forUser(
                $uid,
                (string) ($row['mail'] ?? ''),
                160,
                $customAvatar
            ),
            'customAvatar' => $customAvatar,
            'background' => $customBackground,
            'url' => self::website($row['url'] ?? ''),
            'group' => (string) ($row['group'] ?? ''),
            'created' => $created > 0 ? date('c', $created) : '',
            'posts' => self::countPosts($uid),
            'comments' => self::countComments($uid),
            'canWrite' => self::canWriteGroup((string) ($row['group'] ?? '')),
            'isSelf' => $self,
            'privacy' => $privacy,
            'detailsVisible' => $detailsVisible,
            'certificationEnabled' => self::certificationEnabled(),
            'certification' => $publicCertification,
            'signature' => $detailsVisible ? (string) ($extra['signature'] ?? '') : '',
            'gender' => $detailsVisible ? (string) ($extra['gender'] ?? 'secret') : '',
            'location' => $detailsVisible ? (string) ($extra['location'] ?? '') : '',
        ];

        $circles = Forum::userCircleCounts($uid);
        if ($circles['enabled']) {
            $profile['circles'] = $circles['joined'] + $circles['created'];
            $profile['joinedCircles'] = $circles['joined'];
            $profile['createdCircles'] = $circles['created'];
        }

        return $profile;
    }

    /**
     * Whether the current visitor may write content through REST v2.
     */
    public static function canWrite(): bool
    {
        return self::canWriteGroup(self::currentGroup());
    }

    /**
     * Editors and administrators can enter the operations center. User
     * management endpoints still require the administrator tier.
     */
    public static function canOperate(): bool
    {
        return in_array(self::currentGroup(), ['editor', 'administrator'], true);
    }

    public static function canWriteGroup(string $group): bool
    {
        $minimum = (string) (Settings::values()['User_Article_Group'] ?? 'editor');
        if (!isset(self::GROUP_RANK[$minimum])) {
            $minimum = 'editor';
        }

        return (self::GROUP_RANK[$group] ?? 0) >= self::GROUP_RANK[$minimum];
    }

    /**
     * @param array<string, mixed> $input
     */
    public static function save(int $uid, array $input): void
    {
        if ($uid <= 0) {
            return;
        }

        $current = self::read($uid);
        $next = $current;

        $next['signature'] = self::text($input['signature'] ?? $current['signature'], 120);
        $next['location'] = self::text($input['location'] ?? $current['location'], 64);

        if (array_key_exists('avatar', $input)) {
            $rawAvatar = is_string($input['avatar']) ? trim($input['avatar']) : '';
            $avatar = Avatar::normalizeUrl($rawAvatar);
            if ($rawAvatar !== '' && $avatar === '') {
                Response::error('Invalid avatar URL', 422, [
                    'avatar' => '头像地址必须是完整的 http(s) 图片链接',
                ]);
            }
            $next['avatar'] = $avatar;
            self::$customAvatarCache[$uid] = $avatar;
        }

        if (array_key_exists('background', $input)) {
            $rawBackground = is_string($input['background']) ? trim($input['background']) : '';
            $background = Avatar::normalizeUrl($rawBackground);
            if ($rawBackground !== '' && $background === '') {
                Response::error('Invalid background URL', 422, [
                    'background' => '背景图地址必须是完整的 http(s) 图片链接',
                ]);
            }
            $next['background'] = $background;
        }

        $gender = (string) ($input['gender'] ?? $current['gender']);
        $next['gender'] = in_array($gender, self::GENDERS, true) ? $gender : $current['gender'];

        $privacy = (string) ($input['privacy'] ?? $current['privacy']);
        $next['privacy'] = in_array($privacy, self::PRIVACY, true) ? $privacy : $current['privacy'];

        self::write($uid, $next);
    }

    /**
     * @return array<string, mixed>
     */
    private static function read(int $uid): array
    {
        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('value')
                ->from('table.options')
                ->where('name = ?', self::OPTION_NAME)
                ->where('user = ?', $uid)
                ->limit(1)
        );

        $raw = $rows[0]['value'] ?? '';

        if (!is_string($raw) || trim($raw) === '') {
            $legacy = $db->fetchAll(
                $db->select('value')
                    ->from('table.options')
                    ->where('name = ?', self::LEGACY_OPTION_NAME)
                    ->where('user = ?', $uid)
                    ->limit(1)
            );
            $raw = $legacy[0]['value'] ?? '';
        }

        $decoded = is_string($raw) ? json_decode($raw, true) : null;

        return self::normalize(is_array($decoded) ? $decoded : []);
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function write(int $uid, array $values): void
    {
        $db = Db::get();
        $encoded = json_encode(self::normalize($values), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($encoded)) {
            Response::error('Unable to save profile', 500);
        }

        $exists = $db->fetchObject(
            $db->select('COUNT(*) AS num')
                ->from('table.options')
                ->where('name = ?', self::OPTION_NAME)
                ->where('user = ?', $uid)
        );

        if ((int) ($exists->num ?? 0) > 0) {
            $db->query(
                $db->update('table.options')
                    ->rows(['value' => $encoded])
                    ->where('name = ?', self::OPTION_NAME)
                    ->where('user = ?', $uid)
            );
            return;
        }

        $db->query($db->insert('table.options')->rows([
            'name' => self::OPTION_NAME,
            'value' => $encoded,
            'user' => $uid,
        ]));
    }

    /**
     * @param array<string, mixed> $values
     * @return array<string, mixed>
     */
    private static function normalize(array $values): array
    {
        $defaults = self::defaults();
        $result = [];

        foreach (self::TEXT_FIELDS as $key => $limit) {
            $result[$key] = self::text($values[$key] ?? $defaults[$key], $limit);
        }

        $result['avatar'] = Avatar::normalizeUrl($values['avatar'] ?? $defaults['avatar']);
        $result['background'] = Avatar::normalizeUrl(
            $values['background'] ?? $defaults['background']
        );

        $gender = (string) ($values['gender'] ?? $defaults['gender']);
        $privacy = (string) ($values['privacy'] ?? $defaults['privacy']);
        $result['gender'] = in_array($gender, self::GENDERS, true) ? $gender : $defaults['gender'];
        $result['privacy'] = in_array($privacy, self::PRIVACY, true) ? $privacy : $defaults['privacy'];

        $type = (string) ($values['certificationType'] ?? $defaults['certificationType']);
        $status = (string) ($values['certificationStatus'] ?? $defaults['certificationStatus']);
        $result['certificationType'] = in_array($type, self::CERTIFICATION_TYPES, true)
            ? $type
            : '';
        $result['certificationName'] = self::text(
            $values['certificationName'] ?? $defaults['certificationName'],
            64
        );
        $result['certificationNote'] = self::text(
            $values['certificationNote'] ?? $defaults['certificationNote'],
            500
        );
        $result['certificationStatus'] = in_array($status, self::CERTIFICATION_STATUS, true)
            ? $status
            : 'none';
        $result['certificationSubmitted'] = self::timestamp(
            $values['certificationSubmitted'] ?? $defaults['certificationSubmitted']
        );
        $result['certificationReviewed'] = self::timestamp(
            $values['certificationReviewed'] ?? $defaults['certificationReviewed']
        );
        $result['certificationReviewer'] = self::timestamp(
            $values['certificationReviewer'] ?? $defaults['certificationReviewer']
        );
        $result['certificationReason'] = self::text(
            $values['certificationReason'] ?? $defaults['certificationReason'],
            200
        );

        return $result;
    }

    private static function timestamp(mixed $value): int
    {
        return is_numeric($value) ? max(0, (int) $value) : 0;
    }

    private static function text(mixed $value, int $limit): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim(strip_tags($value));
        $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
        if ($length <= $limit) {
            return $value;
        }

        return function_exists('mb_substr')
            ? mb_substr($value, 0, $limit, 'UTF-8')
            : substr($value, 0, $limit);
    }

    private static function website(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $url = trim($value);
        if (
            $url === ''
            || strlen($url) > 512
            || str_starts_with($url, '//')
            || preg_match('/[\x00-\x20\x7f"\'<>`\\\\]/', $url) === 1
            || filter_var($url, FILTER_VALIDATE_URL) === false
        ) {
            return '';
        }

        $parts = parse_url($url);
        if (!is_array($parts)) {
            return '';
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        if (
            !in_array($scheme, ['http', 'https'], true)
            || (string) ($parts['host'] ?? '') === ''
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
        ) {
            return '';
        }

        return $url;
    }

    private static function length(string $value): int
    {
        return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    }

    private static function intValue(mixed $value): int
    {
        return is_numeric($value) ? (int) $value : 0;
    }

    private static function currentUid(): int
    {
        if (!class_exists('Widget\\User')) {
            return 0;
        }

        try {
            return (int) \Widget\User::alloc()->uid;
        } catch (\Throwable) {
            return 0;
        }
    }

    private static function currentGroup(): string
    {
        $uid = self::currentUid();
        if ($uid <= 0) {
            return '';
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('group')
                    ->from('table.users')
                    ->where('uid = ?', $uid)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return '';
        }

        return (string) ($rows[0]['group'] ?? '');
    }

    private static function countPosts(int $uid): int
    {
        try {
            $db = Db::get();
            $row = $db->fetchObject(
                $db->select('COUNT(*) AS num')
                    ->from('table.contents')
                    ->where('authorId = ?', $uid)
                    ->where('type = ?', 'post')
                    ->where('status = ?', 'publish')
            );
        } catch (\Throwable) {
            return 0;
        }

        return (int) ($row->num ?? 0);
    }

    private static function countComments(int $uid): int
    {
        try {
            $db = Db::get();
            $row = $db->fetchObject(
                $db->select('COUNT(*) AS num')
                    ->from('table.comments')
                    ->where('authorId = ?', $uid)
                    ->where('status = ?', 'approved')
            );
        } catch (\Throwable) {
            return 0;
        }

        return (int) ($row->num ?? 0);
    }
}
