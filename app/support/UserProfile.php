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

    public const OPTION_NAME = '_ttdf_user_profile';

    private const TEXT_FIELDS = [
        'signature' => 120,
        'location' => 64,
    ];

    private const GENDERS = ['secret', 'male', 'female', 'other'];

    private const PRIVACY = ['public', 'members', 'private'];

    public static function register(): void
    {
        Endpoint::register('user-profile', [self::class, 'handle'], [
            'auth' => 'user',
            'method' => 'ANY',
        ]);
    }

    public static function enabled(): bool
    {
        return (Settings::values()['User_Center_Enhanced'] ?? true) === true;
    }

    /**
     * @return array<string, string>
     */
    public static function defaults(): array
    {
        return [
            'avatar' => '',
            'signature' => '',
            'gender' => 'secret',
            'privacy' => 'public',
            'location' => '',
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

            self::save($uid, $data);
        }

        return [
            'enhanced' => self::enabled(),
            'user' => self::viewer($uid),
        ];
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
        unset($extra['avatar']);

        $profile = array_merge([
            'uid' => (int) ($row['uid'] ?? 0),
            'name' => (string) ($row['name'] ?? ''),
            'screenName' => (string) ($row['screenName'] ?? ''),
            'mail' => $mail,
            'url' => (string) ($row['url'] ?? ''),
            'group' => (string) ($row['group'] ?? ''),
            'created' => $created > 0 ? date('c', $created) : '',
            'avatar' => $customAvatar !== '' ? $customAvatar : Avatar::url($mail),
            'customAvatar' => $customAvatar,
            'posts' => self::countPosts($uid),
            'comments' => self::countComments($uid),
            'canWrite' => self::canWriteGroup((string) ($row['group'] ?? '')),
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
        $created = is_numeric($row['created'] ?? null) ? (int) $row['created'] : 0;

        $profile = [
            'uid' => (int) ($row['uid'] ?? 0),
            'name' => (string) ($row['name'] ?? ''),
            'screenName' => (string) ($row['screenName'] ?? ''),
            'avatar' => $customAvatar !== '' ? $customAvatar : Avatar::url((string) ($row['mail'] ?? '')),
            'customAvatar' => $customAvatar,
            'url' => (string) ($row['url'] ?? ''),
            'group' => (string) ($row['group'] ?? ''),
            'created' => $created > 0 ? date('c', $created) : '',
            'posts' => self::countPosts($uid),
            'comments' => self::countComments($uid),
            'canWrite' => self::canWriteGroup((string) ($row['group'] ?? '')),
            'isSelf' => $self,
            'privacy' => $privacy,
            'detailsVisible' => $detailsVisible,
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
        }

        $gender = (string) ($input['gender'] ?? $current['gender']);
        $next['gender'] = in_array($gender, self::GENDERS, true) ? $gender : $current['gender'];

        $privacy = (string) ($input['privacy'] ?? $current['privacy']);
        $next['privacy'] = in_array($privacy, self::PRIVACY, true) ? $privacy : $current['privacy'];

        self::write($uid, $next);
    }

    /**
     * @return array<string, string>
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
        $decoded = is_string($raw) ? json_decode($raw, true) : null;

        return self::normalize(is_array($decoded) ? $decoded : []);
    }

    /**
     * @param array<string, string> $values
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
     * @return array<string, string>
     */
    private static function normalize(array $values): array
    {
        $defaults = self::defaults();
        $result = [];

        foreach (self::TEXT_FIELDS as $key => $limit) {
            $result[$key] = self::text($values[$key] ?? $defaults[$key], $limit);
        }

        $result['avatar'] = Avatar::normalizeUrl($values['avatar'] ?? $defaults['avatar']);

        $gender = (string) ($values['gender'] ?? $defaults['gender']);
        $privacy = (string) ($values['privacy'] ?? $defaults['privacy']);
        $result['gender'] = in_array($gender, self::GENDERS, true) ? $gender : $defaults['gender'];
        $result['privacy'] = in_array($privacy, self::PRIVACY, true) ? $privacy : $defaults['privacy'];

        return $result;
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
