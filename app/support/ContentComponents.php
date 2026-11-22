<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Renders the small, theme-owned shortcode set used by the article editor.
 *
 * These components only wrap already-rendered article HTML. Attribute values
 * are escaped and the alert tone is whitelisted; unknown shortcodes are left
 * untouched so they never silently disappear from existing content.
 */
final class ContentComponents
{
    private const PATTERN = '/\[(alert|card|spoiler)\b([^\]]*)\](.*?)\[\/\1\]/is';

    public static function render(string $html): string
    {
        if ($html === '' || !str_contains($html, '[')) {
            return $html;
        }

        $rendered = preg_replace_callback(
            self::PATTERN,
            static function (array $match): string {
                $name = strtolower((string) ($match[1] ?? ''));
                $attributes = self::attributes((string) ($match[2] ?? ''));
                $body = (string) ($match[3] ?? '');

                return match ($name) {
                    'alert' => self::alert($attributes, $body),
                    'card' => self::card($attributes, $body),
                    'spoiler' => self::spoiler($attributes, $body),
                    default => (string) ($match[0] ?? ''),
                };
            },
            $html
        );

        return is_string($rendered) ? $rendered : $html;
    }

    /**
     * Strip theme-owned shortcode syntax from excerpts and SEO descriptions.
     * Protected login/reply bodies are redacted before the remaining shortcode
     * wrappers are unwrapped or removed.
     */
    public static function stripShortcodes(string $text): string
    {
        if ($text === '' || !str_contains($text, '[')) {
            return $text;
        }

        $text = ContentGate::redact($text);
        $pattern = '/\[(alert|card|spoiler)\b[^\]]*\]([\s\S]*?)\[\/\1\]/i';

        do {
            $count = 0;
            $next = preg_replace($pattern, '$2', $text, -1, $count);
            if (!is_string($next)) {
                break;
            }
            $text = $next;
        } while ($count > 0);

        $text = (string) preg_replace(
            '/\[sunken_meme\][\s\S]*?\[\/sunken_meme\]/i',
            ' ',
            $text
        );

        return (string) preg_replace(
            '/\[\/?(?:alert|card|spoiler|login|reply|sunken_meme)\b[^\]]*\](?![(\[])/i',
            ' ',
            $text
        );
    }

    /**
     * @param array<string, string> $attributes
     */
    private static function alert(array $attributes, string $body): string
    {
        $tone = strtolower($attributes['type'] ?? 'info');
        if (!in_array($tone, ['info', 'success', 'warning', 'danger'], true)) {
            $tone = 'info';
        }

        $title = trim($attributes['title'] ?? '');

        return '<div class="article-alert is-' . $tone . '" role="note">'
            . ($title === ''
                ? ''
                : '<p class="article-alert-title">' . self::escape($title) . '</p>')
            . '<div class="article-alert-body">' . $body . '</div>'
            . '</div>';
    }

    /**
     * @param array<string, string> $attributes
     */
    private static function card(array $attributes, string $body): string
    {
        $title = trim($attributes['title'] ?? '');

        return '<div class="article-card">'
            . ($title === '' ? '' : '<h3>' . self::escape($title) . '</h3>')
            . '<div class="article-card-body">' . $body . '</div>'
            . '</div>';
    }

    /**
     * @param array<string, string> $attributes
     */
    private static function spoiler(array $attributes, string $body): string
    {
        $label = trim($attributes['label'] ?? '');
        if ($label === '') {
            $label = '点击展开';
        }

        return '<details class="article-spoiler">'
            . '<summary>' . self::escape($label) . '</summary>'
            . '<div class="article-spoiler-body">' . $body . '</div>'
            . '</details>';
    }

    /**
     * @return array<string, string>
     */
    private static function attributes(string $source): array
    {
        $attributes = [];
        preg_match_all(
            '/([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s]+))/',
            $source,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            $name = strtolower((string) ($match[1] ?? ''));
            if ($name === '') {
                continue;
            }

            $value = $match[2] ?? '';
            if ($value === '' && isset($match[3]) && $match[3] !== '') {
                $value = $match[3];
            }
            if ($value === '' && isset($match[4]) && $match[4] !== '') {
                $value = $match[4];
            }

            $attributes[$name] = (string) $value;
        }

        return $attributes;
    }

    private static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
