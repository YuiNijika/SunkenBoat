<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Resolves the site-wide avatar service and validates user avatar URLs.
 */
final class Avatar
{
    private const MIRRORS = [
        'gravatar' => 'https://www.gravatar.com/avatar/',
        'weavatar' => 'https://weavatar.com/avatar/',
        'cravatar' => 'https://cn.cravatar.com/avatar/',
        'loli' => 'https://gravatar.loli.net/avatar/',
        'sep' => 'https://cdn.sep.cc/avatar/',
        'geekzu' => 'https://sdn.geekzu.org/avatar/',
        'v2ex' => 'https://cdn.v2ex.com/gravatar/',
    ];

    private static ?string $prefix = null;

    public static function register(): void
    {
        Hooks::addFilter('rest.v2.response', [self::class, 'filterRestResponse']);

        if (defined('__TYPECHO_GRAVATAR_PREFIX__')) {
            return;
        }

        $prefix = self::prefix();
        if ($prefix !== '') {
            define('__TYPECHO_GRAVATAR_PREFIX__', $prefix);
        }
    }

    public static function prefix(): string
    {
        if (self::$prefix !== null) {
            return self::$prefix;
        }

        $values = Settings::values();
        $source = strtolower(trim((string) ($values['Avatar_Source'] ?? 'gravatar')));
        $prefix = self::MIRRORS[$source] ?? self::MIRRORS['gravatar'];

        if ($source === 'custom') {
            $custom = self::normalizeBase($values['Avatar_Custom_Base'] ?? '');
            if ($custom !== '') {
                $prefix = $custom;
            }
        }

        self::$prefix = $prefix;

        return $prefix;
    }

    public static function url(string $mail, int $size = 160): string
    {
        $mail = strtolower(trim($mail));
        if ($mail === '') {
            return '';
        }

        $size = max(1, min(512, $size));

        return self::prefix() . md5($mail) . '?s=' . $size . '&d=mm&r=X';
    }

    /**
     * Validate an avatar image URL. Empty input clears the custom avatar.
     */
    public static function normalizeUrl(mixed $value, int $limit = 512): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        if ($value === '' || strlen($value) > $limit) {
            return '';
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
            || isset($parts['fragment'])
        ) {
            return '';
        }

        return $value;
    }

    /**
     * REST v2's built-in user profile builds Gravatar URLs directly. Rewrite
     * those values so login and session responses follow the same avatar
     * source as the theme-rendered pages.
     *
     * @param mixed $payload
     * @return array<string, mixed>
     */
    public static function filterRestResponse(mixed $payload, int $status, string $scope): array
    {
        unset($status, $scope);

        return is_array($payload) ? self::rewriteGravatarUrls($payload) : [];
    }

    /**
     * Validate and normalize an avatar service base URL.
     */
    private static function normalizeBase(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        if ($value === '' || strlen($value) > 255) {
            return '';
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
        $host = (string) ($parts['host'] ?? '');
        if (
            !in_array($scheme, ['http', 'https'], true)
            || $host === ''
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
        ) {
            return '';
        }

        $port = isset($parts['port']) ? ':' . (int) $parts['port'] : '';
        $path = (string) ($parts['path'] ?? '');
        if ($path === '' || $path === '/') {
            $path = '/avatar/';
        } else {
            $path = rtrim($path, '/') . '/';
        }

        return $scheme . '://' . $host . $port . $path;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private static function rewriteGravatarUrls(array $payload): array
    {
        $prefix = self::prefix();

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = self::rewriteGravatarUrls($value);
                continue;
            }

            if (!is_string($value) || !str_starts_with($value, 'http')) {
                continue;
            }

            $rewritten = preg_replace_callback(
                '#^https?://(?:www\.|secure\.)?gravatar\.com/avatar/#i',
                static fn (): string => $prefix,
                $value,
                1
            );
            if (is_string($rewritten)) {
                $payload[$key] = $rewritten;
            }
        }

        return $payload;
    }
}
