<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Applies the article comment login policy to both REST v2 writes and
 * Typecho's native comment endpoint. Forum replies use their own endpoint and
 * are always authenticated there.
 */
final class CommentPolicy
{
    public static function register(): void
    {
        Hooks::addFilter('rest.v2.comment.can_create', [self::class, 'canCreate'], 5);
        self::registerNativeGuard();
    }

    /**
     * @param array<string, mixed> $content
     * @param array<string, mixed> $input
     * @param array<string, mixed>|null $identity
     */
    public static function canCreate(
        mixed $allowed,
        array $content,
        array $input,
        mixed $identity
    ): mixed {
        unset($input);

        if ($allowed !== true || !self::required()) {
            return $allowed;
        }

        if (!in_array((string) ($content['type'] ?? ''), ['post', 'page'], true)) {
            return true;
        }

        if (is_array($identity) && (int) ($identity['uid'] ?? 0) > 0) {
            return true;
        }

        Response::error('请先登录后再发表评论', 401, [
            'code' => 'comment_login_required',
        ]);
    }

    private static function registerNativeGuard(): void
    {
        if (!class_exists('Typecho\\Plugin')) {
            return;
        }

        try {
            $feedback = \Typecho\Plugin::factory('Widget\\Feedback');
            $feedback->comment = static function (array $comment): array {
                if (self::required() && !Typecho::isLoggedIn()) {
                    throw new \Typecho\Exception('请先登录后再发表评论', 403);
                }

                return $comment;
            };
        } catch (\Throwable) {
            // The REST guard still covers the React comment form if the
            // installed Typecho version does not expose this plugin hook.
        }
    }

    private static function required(): bool
    {
        try {
            return (Settings::values()['Comments_Require_Login'] ?? false) === true;
        } catch (\Throwable) {
            return false;
        }
    }
}
