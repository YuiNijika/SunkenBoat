<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Compat\Typecho;
use TTDF\Http\Request;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Renders `[login]` and `[reply]` shortcodes in article bodies.
 *
 * The protected markup never reaches the browser when the visitor is not
 * allowed to see it; the page receives a small locked panel instead.
 */
final class ContentGate
{
    /**
     * A closed block is removed as a whole. Typecho excerpts can cut a block
     * in half before the closing tag, so an unterminated opener also redacts
     * everything after it rather than leaking the visible prefix.
     */
    private const PATTERN = '/\[(login|reply)\](.*?)(?:\[\/\1\]|\z)/is';

    private const INNER_PATTERN = '/\[(login|reply)\]((?:(?!\[(?:login|reply)\])[\s\S])*?)\[\/\1\]/i';

    private const OPEN_PATTERN = '/\[(login|reply)\]/i';

    private static string $requestPath = '';

    public static function register(): void
    {
        Hooks::addAction('rest.request', [self::class, 'rememberRequest']);
        Hooks::addAction('rest.v2.request', [self::class, 'rememberRequest']);
        Hooks::addFilter('rest.response', [self::class, 'filterRestResponse']);
        Hooks::addFilter('rest.v2.response', [self::class, 'filterRestResponse']);
        self::registerFeedGuard();
    }

    /**
     * Native `/feed` output bypasses theme components, so the same shortcodes
     * must be removed before Typecho serializes each item.
     */
    private static function registerFeedGuard(): void
    {
        if (!class_exists('Typecho\\Plugin')) {
            return;
        }

        try {
            $feed = \Typecho\Plugin::factory('Widget\\Feed');
            $feed->feedItem = static function (string $type, object $archive): string {
                unset($type);

                foreach (['text', 'content', 'excerpt', 'plainExcerpt'] as $field) {
                    try {
                        $value = $archive->{$field};
                    } catch (\Throwable) {
                        continue;
                    }

                    if (is_string($value) && str_contains($value, '[')) {
                        try {
                            $archive->{$field} = self::redact($value);
                        } catch (\Throwable) {
                            // A read-only row cannot be rewritten; the feed
                            // still receives only the fields we can replace.
                        }
                    }
                }

                return '';
            };
        } catch (\Throwable) {
            // Older Typecho builds without Widget\Feed plugins simply skip
            // this guard; REST and page rendering remain protected.
        }
    }

    public static function rememberRequest(string $method, string $path, string $scope): void
    {
        unset($method, $scope);
        self::$requestPath = trim($path, '/');
    }

    /**
     * Public REST controllers return raw Markdown/HTML. Protect gated blocks
     * before they leave the API, and never expose protected excerpt text.
     *
     * @param mixed $payload
     * @return array<string, mixed>
     */
    public static function filterRestResponse(mixed $payload, int $status, string $scope): array
    {
        unset($scope);

        if (!is_array($payload) || $status < 200 || $status >= 300) {
            return is_array($payload) ? $payload : [];
        }

        $data = $payload['data'] ?? null;
        if (!is_array($data)) {
            return $payload;
        }

        $single = preg_match(
            '#^(?:posts|pages)/([1-9][0-9]*)$#D',
            self::$requestPath,
            $matches
        ) === 1;
        $listing = in_array(self::$requestPath, ['posts', 'pages', 'search'], true);
        if (!$single && !$listing) {
            return $payload;
        }

        if ($listing) {
            foreach ($data as $index => $item) {
                if (is_array($item) && isset($item['excerpt']) && is_string($item['excerpt'])) {
                    $data[$index]['excerpt'] = trim(self::redact($item['excerpt']));
                }
            }
            $payload['data'] = $data;

            return $payload;
        }

        $cid = (int) ($matches[1] ?? 0);
        $identity = self::requestIdentity();
        $uid = (int) ($identity['uid'] ?? 0);
        $admin = (string) ($identity['group'] ?? '') === 'administrator';
        $markdown = strtolower(Request::queryString('format', 'html')) === 'markdown';

        if (isset($data['excerpt']) && is_string($data['excerpt'])) {
            $data['excerpt'] = trim(self::redact($data['excerpt']));
        }

        if (isset($data['content']) && is_string($data['content'])) {
            $data['content'] = $markdown
                ? self::protectMarkdown($data['content'], $cid, $uid, $admin)
                : self::renderFor($data['content'], $cid, $uid, $admin);
        }

        $payload['data'] = $data;

        return $payload;
    }

    /**
     * Remove protected shortcode bodies before text is used in SEO metadata.
     */
    public static function redact(string $text): string
    {
        if ($text === '' || !str_contains($text, '[')) {
            return $text;
        }

        $redacted = preg_replace(self::PATTERN, ' ', $text);
        return is_string($redacted) ? $redacted : $text;
    }

    public static function render(string $html, int $cid): string
    {
        return self::renderFor($html, $cid, self::uid(), self::isAdmin());
    }

    private static function renderFor(string $html, int $cid, int $uid, bool $admin): string
    {
        if ($html === '' || !str_contains($html, '[')) {
            return $html;
        }

        $canLogin = $admin || $uid > 0;
        $canReply = $admin || ($uid > 0 && self::hasCommented($cid, $uid));

        return self::rewriteBlocks(
            $html,
            static function (array $match) use ($canLogin, $canReply, $uid): string {
                $type = strtolower((string) ($match[1] ?? ''));
                $inner = (string) ($match[2] ?? '');
                $allowed = $type === 'reply' ? $canReply : $canLogin;

                if ($allowed) {
                    return '<div class="content-gate content-gate-open" data-gate="' . $type . '">'
                        . $inner
                        . '</div>';
                }

                return self::locked($type, $uid > 0);
            },
            static fn (string $type): string => self::locked($type, $uid > 0)
        );
    }

    private static function protectMarkdown(
        string $text,
        int $cid,
        int $uid,
        bool $admin
    ): string {
        if ($text === '' || !str_contains($text, '[')) {
            return $text;
        }

        $canLogin = $admin || $uid > 0;
        $canReply = $admin || ($uid > 0 && self::hasCommented($cid, $uid));

        return self::rewriteBlocks(
            $text,
            static function (array $match) use ($canLogin, $canReply): string {
                $type = strtolower((string) ($match[1] ?? 'login'));
                $inner = (string) ($match[2] ?? '');
                if ($type === 'reply') {
                    return $canReply
                        ? $inner
                        : "\n\n> 参与讨论后继续阅读。登录账号并发表一条评论即可解锁。\n\n";
                }

                return $canLogin
                    ? $inner
                    : "\n\n> 登录后继续阅读。这是一个仅对已登录成员开放的内容区域。\n\n";
            },
            static function (string $type) use ($canLogin, $canReply): string {
                $allowed = $type === 'reply' ? $canReply : $canLogin;
                if ($allowed) {
                    return "\n\n> 内容区块格式不完整，已停止显示后续内容。\n\n";
                }

                return $type === 'reply'
                    ? "\n\n> 参与讨论后继续阅读。登录账号并发表一条评论即可解锁。\n\n"
                    : "\n\n> 登录后继续阅读。这是一个仅对已登录成员开放的内容区域。\n\n";
            }
        );
    }

    /**
     * Rewrite blocks from the inside out so nested gates cannot leak an inner
     * protected section through an allowed outer one.
     *
     * @param callable(array{0: string, 1: string, 2: string}): string $render
     * @param callable(string): string $unterminated
     */
    private static function rewriteBlocks(string $text, callable $render, callable $unterminated): string
    {
        do {
            $count = 0;
            $next = preg_replace_callback(self::INNER_PATTERN, $render, $text, -1, $count);
            if (!is_string($next)) {
                return $text;
            }
            $text = $next;
        } while ($count > 0);

        if (preg_match(self::OPEN_PATTERN, $text, $match, PREG_OFFSET_CAPTURE) !== 1) {
            return $text;
        }

        $offset = (int) ($match[0][1] ?? 0);
        $type = strtolower((string) ($match[1][0] ?? 'login'));

        return substr($text, 0, $offset) . $unterminated($type);
    }

    private static function locked(string $type, bool $signedIn): string
    {
        $reply = $type === 'reply';
        $eyebrow = $reply ? 'COMMENT ACCESS' : 'MEMBER ACCESS';
        $title = $reply ? '参与讨论后继续阅读' : '登录后继续阅读';
        $text = $reply
            ? ($signedIn
                ? '在本篇文章下发表一条评论，内容会立即为你解锁。'
                : '登录账号并参与评论后，即可查看被隐藏的完整内容。')
            : '这是一个仅对已登录成员开放的内容区域。登录后即可查看完整正文。';

        $label = $reply && $signedIn ? '前往评论区' : '立即登录';
        $url = $reply && $signedIn ? '#comments' : self::loginUrl();

        return '<section class="content-gate-hero" data-gate="' . $type . '">'
            . '<div class="content-gate-hero-inner">'
            . '<span class="content-gate-icon" aria-hidden="true">'
            . self::icon($reply ? 'message' : 'lock')
            . '</span>'
            . '<div class="content-gate-copy">'
            . '<p class="content-gate-eyebrow">' . $eyebrow . '</p>'
            . '<h2 class="content-gate-title">' . $title . '</h2>'
            . '<p class="content-gate-text">' . $text . '</p>'
            . '</div>'
            . '<a class="content-gate-btn" href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">'
            . '<span>' . $label . '</span>'
            . self::icon('arrow')
            . '</a>'
            . '</div>'
            . '</section>';
    }

    private static function icon(string $name): string
    {
        $paths = match ($name) {
            'message' => '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'
                . '<path d="M8 9h8"/><path d="M8 13h5"/>',
            'arrow' => '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
            default => '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>'
                . '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        };

        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
            . ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            . $paths
            . '</svg>';
    }

    private static function loginUrl(): string
    {
        try {
            $options = Typecho::options();
            $url = trim((string) ($options?->loginUrl ?? ''));
        } catch (\Throwable) {
            $url = '';
        }

        if ($url === '') {
            $url = rtrim(Typecho::siteUrl(), '/') . '/admin/login.php';
        }

        return $url;
    }

    private static function uid(): int
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

    private static function isAdmin(): bool
    {
        try {
            return \Widget\User::alloc()->pass('administrator', true);
        } catch (\Throwable) {
            return false;
        }
    }

    private static function hasCommented(int $cid, int $uid): bool
    {
        if (!class_exists('Typecho\\Db')) {
            return false;
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('coid')
                    ->from('table.comments')
                    ->where('cid = ?', $cid)
                    ->where('authorId = ?', $uid)
                    ->where('status = ?', 'approved')
                    ->limit(1)
            );
        } catch (\Throwable) {
            return false;
        }

        return is_array($row) && (int) ($row['coid'] ?? 0) > 0;
    }

    /**
     * @return array<string, mixed>
     */
    private static function requestIdentity(): array
    {
        try {
            $identity = \TTDF\Http\Rest\V2\Auth::identity();
        } catch (\Throwable) {
            return [];
        }

        return is_array($identity) ? $identity : [];
    }
}
