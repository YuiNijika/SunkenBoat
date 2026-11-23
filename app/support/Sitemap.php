<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Http\Response;
use TTDF\Support\Escaper;
use Typecho\Common;
use Typecho\Db;
use Typecho\Router;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Generates the public sitemap from Typecho's published content and terms.
 *
 * The sitemap is intentionally served by the theme's own router file instead
 * of a REST endpoint: it is a crawler-facing document, not an application API.
 */
final class Sitemap
{
    private const MAX_URLS = 45000;

    public static function output(): never
    {
        Response::text(
            self::xml(),
            200,
            'application/xml; charset=UTF-8',
            [
                'X-Content-Type-Options' => 'nosniff',
                'Cache-Control' => 'public, max-age=3600',
            ]
        );
    }

    public static function xml(): string
    {
        $entries = self::entries();
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

        foreach ($entries as $entry) {
            $xml .= '  <url><loc>' . Escaper::html($entry['loc']) . '</loc>';
            if ($entry['lastmod'] > 0) {
                $xml .= '<lastmod>' . gmdate('c', $entry['lastmod']) . '</lastmod>';
            }
            $xml .= '</url>' . "\n";
        }

        return $xml . '</urlset>' . "\n";
    }

    /**
     * @return list<array{loc: string, lastmod: int}>
     */
    private static function entries(): array
    {
        $entries = [];
        $seen = [];
        $siteUrl = Typecho::siteUrl();
        $lastmod = 0;

        if (!class_exists('Typecho\\Db')) {
            return $siteUrl !== ''
                ? [['loc' => $siteUrl, 'lastmod' => time()]]
                : [];
        }

        try {
            $db = Db::get();
            $options = Typecho::options();
            $index = is_scalar($options?->index ?? null) ? (string) $options->index : '';
            $now = (int) ($options?->time ?? time());
            $rows = $db->fetchAll(
                $db->select('cid', 'slug', 'type', 'created', 'modified')
                    ->from('table.contents')
                    ->where('status = ?', 'publish')
                    ->where('type IN ?', ['post', 'page'])
                    ->where('created < ?', $now)
                    ->where('(table.contents.password IS NULL OR table.contents.password = ?)', '')
                    ->order('modified', Db::SORT_DESC)
                    ->limit(self::MAX_URLS)
            );

            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $type = (string) ($row['type'] ?? '');
                if (!in_array($type, ['post', 'page'], true)) {
                    continue;
                }

                $url = self::contentUrl($type, $row, $index);
                if ($url === '' || isset($seen[$url])) {
                    continue;
                }

                $seen[$url] = true;
                $modified = (int) ($row['modified'] ?? 0);
                if ($modified <= 0) {
                    $modified = (int) ($row['created'] ?? 0);
                }
                $lastmod = max($lastmod, $modified);
                $entries[] = ['loc' => $url, 'lastmod' => $modified];
            }

            $terms = $db->fetchAll(
                $db->select('mid', 'slug', 'type')
                    ->from('table.metas')
                    ->where('type IN ?', ['category', 'tag'])
            );

            foreach ($terms as $term) {
                if (!is_array($term)) {
                    continue;
                }

                $type = (string) ($term['type'] ?? '');
                if (!in_array($type, ['category', 'tag'], true)) {
                    continue;
                }

                $url = self::termUrl($type, $term, $index);
                if ($url === '' || isset($seen[$url])) {
                    continue;
                }

                $seen[$url] = true;
                $entries[] = ['loc' => $url, 'lastmod' => 0];
            }
        } catch (\Throwable $exception) {
            error_log('SunkenBoat sitemap lookup failed: ' . $exception->getMessage());
        }

        if ($siteUrl !== '' && !isset($seen[$siteUrl])) {
            array_unshift($entries, [
                'loc' => $siteUrl,
                'lastmod' => $lastmod > 0 ? $lastmod : time(),
            ]);
        }

        return $entries;
    }

    /**
     * @param array<string, mixed> $row
     */
    private static function contentUrl(string $type, array $row, string $index): string
    {
        try {
            $path = Router::url($type, [
                'cid' => (int) ($row['cid'] ?? 0),
                'slug' => (string) ($row['slug'] ?? ''),
            ]);

            return $path === '#' ? '' : Common::url($path, $index);
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * @param array<string, mixed> $term
     */
    private static function termUrl(string $type, array $term, string $index): string
    {
        try {
            $path = Router::url($type, [
                'mid' => (int) ($term['mid'] ?? 0),
                'slug' => (string) ($term['slug'] ?? ''),
            ]);

            return $path === '#' ? '' : Common::url($path, $index);
        } catch (\Throwable) {
            return '';
        }
    }
}
