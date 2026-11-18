<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
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
    private const PATTERN = '/\[(login|reply)\](.*?)\[\/\1\]/is';

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
        if ($html === '' || $cid <= 0 || !str_contains($html, '[')) {
            return $html;
        }

        $uid = self::uid();
        $admin = self::isAdmin();
        $canLogin = $admin || $uid > 0;
        $canReply = $admin || ($uid > 0 && self::hasCommented($cid, $uid));

        $rendered = preg_replace_callback(
            self::PATTERN,
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
            $html
        );

        return is_string($rendered) ? $rendered : $html;
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
}
