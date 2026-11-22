<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Http\Request;
use TTDF\Http\Response;
use TTDF\Http\Rest\MediaController;
use TTDF\Http\Rest\V2\Auth;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Theme-level media limits and the enhanced-profile avatar upload path.
 *
 * The v2 media routes are writer-only. Avatar and background uploads are
 * personal profile assets, so this hook opens the owner-scoped media
 * controller to any signed-in user while keeping article/topic uploads on the
 * framework's normal writer permission path.
 */
final class UploadLimits
{
    private const PURPOSES = ['article', 'topic', 'avatar', 'background'];

    private const LABELS = [
        'article' => '文章图片',
        'topic' => '帖子图片',
        'avatar' => '头像图片',
        'background' => '背景图片',
    ];

    private const DEFAULT_MB = 5;

    public static function register(): void
    {
        Hooks::addAction('rest.v2.request', [self::class, 'guard']);
    }

    public static function guard(string $method, string $path, string $scope): void
    {
        if ($scope === 'v2.admin' && $method === 'POST' && $path === 'admin/media') {
            self::enforce(self::purpose());
            return;
        }

        if ($scope !== 'v2.public') {
            return;
        }

        $purpose = self::purpose();
        $personal = in_array($purpose, ['avatar', 'background'], true);

        if ($path === 'media') {
            if ($method === 'POST') {
                self::enforce($purpose);
                if ($personal) {
                    $uid = self::personalUid();
                    Auth::assertTrustedOrigin($method);
                    (new MediaController(null, $uid))->upload();
                }
            }

            if ($method === 'GET' && $personal) {
                (new MediaController(null, self::personalUid()))->index();
            }

            return;
        }

        if (
            $method === 'DELETE'
            && $personal
            && preg_match('#^media/([1-9][0-9]*)$#', $path, $matches) === 1
        ) {
            $uid = self::personalUid();
            Auth::assertTrustedOrigin($method);
            (new MediaController(null, $uid))->delete((int) $matches[1]);
        }
    }

    public static function limitMb(string $purpose): int
    {
        $purpose = in_array($purpose, self::PURPOSES, true) ? $purpose : 'article';
        $key = 'Upload_' . ucfirst($purpose) . '_Max_MB';
        $value = (int) (Settings::values()[$key] ?? self::DEFAULT_MB);

        return max(1, min(5, $value));
    }

    private static function enforce(string $purpose): void
    {
        $limit = self::limitMb($purpose);
        $max = $limit * 1024 * 1024;
        $file = Request::file('file');

        if (is_array($file)) {
            $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
            if (in_array($error, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                self::tooLarge($purpose, $limit);
            }

            if ($error === UPLOAD_ERR_OK) {
                $size = (int) ($file['size'] ?? 0);
                $tmp = (string) ($file['tmp_name'] ?? '');
                if ($size <= 0 && $tmp !== '' && is_file($tmp)) {
                    $size = (int) filesize($tmp);
                }

                if ($size > $max) {
                    self::tooLarge($purpose, $limit);
                }
            }

            return;
        }

        $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($declared > $max + 262144) {
            self::tooLarge($purpose, $limit);
        }
    }

    private static function tooLarge(string $purpose, int $limit): never
    {
        $label = self::LABELS[$purpose] ?? '图片';
        Response::error('图片不能超过 ' . $limit . ' MB（' . $label . '）', 413);
    }

    private static function personalUid(): int
    {
        $identity = Auth::identity();
        if ($identity === null) {
            Response::error('Authentication required', 401);
        }

        if (!UserProfile::enabled()) {
            Response::error('Enhanced user center is disabled', 403);
        }

        $uid = (int) ($identity['uid'] ?? 0);
        if ($uid <= 0) {
            Response::error('Authentication required', 401);
        }

        return $uid;
    }

    private static function purpose(): string
    {
        $value = strtolower(trim(Request::header('X-Upload-Purpose')));

        return in_array($value, self::PURPOSES, true) ? $value : 'article';
    }
}
