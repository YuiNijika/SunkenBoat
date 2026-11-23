<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Http\Response;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * The front-end login is the only supported entry point. Typecho's physical
 * admin directory is still reachable by URL, so non-administrators must be
 * redirected before the admin shell or login form can render.
 */
final class AdminGuard
{
    public static function enforce(): void
    {
        if (!defined('__TYPECHO_ADMIN_DIR__') || !class_exists('Widget\\User')) {
            return;
        }

        $requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '');
        $path = parse_url($requestUri, PHP_URL_PATH);
        if (!is_string($path)) {
            return;
        }

        $path = self::normalizePath($path);
        $sitePath = self::normalizePath(
            (string) parse_url(Typecho::siteUrl(), PHP_URL_PATH)
        );
        if (
            $sitePath !== '/'
            && (
                strcasecmp($path, $sitePath) === 0
                || str_starts_with(strtolower($path), strtolower($sitePath) . '/')
            )
        ) {
            $path = substr($path, strlen($sitePath));
        }

        $admin = self::normalizePath((string) constant('__TYPECHO_ADMIN_DIR__'));
        if (
            strcasecmp($path, $admin) !== 0
            && !str_starts_with(strtolower($path), strtolower($admin) . '/')
        ) {
            return;
        }

        try {
            $user = \Widget\User::alloc();
            $allowed = $user->hasLogin() && $user->pass('administrator', true);
        } catch (\Throwable) {
            $allowed = false;
        }

        if ($allowed) {
            return;
        }

        Response::redirect(Typecho::siteUrl() ?: '/', 302);
    }

    private static function normalizePath(string $path): string
    {
        $segments = [];
        foreach (explode('/', rawurldecode($path)) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }

            if ($segment === '..') {
                array_pop($segments);
                continue;
            }

            $segments[] = $segment;
        }

        return '/' . implode('/', $segments);
    }
}
