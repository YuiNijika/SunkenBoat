<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Http\Response;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Client-only site data.
 *
 * The page shell embeds the same payload for the first paint, then the React
 * router refreshes it from the theme's own /ttdf/sunken/{endpoint} route. The
 * route is registered through TTDF's router.match filter, not a router file.
 * This is intentionally separate from the optional TTDF REST v1/v2 surfaces.
 */
final class API
{
    public static function register(): void
    {
        Hooks::addFilter('router.match', [self::class, 'match']);
    }

    /**
     * @return array{handler: callable, params: array{endpoint: string}}|null
     */
    public static function match(mixed $match, string $path): ?array
    {
        if ($match !== null) {
            return is_array($match) ? $match : null;
        }

        $prefix = 'ttdf/sunken';
        $path = trim($path, '/');
        if ($path !== $prefix && !str_starts_with($path, $prefix . '/')) {
            return null;
        }

        $endpoint = trim(substr($path, strlen($prefix)), '/');
        if (
            str_contains($endpoint, '\\')
            || str_contains($endpoint, "\0")
            || str_contains($endpoint, '..')
        ) {
            return null;
        }

        return [
            'handler' => static function (array $params): never {
                self::dispatch((string) ($params['endpoint'] ?? ''));
            },
            'params' => ['endpoint' => $endpoint],
        ];
    }

    public static function dispatch(string $endpoint): never
    {
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method !== 'GET') {
            Response::error('Method not allowed', 405);
        }

        try {
            $data = match ($endpoint) {
                'sidebar' => PageData::sidebarData(),
                'site' => PageData::siteCard(),
                'categories' => PageData::categoriesData(),
                'posts' => PageData::recentPostsData(),
                'tags' => PageData::tagsData(),
                'stats' => PageData::statsData(),
                'search' => PageData::searchData(),
                default => null,
            };
        } catch (\Throwable $exception) {
            error_log('SunkenBoat data route failed: ' . $exception->getMessage());
            Response::error('Internal server error', 500);
        }

        if ($data === null) {
            Response::error('Endpoint not found', 404);
        }

        Response::success($data);
    }
}
