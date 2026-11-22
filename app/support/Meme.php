<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Exposes the Bilibili emote manifest and renders direct CDN image tags.
 * The CDN images are loaded by the browser, not proxied by the site server.
 */
final class Meme
{
    /** @var list<string> */
    private const HOSTS = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com'];

    /**
     * @return array{manifest: string}|null
     */
    public static function client(): ?array
    {
        if (!is_file(self::manifestPath())) {
            return null;
        }

        return ['manifest' => Assets::url('meme.json')];
    }

    public static function isBilibiliGarb(string $url): bool
    {
        $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        if ($url === '' || preg_match('/[\x00-\x20\x7f]/', $url) === 1) {
            return false;
        }

        $parts = parse_url($url);
        if (!is_array($parts)) {
            return false;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $path = (string) ($parts['path'] ?? '');

        if (
            $scheme !== 'https'
            || !in_array($host, self::HOSTS, true)
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['port'])
            || isset($parts['query'])
            || isset($parts['fragment'])
        ) {
            return false;
        }

        return preg_match(
            '#^/bfs/(?:garb/(?:item/)?|emote/)[A-Za-z0-9._-]+\.(?:png|jpe?g|gif|webp)$#i',
            $path
        ) === 1;
    }

    /**
     * Expands `[sunken_meme]group_name[/sunken_meme]` into a direct CDN image.
     * Unknown keys are left untouched so typos stay visible instead of
     * silently disappearing from the comment.
     */
    public static function expandShortcodes(string $html): string
    {
        if ($html === '' || !str_contains($html, '[sunken_meme]')) {
            return $html;
        }

        $items = self::manifestItems();
        if ($items === []) {
            return $html;
        }

        return (string) preg_replace_callback(
            '/\[sunken_meme\]\s*([^\[\]\r\n]{1,200}?)\s*\[\/sunken_meme\]/u',
            static function (array $match) use ($items): string {
                $key = trim((string) ($match[1] ?? ''));
                $item = $items[$key] ?? null;

                return is_array($item) ? self::imageTag($item['url'], $item['name']) : $match[0];
            },
            $html
        );
    }

    /**
     * Marks direct Bilibili images so the browser omits the site referrer.
     * Bilibili returns 403 for foreign Referer values but accepts no Referer.
     */
    public static function markClientImages(string $html): string
    {
        if ($html === '' || !str_contains($html, '<img')) {
            return $html;
        }

        return (string) preg_replace_callback(
            '/<img\b[^>]*>/is',
            static function (array $match): string {
                $tag = (string) ($match[0] ?? '');
                if (
                    preg_match('/\bsrc\s*=\s*(["\'])(.*?)\1/is', $tag, $source) !== 1
                    || !self::isBilibiliGarb(
                        html_entity_decode(
                            (string) ($source[2] ?? ''),
                            ENT_QUOTES | ENT_HTML5,
                            'UTF-8'
                        )
                    )
                ) {
                    return $tag;
                }

                $tag = (string) preg_replace(
                    '/\sreferrerpolicy\s*=\s*(["\']).*?\1/is',
                    '',
                    $tag
                );

                return (string) preg_replace(
                    '/\s*\/?>$/',
                    ' referrerpolicy="no-referrer" />',
                    $tag
                );
            },
            $html
        );
    }

    /**
     * @return array<string, array{name: string, url: string, group: string}>
     */
    private static function manifestItems(): array
    {
        static $items = null;

        if ($items !== null) {
            return $items;
        }

        $items = [];
        $raw = @file_get_contents(self::manifestPath());
        $data = is_string($raw) ? json_decode($raw, true) : null;

        if (!is_array($data)) {
            return $items;
        }

        foreach ($data as $groupName => $rows) {
            if (!is_array($rows)) {
                continue;
            }

            $group = trim((string) $groupName);
            if ($group === '' || preg_match('/[\[\]\r\n]/', $group) === 1) {
                continue;
            }

            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $name = isset($row['name']) && is_string($row['name']) ? trim($row['name']) : '';
                $url = isset($row['url']) && is_string($row['url']) ? trim($row['url']) : '';

                if ($name === '' || !self::isBilibiliGarb($url)) {
                    continue;
                }

                $items[$group . '_' . $name] = [
                    'name' => $name,
                    'url' => $url,
                    'group' => $group,
                ];
            }
        }

        return $items;
    }

    private static function imageTag(string $url, string $name): string
    {
        return '<img src="'
            . htmlspecialchars($url, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            . '" alt="'
            . htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            . '" loading="lazy" decoding="async" referrerpolicy="no-referrer" />';
    }

    private static function manifestPath(): string
    {
        return dirname(__DIR__, 2) . '/assets/meme.json';
    }
}
