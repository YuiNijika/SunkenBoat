<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Http\Request;
use TTDF\Http\Response;
use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Serves the Bilibili emote manifest and proxies CDN images with the referrer
 * Bilibili expects. Browsers cannot attach that header to <img> requests.
 */
final class Meme
{
    private const MAX_BYTES = 3_145_728;

    private const MAX_SOURCE_LENGTH = 512;

    private const MAX_CACHE_BYTES = 134_217_728;

    private const CACHE_TTL = 604800;

    /** @var list<string> */
    private const HOSTS = ['i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com'];

    /**
     * @return array{manifest: string, proxy: string}|null
     */
    public static function client(): ?array
    {
        if (!is_file(self::manifestPath())) {
            return null;
        }

        return [
            'manifest' => Assets::url('meme.json'),
            'proxy' => self::proxyBase(),
        ];
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

    public static function proxyUrl(string $url): string
    {
        return self::proxyBase() . '?src=' . rawurlencode($url);
    }

    public static function isProxyable(string $url): bool
    {
        return self::isBilibiliGarb($url) && self::isAllowedSource($url);
    }

    /**
     * Expands `[sunken_meme]group_name[/sunken_meme]` into a proxied image.
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
     * Rewrites legacy direct Bilibili image URLs to the local proxy so old
     * comments keep rendering after the referrer restriction was added.
     */
    public static function rewriteHtml(string $html): string
    {
        if ($html === '' || !str_contains($html, '<img')) {
            return $html;
        }

        return (string) preg_replace_callback(
            '/<img\b[^>]*>/is',
            static function (array $match): string {
                return (string) preg_replace_callback(
                    '/\bsrc\s*=\s*(["\'])(.*?)\1/is',
                    static function (array $source): string {
                        $raw = html_entity_decode(
                            (string) ($source[2] ?? ''),
                            ENT_QUOTES | ENT_HTML5,
                            'UTF-8'
                        );

                        if (!self::isProxyable($raw)) {
                            return $source[0];
                        }

                        $url = htmlspecialchars(
                            self::proxyUrl($raw),
                            ENT_QUOTES | ENT_SUBSTITUTE,
                            'UTF-8'
                        );

                        return 'src=' . $source[1] . $url . $source[1];
                    },
                    $match[0],
                    1
                );
            },
            $html
        );
    }

    public static function serve(): never
    {
        $src = Request::queryString('src');
        if (
            strlen($src) > self::MAX_SOURCE_LENGTH
            || !self::isProxyable($src)
        ) {
            Response::error('Invalid meme source', 422);
        }

        $cache = self::cachePath($src);
        if (
            $cache !== ''
            && is_file($cache)
            && filesize($cache) > 0
            && filemtime($cache) + self::CACHE_TTL > time()
        ) {
            $cached = file_get_contents($cache);
            if (is_string($cached) && $cached !== '') {
                self::send($cached);
            }
        }

        $data = self::download($src);
        if ($data === null) {
            Response::error('Meme image is unavailable', 502);
        }

        self::cache($cache, $data['body']);
        self::send($data['body']);
    }

    private static function isAllowedSource(string $url): bool
    {
        static $allowed = null;

        if ($allowed === null) {
            $allowed = [];
            foreach (self::manifestItems() as $item) {
                $allowed[$item['url']] = true;
            }
        }

        return isset($allowed[$url]);
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
            . htmlspecialchars(self::proxyUrl($url), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            . '" alt="'
            . htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            . '" loading="lazy" decoding="async" />';
    }

    /**
     * @return array{body: string, mime: string}|null
     */
    private static function download(string $url): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $body = '';
        $tooLarge = false;
        $handle = curl_init($url);
        if ($handle === false) {
            return null;
        }

        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 2,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_ENCODING => '',
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
            CURLOPT_HTTPHEADER => [
                'Referer: https://www.bilibili.com/',
                'Origin: https://www.bilibili.com',
                'Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            ],
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body, &$tooLarge): int {
                if (strlen($body) + strlen($chunk) > self::MAX_BYTES) {
                    $tooLarge = true;
                    return 0;
                }

                $body .= $chunk;
                return strlen($chunk);
            },
        ]);

        $ok = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $effective = (string) curl_getinfo($handle, CURLINFO_EFFECTIVE_URL);
        curl_close($handle);

        if (
            $ok === false
            || $tooLarge
            || $status !== 200
            || $body === ''
            || !self::isBilibiliGarb($effective)
        ) {
            return null;
        }

        $image = @getimagesizefromstring($body);
        $mime = is_array($image) ? strtolower((string) ($image['mime'] ?? '')) : '';
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], true)) {
            return null;
        }

        return ['body' => $body, 'mime' => $mime];
    }

    private static function send(string $body): never
    {
        $image = @getimagesizefromstring($body);
        $mime = is_array($image) ? strtolower((string) ($image['mime'] ?? '')) : '';
        if (!in_array($mime, ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], true)) {
            Response::error('Invalid meme image', 502);
        }

        if (!headers_sent()) {
            if (class_exists('Typecho\\Response')) {
                \Typecho\Response::getInstance()->setStatus(200);
            } else {
                http_response_code(200);
            }

            header('Content-Type: ' . $mime);
            header('Content-Length: ' . strlen($body));
            header('Cache-Control: public, max-age=604800, immutable');
            header('X-Content-Type-Options: nosniff');
        }

        echo $body;
        exit;
    }

    private static function cache(string $path, string $body): void
    {
        if ($path === '') {
            return;
        }

        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            return;
        }

        self::trimCache($dir, strlen($body));
        @file_put_contents($path, $body, LOCK_EX);
    }

    private static function trimCache(string $dir, int $incoming): void
    {
        $files = glob($dir . DIRECTORY_SEPARATOR . '*.img');
        if (!is_array($files) || $files === []) {
            return;
        }

        $entries = [];
        $total = 0;

        foreach ($files as $file) {
            if (!is_file($file)) {
                continue;
            }

            $size = (int) filesize($file);
            $total += $size;
            $entries[] = [
                'path' => $file,
                'size' => $size,
                'time' => (int) filemtime($file),
            ];
        }

        if ($total + $incoming <= self::MAX_CACHE_BYTES) {
            return;
        }

        usort(
            $entries,
            static fn (array $left, array $right): int => $left['time'] <=> $right['time']
        );

        foreach ($entries as $entry) {
            if ($total + $incoming <= self::MAX_CACHE_BYTES) {
                break;
            }

            if (@unlink($entry['path'])) {
                $total -= $entry['size'];
            }
        }
    }

    private static function cachePath(string $url): string
    {
        $root = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR);
        if ($root === '') {
            return '';
        }

        $scope = hash(
            'sha256',
            (string) __TYPECHO_ROOT_DIR__ . '|' . Typecho::siteUrl()
        );

        return $root
            . DIRECTORY_SEPARATOR
            . 'sunken-' . 'meme-' . substr($scope, 0, 16)
            . DIRECTORY_SEPARATOR
            . hash('sha256', $url)
            . '.img';
    }

    private static function manifestPath(): string
    {
        return dirname(__DIR__, 2) . '/assets/meme.json';
    }

    private static function proxyBase(): string
    {
        $base = Typecho::indexUrl();
        if ($base === '') {
            $base = Typecho::siteUrl();
        }

        $base = rtrim($base, '/');
        return ($base === '' ? '' : $base) . '/ttdf/sunken/meme';
    }
}
