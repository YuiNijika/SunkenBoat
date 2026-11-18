<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Renders comment Markdown with a deliberately small HTML allowlist.
 *
 * Typecho's own comment whitelist is configured in the admin panel, so a
 * Markdown comment can lose its code blocks or images when that list is
 * conservative. The theme therefore renders comments itself and keeps only
 * the tags needed by the editor toolbar.
 */
final class CommentMarkup
{
    /**
     * @var array<string, list<string>>
     */
    private const TAGS = [
        'p' => [],
        'br' => [],
        'a' => ['href', 'title'],
        'img' => ['src', 'alt', 'title', 'width', 'height'],
        'code' => ['class'],
        'pre' => [],
        'strong' => [],
        'b' => [],
        'em' => [],
        'i' => [],
        'del' => [],
        's' => [],
        'blockquote' => [],
        'ul' => [],
        'ol' => [],
        'li' => [],
        'hr' => [],
        'h3' => [],
        'h4' => [],
        'h5' => [],
        'h6' => [],
    ];

    /**
     * Tags whose whole subtree is discarded instead of unwrapped.
     *
     * @var list<string>
     */
    private const DROP = [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'form',
        'input',
        'button',
        'select',
        'textarea',
        'svg',
        'math',
        'link',
        'meta',
        'base',
        'template',
    ];

    public static function register(): void
    {
        Hooks::addFilter('rest.v2.response', [self::class, 'filterResponse']);
    }

    /**
     * Rewrites comment `html` fields in REST v2 responses so the React client
     * receives the same sanitized Markdown the PHP templates render.
     */
    public static function filterResponse(mixed $payload, int $status, string $scope): mixed
    {
        unset($status);

        if (!is_array($payload) || !str_starts_with($scope, 'v2.')) {
            return $payload;
        }

        $data = $payload['data'] ?? null;
        if (!is_array($data)) {
            return $payload;
        }

        if (self::isComment($data)) {
            $payload['data'] = self::rewrite($data);
            return $payload;
        }

        $changed = false;
        $legacy = [];

        foreach ($data as $index => $item) {
            if (!is_array($item)) {
                continue;
            }

            if (self::isComment($item)) {
                $data[$index] = self::rewrite($item);
                $changed = true;
                continue;
            }

            if (self::isLegacyComment($item)) {
                $legacy[(int) $item['coid']] = $index;
            }
        }

        if ($legacy !== []) {
            $rawTexts = self::rawTexts(array_keys($legacy));

            foreach ($legacy as $coid => $index) {
                if (!isset($rawTexts[$coid])) {
                    continue;
                }

                $data[$index]['html'] = self::html($rawTexts[$coid]);
                $changed = true;
            }
        }

        if ($changed) {
            $payload['data'] = $data;
        }

        return $payload;
    }

    public static function html(string $text): string
    {
        $text = trim($text);
        if ($text === '') {
            return '';
        }

        return self::sanitize(Typecho::markdown($text));
    }

    /**
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private static function rewrite(array $item): array
    {
        $item['html'] = self::html((string) ($item['text'] ?? ''));

        return $item;
    }

    /**
     * @param array<mixed> $data
     */
    private static function isComment(array $data): bool
    {
        return isset($data['coid'], $data['text'], $data['html']);
    }

    /**
     * The public v2 comment list delegates to the v1 controller, which returns
     * the already-stripped HTML instead of the stored Markdown source.
     *
     * @param array<string, mixed> $data
     */
    private static function isLegacyComment(array $data): bool
    {
        return isset($data['coid'], $data['text'], $data['parent']) && !isset($data['html']);
    }

    /**
     * @param list<int> $coids
     * @return array<int, string>
     */
    private static function rawTexts(array $coids): array
    {
        if ($coids === []) {
            return [];
        }

        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('coid', 'text')
                    ->from('table.comments')
                    ->where('coid IN ?', $coids)
            );
        } catch (\Throwable) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            $result[(int) ($row['coid'] ?? 0)] = (string) ($row['text'] ?? '');
        }

        return $result;
    }

    private static function sanitize(string $html): string
    {
        if ($html === '') {
            return '';
        }

        if (!class_exists('DOMDocument')) {
            return nl2br(htmlspecialchars($html, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'));
        }

        $document = new \DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $loaded = $document->loadHTML(
            '<?xml encoding="UTF-8"><div id="ttdf-comment-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (!$loaded) {
            return '';
        }

        $root = $document->getElementById('ttdf-comment-root');
        if (!$root instanceof \DOMElement) {
            foreach ($document->getElementsByTagName('div') as $candidate) {
                if ($candidate->getAttribute('id') === 'ttdf-comment-root') {
                    $root = $candidate;
                    break;
                }
            }
        }

        if (!$root instanceof \DOMElement) {
            return '';
        }

        self::clean($root);

        $output = '';
        foreach ($root->childNodes as $child) {
            $output .= (string) $document->saveHTML($child);
        }

        return trim($output);
    }

    private static function clean(\DOMNode $node): void
    {
        $child = $node->firstChild;

        while ($child !== null) {
            $next = $child->nextSibling;

            if ($child instanceof \DOMElement) {
                $tag = strtolower($child->tagName);

                if (in_array($tag, self::DROP, true)) {
                    $node->removeChild($child);
                } elseif (!isset(self::TAGS[$tag])) {
                    self::unwrap($child);
                } else {
                    self::attributes($child, $tag);
                    self::clean($child);
                }
            }

            $child = $next;
        }
    }

    private static function unwrap(\DOMElement $element): void
    {
        $parent = $element->parentNode;
        if (!$parent instanceof \DOMNode) {
            return;
        }

        while ($element->firstChild !== null) {
            $parent->insertBefore($element->firstChild, $element);
        }

        $parent->removeChild($element);
    }

    private static function attributes(\DOMElement $element, string $tag): void
    {
        $allowed = self::TAGS[$tag];
        $names = [];

        foreach ($element->attributes as $attribute) {
            $names[] = $attribute->name;
        }

        foreach ($names as $name) {
            $lower = strtolower($name);

            if (!in_array($lower, $allowed, true)) {
                $element->removeAttribute($name);
                continue;
            }

            $value = trim($element->getAttribute($name));

            if ($lower === 'href' || $lower === 'src') {
                if (!self::safeUrl($value, $lower === 'src')) {
                    $element->removeAttribute($name);
                }
                continue;
            }

            if ($tag === 'code' && $lower === 'class') {
                if (preg_match('/^language-[a-z0-9#+._-]+$/i', $value) !== 1) {
                    $element->removeAttribute($name);
                }
                continue;
            }

            if ($tag === 'img' && in_array($lower, ['width', 'height'], true)) {
                if (preg_match('/^\d{1,4}$/', $value) !== 1) {
                    $element->removeAttribute($name);
                }
            }
        }

        if ($tag === 'a') {
            $element->setAttribute('rel', 'nofollow ugc noreferrer');
        }

        if ($tag === 'img') {
            $element->setAttribute('loading', 'lazy');
            $element->setAttribute('decoding', 'async');
        }
    }

    private static function safeUrl(string $url, bool $image): bool
    {
        $url = html_entity_decode(trim($url), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $url = (string) preg_replace('/[\x00-\x20]+/', '', $url);

        if ($url === '' || str_starts_with($url, '//')) {
            return false;
        }

        if (str_starts_with($url, '/') || str_starts_with($url, '#')) {
            return !$image || str_starts_with($url, '/');
        }

        if (preg_match('/^([a-z][a-z0-9+.-]*):/i', $url, $matches) !== 1) {
            return !$image;
        }

        $scheme = strtolower($matches[1]);
        $allowed = $image ? ['http', 'https'] : ['http', 'https', 'mailto'];

        return in_array($scheme, $allowed, true);
    }
}
