<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Support\Escaper;
use Widget\Archive;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Server-rendered fallback and structured data.
 *
 * The React bundle replaces `#ttdf-app` on load, but crawlers, social preview
 * bots and readers without JavaScript still receive real headings, links and
 * article HTML from this layer.
 */
final class Seo
{
    private const DEFAULT_TITLE_SEPARATOR = '·';

    private const DESCRIPTION_LIMIT = 160;

    /**
     * This theme owns SEO metadata, but Typecho's header still carries feed
     * links, plugin hooks, comment reply helpers and the anti-spam script.
     * Keep that output and suppress only the duplicate meta/canonical tags.
     */
    public static function register(): void
    {
        \TTDF\Hooks\Hooks::removeAction(
            'theme.head',
            [\TTDF\Theme\ArchiveLayout::class, 'renderHeader']
        );
        \TTDF\Hooks\Hooks::addAction('theme.head', [self::class, 'renderTypechoHeader'], 1);
    }

    public static function renderTypechoHeader(mixed ...$args): void
    {
        foreach ($args as $arg) {
            if (!is_object($arg) || !is_callable([$arg, 'header'])) {
                continue;
            }

            ob_start();
            try {
                $arg->header('description=&keywords=&social=0');
            } finally {
                $header = (string) ob_get_clean();
            }

            $header = (string) preg_replace(
                '#\s*<link\s+rel="canonical"[^>]*>\s*#i',
                "\n",
                $header
            );
            echo $header;

            return;
        }
    }

    /**
     * Global title separator used by both server-rendered titles and the React
     * document-title contract.
     */
    public static function separator(): string
    {
        $values = \TTDF\Theme\Settings::values();

        return self::normalizeSeparator(self::str($values['Seo_Title_Separator'] ?? ''));
    }

    public static function documentTitle(string $pageTitle, string $siteTitle, string $siteSubtitle = ''): string
    {
        $pageTitle = trim($pageTitle);
        $siteTitle = trim($siteTitle);
        $siteSubtitle = trim($siteSubtitle);
        $separator = self::separator();

        $siteHeading = $siteTitle;
        if ($siteSubtitle !== '') {
            $siteHeading = $siteTitle !== ''
                ? $siteTitle . ' ' . $separator . ' ' . $siteSubtitle
                : $siteSubtitle;
        }

        if ($pageTitle === '') {
            return $siteHeading;
        }

        if ($siteTitle === '' || $pageTitle === $siteTitle || $pageTitle === $siteHeading) {
            return $siteHeading !== '' ? $siteHeading : $pageTitle;
        }

        return $pageTitle . ' ' . $separator . ' ' . $siteTitle;
    }

    /**
     * One canonical source for title, description, social cards and robots.
     *
     * @param array<string, mixed> $viewData
     * @return array{
     *     title: string,
     *     siteName: string,
     *     description: string,
     *     canonical: string,
     *     robots: string,
     *     type: string,
     *     locale: string,
     *     image: string,
     *     publishedTime: string,
     *     modifiedTime: string
     * }
     */
    public static function pageMeta(array $viewData, ?Archive $archive): array
    {
        $options = \TTDF\Compat\Typecho::options();
        $values = \TTDF\Theme\Settings::values();
        $siteTitle = trim((string) ($options?->title ?? ''));
        $siteDescription = trim((string) ($options?->description ?? ''));
        $siteSubtitle = self::str($values['SubTitle'] ?? '');

        $pageTitle = self::str($viewData['title'] ?? '');
        if ($pageTitle === '' && $archive !== null && is_callable([$archive, 'is'])) {
            if ($archive->is('single')) {
                $pageTitle = self::str($archive->title ?? '');
            } elseif (is_callable([$archive, 'getArchiveTitle'])) {
                $pageTitle = self::str($archive->getArchiveTitle());
            }
        }

        $isSingle = $archive !== null
            && is_callable([$archive, 'is'])
            && $archive->is('single');
        $isSearch = $archive !== null
            && is_callable([$archive, 'is'])
            && $archive->is('search');
        $isNotFound = $archive !== null
            && is_callable([$archive, 'is'])
            && $archive->is('404');

        $description = self::description($viewData, $archive, $siteDescription, $siteSubtitle);
        if (
            $archive !== null
            && is_callable([$archive, 'setArchiveDescription'])
            && $description !== ''
        ) {
            $archive->setArchiveDescription($description);
        }

        $robots = self::str($viewData['robots'] ?? '');
        if ($robots === '') {
            $noindex = ($viewData['noindex'] ?? false) === true || $isSearch || $isNotFound;
            $robots = $noindex ? 'noindex,follow' : 'index,follow';
        }

        return [
            'title' => self::documentTitle($pageTitle, $siteTitle, $siteSubtitle),
            'siteName' => $siteTitle,
            'description' => $description,
            'canonical' => self::canonical($viewData, $archive),
            'robots' => $robots,
            'type' => $isSingle ? 'article' : 'website',
            'locale' => 'zh_CN',
            'image' => self::image($archive),
            'publishedTime' => $isSingle && $archive !== null
                ? self::timestamp((int) ($archive->created ?? 0))
                : '',
            'modifiedTime' => $isSingle && $archive !== null
                ? self::timestamp((int) ($archive->modified ?? 0))
                : '',
        ];
    }

    private static function normalizeSeparator(string $value): string
    {
        $value = strip_tags($value);
        $value = preg_replace('/[\x00-\x1F\x7F]+/u', '', $value) ?? '';
        $value = trim($value);
        if ($value === '') {
            return self::DEFAULT_TITLE_SEPARATOR;
        }

        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, 8, 'UTF-8');
        }

        return substr($value, 0, 24);
    }

    /**
     * @param array<string, mixed> $viewData
     */
    private static function description(
        array $viewData,
        ?Archive $archive,
        string $siteDescription,
        string $siteSubtitle
    ): string {
        $explicit = self::normalizeDescription(self::str($viewData['description'] ?? ''));
        if ($explicit !== '') {
            return $explicit;
        }

        if (
            $archive !== null
            && is_callable([$archive, 'is'])
            && $archive->is('single')
        ) {
            $excerpt = self::normalizeDescription(
                ContentGate::redact(self::str($archive->excerpt ?? ''))
            );
            if ($excerpt !== '') {
                return $excerpt;
            }
        }

        $description = self::normalizeDescription($siteDescription);
        if ($description !== '') {
            return $description;
        }

        return self::normalizeDescription($siteSubtitle);
    }

    private static function normalizeDescription(string $value): string
    {
        $value = strip_tags($value);
        $value = preg_replace('/\s+/u', ' ', $value) ?? '';
        $value = trim($value);
        if ($value === '') {
            return '';
        }

        if (class_exists('Typecho\\Common')) {
            return (string) \Typecho\Common::subStr($value, 0, self::DESCRIPTION_LIMIT, '…');
        }

        if (function_exists('mb_substr')) {
            return mb_strlen($value, 'UTF-8') > self::DESCRIPTION_LIMIT
                ? mb_substr($value, 0, self::DESCRIPTION_LIMIT, 'UTF-8') . '…'
                : $value;
        }

        return strlen($value) > self::DESCRIPTION_LIMIT
            ? substr($value, 0, self::DESCRIPTION_LIMIT) . '…'
            : $value;
    }

    /**
     * @param array<string, mixed> $viewData
     */
    private static function canonical(array $viewData, ?Archive $archive): string
    {
        $canonical = self::str($viewData['canonical'] ?? '');
        if ($canonical !== '') {
            return $canonical;
        }

        if ($archive !== null && is_callable([$archive, 'is'])) {
            if ($archive->is('single')) {
                $permalink = self::str($archive->permalink ?? '');
                if ($permalink !== '') {
                    return $permalink;
                }
            } elseif (
                !$archive->is('index')
                && !$archive->is('search')
                && !$archive->is('404')
            ) {
                $archiveUrl = is_callable([$archive, 'getArchiveUrl'])
                    ? self::str($archive->getArchiveUrl())
                    : '';
                if ($archiveUrl !== '') {
                    return $archiveUrl;
                }

                $permalink = self::str($archive->permalink ?? '');
                if ($permalink !== '') {
                    return $permalink;
                }
            }
        }

        if ($archive === null) {
            return self::requestUrl();
        }

        return \TTDF\Compat\Typecho::siteUrl();
    }

    private static function requestUrl(): string
    {
        $site = \TTDF\Compat\Typecho::siteUrl();
        $requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
        if (!is_string($requestPath) || $requestPath === '') {
            return $site;
        }

        $parts = parse_url($site);
        if (!is_array($parts) || !isset($parts['host'])) {
            return $site;
        }

        $scheme = isset($parts['scheme']) && $parts['scheme'] !== '' ? $parts['scheme'] : 'https';
        $origin = $scheme . '://' . $parts['host'];
        if (isset($parts['port'])) {
            $origin .= ':' . $parts['port'];
        }

        return $origin . $requestPath;
    }

    private static function image(?Archive $archive): string
    {
        if (
            $archive === null
            || !is_callable([$archive, 'is'])
            || !$archive->is('single')
        ) {
            return '';
        }

        $text = self::str($archive->text ?? '');
        if ($text === '') {
            return '';
        }

        return PageData::firstBodyImage($text, \TTDF\Compat\Typecho::siteUrl());
    }

    private static function timestamp(int $value): string
    {
        return $value > 0 ? date('c', $value) : '';
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function fallback(array $data): string
    {
        $site = is_array($data['site'] ?? null) ? $data['site'] : [];
        $blocks = is_array($data['blocks'] ?? null) ? $data['blocks'] : [];
        $html = '<div class="ttdf-seo" data-ttdf-fallback>' . PHP_EOL;
        $html .= self::header($site);
        $html .= '<main class="ttdf-seo-main">' . PHP_EOL;

        foreach ($blocks as $block) {
            if (is_array($block)) {
                $html .= self::block($block, $site);
            }
        }

        $html .= '</main>' . PHP_EOL;
        $html .= self::footer($site);
        $html .= '</div>' . PHP_EOL;

        return $html;
    }

    /**
     * @param array<string, mixed> $site
     */
    private static function header(array $site): string
    {
        $title = self::str($site['title'] ?? '');
        $description = self::str($site['description'] ?? '');
        $url = self::str($site['url'] ?? '');
        $html = '<header class="ttdf-seo-header">';
        $html .= '<a class="ttdf-seo-brand" href="' . Escaper::url($url) . '">' . Escaper::html($title) . '</a>';

        if ($description !== '') {
            $html .= '<p>' . Escaper::html($description) . '</p>';
        }

        $nav = is_array($site['nav'] ?? null) ? $site['nav'] : [];
        if ($nav !== []) {
            $html .= '<nav aria-label="主导航"><ul>';
            foreach ($nav as $item) {
                if (!is_array($item)) {
                    continue;
                }

                $html .= '<li><a href="' . Escaper::url(self::str($item['url'] ?? '')) . '">'
                    . Escaper::html(self::str($item['label'] ?? '')) . '</a></li>';
            }
            $html .= '</ul></nav>';
        }

        return $html . '</header>' . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $site
     */
    private static function footer(array $site): string
    {
        $feed = self::str($site['feedUrl'] ?? '');
        $html = '<footer class="ttdf-seo-footer">';
        $html .= '<p>' . Escaper::html(self::str($site['footerText'] ?? $site['description'] ?? '')) . '</p>';

        if ($feed !== '') {
            $html .= '<p><a href="' . Escaper::url($feed) . '">RSS 订阅</a></p>';
        }

        return $html . '</footer>' . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $block
     * @param array<string, mixed> $site
     */
    private static function block(array $block, array $site): string
    {
        $type = self::str($block['type'] ?? '');

        return match ($type) {
            'hero' => self::heading($block['title'] ?? '', $block['lead'] ?? '', 1),
            'archive-header' => self::heading($block['title'] ?? '', $block['description'] ?? '', 1),
            'post-header' => self::postHeader($block),
            'page-header' => self::heading($block['title'] ?? '', '', 1),
            'prose' => self::prose($block),
            'carousel' => self::carousel($block),
            'post-list' => self::postList($block),
            'categories' => self::linkList($block['title'] ?? '', self::items($block['items'] ?? [], 'label')),
            'tags' => self::linkList($block['title'] ?? '标签', self::items($block['items'] ?? [], 'label')),
            'comments' => self::comments($block),
            'notfound' => self::notFound($block),
            'search' => self::search($block, $site),
            'cta' => self::cta($block),
            'link-list' => self::linkList($block['title'] ?? '', self::items($block['items'] ?? [], 'label', true)),
            'forum-home' => self::forumHome($block),
            'forum-circle' => self::forumCircle($block),
            'forum-topic' => self::forumTopic($block),
            default => '',
        };
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function forumHome(array $block): string
    {
        $forum = is_array($block['forum'] ?? null) ? $block['forum'] : [];
        $html = self::heading($forum['title'] ?? '', $forum['description'] ?? '', 1);
        $circles = is_array($block['circles'] ?? null) ? $block['circles'] : [];
        $topics = is_array($block['topics'] ?? null) ? $block['topics'] : [];

        if ($circles !== []) {
            $html .= self::heading('圈子', '', 2) . '<ul>';
            foreach (array_slice($circles, 0, 12) as $circle) {
                if (is_array($circle)) {
                    $html .= '<li><a href="' . Escaper::url(self::str($circle['url'] ?? '')) . '">'
                        . Escaper::html(self::str($circle['name'] ?? '')) . '</a></li>';
                }
            }
            $html .= '</ul>' . PHP_EOL;
        }

        return $html . self::forumTopics('最新帖子', $topics);
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function forumCircle(array $block): string
    {
        $circle = is_array($block['circle'] ?? null) ? $block['circle'] : [];
        $html = self::heading($circle['name'] ?? '', $circle['description'] ?? '', 1);
        $topics = is_array($block['topics'] ?? null) ? $block['topics'] : [];

        return $html . self::forumTopics('圈子里的帖子', $topics);
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function forumTopic(array $block): string
    {
        $topic = is_array($block['topic'] ?? null) ? $block['topic'] : [];
        $author = is_array($topic['author'] ?? null) ? $topic['author'] : [];
        $html = self::heading($topic['title'] ?? '', '', 1);
        $meta = array_filter([
            self::str($author['screenName'] ?? ''),
            self::str($topic['createdText'] ?? ''),
            self::str($topic['views'] ?? '') !== '' ? self::str($topic['views']) . ' 次浏览' : '',
        ]);

        if ($meta !== []) {
            $html .= '<p class="ttdf-seo-meta">' . Escaper::html(implode(' · ', $meta)) . '</p>';
        }

        $html .= '<article class="ttdf-seo-prose">' . (string) ($block['contentHtml'] ?? '') . '</article>';
        $replies = is_array($block['replies'] ?? null) ? $block['replies'] : [];

        if ($replies !== []) {
            $html .= self::heading('回复', '', 2) . '<ol class="ttdf-seo-comments">';
            foreach ($replies as $reply) {
                if (!is_array($reply)) {
                    continue;
                }

                $replyAuthor = is_array($reply['author'] ?? null) ? $reply['author'] : [];
                $html .= '<li><p>' . Escaper::html(self::str($replyAuthor['screenName'] ?? ''))
                    . ' · ' . Escaper::html(self::str($reply['createdText'] ?? '')) . '</p>'
                    . '<div>' . (string) ($reply['contentHtml'] ?? '') . '</div></li>';
            }
            $html .= '</ol>' . PHP_EOL;
        }

        return $html;
    }

    /**
     * @param list<mixed> $topics
     */
    private static function forumTopics(string $title, array $topics): string
    {
        if ($topics === []) {
            return self::heading($title, '', 2);
        }

        $html = self::heading($title, '', 2) . '<ul>';
        foreach (array_slice($topics, 0, 20) as $topic) {
            if (!is_array($topic)) {
                continue;
            }

            $topicTitle = self::str($topic['title'] ?? '');
            $html .= '<li><a href="' . Escaper::url(self::str($topic['url'] ?? '')) . '">'
                . Escaper::html($topicTitle) . '</a>';
            $excerpt = self::str($topic['excerpt'] ?? '');
            if ($excerpt !== '') {
                $html .= ' <span>' . Escaper::html($excerpt) . '</span>';
            }
            $html .= '</li>';
        }

        return $html . '</ul>' . PHP_EOL;
    }

    private static function heading(mixed $title, mixed $lead, int $level): string
    {
        $title = self::str($title);
        if ($title === '') {
            return '';
        }

        $tag = 'h' . ($level === 1 ? '1' : '2');
        $html = '<' . $tag . '>' . Escaper::html($title) . '</' . $tag . '>';
        $lead = self::str($lead);

        if ($lead !== '') {
            $html .= '<p>' . Escaper::html($lead) . '</p>';
        }

        return $html . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function postHeader(array $block): string
    {
        $meta = is_array($block['meta'] ?? null) ? $block['meta'] : [];
        $html = self::heading($block['title'] ?? '', '', 1);
        $parts = array_filter([
            self::str($meta['date'] ?? ''),
            self::str($meta['author'] ?? ''),
            self::str($meta['commentsText'] ?? ''),
        ]);

        if ($parts !== []) {
            $html .= '<p class="ttdf-seo-meta">' . Escaper::html(implode(' · ', $parts)) . '</p>';
        }

        $categories = self::items($meta['categories'] ?? [], 'label');
        if ($categories !== []) {
            $html .= self::linkList('', $categories);
        }

        return $html;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function prose(array $block): string
    {
        $html = self::str($block['title'] ?? '') !== ''
            ? self::postHeader($block)
            : '';

        return $html . '<article class="ttdf-seo-prose">'
            . (string) ($block['html'] ?? '')
            . '</article>' . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function carousel(array $block): string
    {
        $slides = is_array($block['slides'] ?? null) ? $block['slides'] : [];
        $html = self::heading($block['title'] ?? '', '', 2);
        if ($slides === []) {
            return $html;
        }

        $html .= '<ul class="ttdf-seo-carousel">';
        foreach ($slides as $slide) {
            if (!is_array($slide)) {
                continue;
            }

            $title = self::str($slide['title'] ?? '');
            $url = self::str($slide['url'] ?? '');
            $description = self::str($slide['description'] ?? '');
            if ($title === '' && $description === '') {
                continue;
            }

            $html .= '<li>';
            if ($title !== '') {
                $html .= $url !== ''
                    ? '<a href="' . Escaper::url($url) . '">' . Escaper::html($title) . '</a>'
                    : Escaper::html($title);
            }
            if ($description !== '') {
                $html .= '<p>' . Escaper::html($description) . '</p>';
            }
            $html .= '</li>';
        }

        return $html . '</ul>' . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function postList(array $block): string
    {
        $posts = is_array($block['posts'] ?? null) ? $block['posts'] : [];
        $html = self::heading($block['title'] ?? '', '', 2);

        if ($posts === []) {
            return $html . '<p>' . Escaper::html(self::str($block['empty'] ?? '')) . '</p>' . PHP_EOL;
        }

        $html .= '<ul class="ttdf-seo-posts">';
        foreach ($posts as $post) {
            if (!is_array($post)) {
                continue;
            }

            $html .= '<li><h3><a href="' . Escaper::url(self::str($post['url'] ?? '')) . '">'
                . Escaper::html(self::str($post['title'] ?? '')) . '</a></h3>';

            $excerpt = self::str($post['excerpt'] ?? '');
            if ($excerpt !== '') {
                $html .= '<p>' . Escaper::html($excerpt) . '</p>';
            }

            $date = self::str($post['date'] ?? '');
            if ($date !== '') {
                $html .= '<time datetime="' . Escaper::attr(self::str($post['dateIso'] ?? '')) . '">'
                    . Escaper::html($date) . '</time>';
            }

            $html .= '</li>';
        }

        return $html . '</ul>' . PHP_EOL;
    }

    /**
     * @param mixed $items
     * @return list<array{label: string, url: string, description?: string}>
     */
    private static function items(mixed $items, string $labelKey, bool $withDescription = false): array
    {
        if (!is_array($items)) {
            return [];
        }

        $result = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }

            $label = self::str($item[$labelKey] ?? ($item['title'] ?? ''));
            $url = self::str($item['url'] ?? '');
            if ($label === '' || $url === '') {
                continue;
            }

            $entry = ['label' => $label, 'url' => $url];
            if ($withDescription) {
                $entry['description'] = self::str($item['description'] ?? '');
            }
            $result[] = $entry;
        }

        return $result;
    }

    /**
     * @param list<array{label: string, url: string, description?: string}> $items
     */
    private static function linkList(mixed $title, array $items): string
    {
        if ($items === []) {
            return '';
        }

        $html = self::heading($title, '', 2) . '<ul>';
        foreach ($items as $item) {
            $html .= '<li><a href="' . Escaper::url($item['url']) . '">' . Escaper::html($item['label']) . '</a>';
            if (($item['description'] ?? '') !== '') {
                $html .= ' ' . Escaper::html((string) $item['description']);
            }
            $html .= '</li>';
        }

        return $html . '</ul>' . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function comments(array $block): string
    {
        $comments = is_array($block['data'] ?? null) ? $block['data'] : [];
        $title = self::str($comments['title'] ?? '评论');
        $html = self::heading($title, '', 2);

        $count = self::str($comments['countText'] ?? '');
        if ($count !== '') {
            $html .= '<p>' . Escaper::html($count) . '</p>';
        }

        $list = self::str($comments['listHtml'] ?? '');
        if ($list !== '') {
            $html .= $list;
        }

        return $html;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function notFound(array $block): string
    {
        $html = self::heading($block['title'] ?? '', $block['text'] ?? '', 1);
        $action = is_array($block['action'] ?? null) ? $block['action'] : [];
        $label = self::str($action['label'] ?? '');
        $url = self::str($action['url'] ?? '');

        if ($label !== '' && $url !== '') {
            $html .= '<p><a href="' . Escaper::url($url) . '">' . Escaper::html($label) . '</a></p>' . PHP_EOL;
        }

        return $html;
    }

    /**
     * @param array<string, mixed> $block
     * @param array<string, mixed> $site
     */
    private static function search(array $block, array $site): string
    {
        $action = self::str($block['action'] ?? ($site['url'] ?? ''));
        $title = self::str($block['title'] ?? '搜索');
        $placeholder = self::str($block['placeholder'] ?? '');

        return '<form action="' . Escaper::url($action) . '" method="get" role="search">'
            . '<label>' . Escaper::html($title)
            . '<input type="search" name="s" placeholder="' . Escaper::attr($placeholder) . '">'
            . '</label><button type="submit">' . Escaper::html(self::str($block['buttonLabel'] ?? '搜索'))
            . '</button></form>' . PHP_EOL;
    }

    /**
     * @param array<string, mixed> $block
     */
    private static function cta(array $block): string
    {
        $html = self::heading($block['title'] ?? '', $block['text'] ?? '', 2);
        $action = is_array($block['action'] ?? null) ? $block['action'] : [];
        $label = self::str($action['label'] ?? '');
        $url = self::str($action['url'] ?? '');

        if ($label !== '' && $url !== '') {
            $html .= '<p><a href="' . Escaper::url($url) . '">' . Escaper::html($label) . '</a></p>' . PHP_EOL;
        }

        return $html;
    }

    private static function str(mixed $value): string
    {
        return is_scalar($value) ? trim((string) $value) : '';
    }

    /**
     * Structured data for the current request.
     *
     * @return array<string, mixed>
     */
    public static function structuredData(
        ?Archive $archive,
        string $title,
        string $description,
        string $siteName = '',
        string $canonical = ''
    ): array
    {
        $siteUrl = \TTDF\Compat\Typecho::siteUrl();
        $type = 'WebPage';
        $permalink = $canonical !== '' ? $canonical : $siteUrl;

        if ($archive !== null && is_callable([$archive, 'is']) && $archive->is('single')) {
            $type = 'Article';

            $candidate = trim((string) ($archive->permalink ?? ''));
            if ($candidate !== '') {
                $permalink = $candidate;
            }
        }

        $data = [
            '@context' => 'https://schema.org',
            '@type' => $type,
            'name' => $title,
            'url' => $permalink,
            'inLanguage' => 'zh-Hans',
            'isPartOf' => [
                '@type' => 'WebSite',
                'name' => $siteName !== '' ? $siteName : $title,
                'url' => $siteUrl,
            ],
        ];

        if ($description !== '') {
            $data['description'] = $description;
        }

        if ($type === 'Article' && $archive !== null) {
            $data['headline'] = $title;

            $created = (int) ($archive->created ?? 0);
            if ($created > 0) {
                $data['datePublished'] = date('c', $created);
            }

            $modified = (int) ($archive->modified ?? 0);
            if ($modified > 0) {
                $data['dateModified'] = date('c', $modified);
            }

            $authorWidget = $archive->author ?? null;
            $author = is_object($authorWidget)
                ? trim((string) ($authorWidget->screenName ?? ''))
                : '';
            if ($author !== '') {
                $data['author'] = ['@type' => 'Person', 'name' => $author];
            }

            $data['mainEntityOfPage'] = ['@type' => 'WebPage', '@id' => $permalink];
        }

        return $data;
    }
}
