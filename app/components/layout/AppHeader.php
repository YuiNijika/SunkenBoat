<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use TTDF\Support\Escaper;
use TTDF\Theme\Assets;
use TTDF\Theme\Settings;
use TTDF\View\Components;

$archive = $viewData['archive'] ?? null;
$options = Typecho::options();
$siteTitle = trim((string) ($options?->title ?? ''));
$siteDescription = trim((string) ($options?->description ?? ''));

$values = Settings::values();
$siteSubtitle = trim((string) ($values['SubTitle'] ?? ''));
$pageWidth = (int) ($values['Page_Width'] ?? 1300);
$pageWidth = max(960, min(1600, $pageWidth));
$colorMode = (string) ($values['Color_Mode'] ?? 'auto');
$lightThemeColor = (string) ($values['Color_Background'] ?? '');
$darkThemeColor = (string) ($values['Color_Background_Dark'] ?? '');
$lightThemeColor = $lightThemeColor !== '' ? $lightThemeColor : '#f5f6f7';
$darkThemeColor = $darkThemeColor !== '' ? $darkThemeColor : '#15171c';

$resolvedTitle = trim((string) ($viewData['title'] ?? ''));
if ($resolvedTitle === '' && is_object($archive)) {
    if (is_callable([$archive, 'is']) && $archive->is('single')) {
        $resolvedTitle = trim((string) ($archive->title ?? ''));
    } elseif (is_callable([$archive, 'getArchiveTitle'])) {
        $resolvedTitle = trim((string) $archive->getArchiveTitle());
    }
}

$siteHeading = $siteSubtitle !== ''
    ? $siteTitle . ' - ' . $siteSubtitle
    : $siteTitle;
$documentTitle = $resolvedTitle !== '' && $resolvedTitle !== $siteTitle
    ? $resolvedTitle . ' · ' . $siteTitle
    : $siteHeading;

$isSingle = is_object($archive) && is_callable([$archive, 'is']) && $archive->is('single');
$description = $siteDescription !== '' ? $siteDescription : $siteSubtitle;
if ($isSingle) {
    $excerpt = trim((string) preg_replace('/\s+/u', ' ', strip_tags((string) ($archive->excerpt ?? ''))));
    if ($excerpt !== '') {
        $description = \Typecho\Common::subStr($excerpt, 0, 150, '…');
    }
}

$canonicalUrl = Typecho::siteUrl();
if (is_object($archive) && is_callable([$archive, 'is']) && $archive->is('single')) {
    $candidate = trim((string) ($archive->permalink ?? ''));
    if ($candidate !== '') {
        $canonicalUrl = $candidate;
    }
}

$structuredData = \SunkenBoat\Support\Seo::structuredData(
    is_object($archive) ? $archive : null,
    $documentTitle,
    $description
);
?>
<!doctype html>
<html
    lang="zh-Hans"
    data-theme="light"
    style="--page-max: <?php echo Escaper::attr((string) $pageWidth); ?>px"
    data-theme-color-light="<?php echo Escaper::attr($lightThemeColor); ?>"
    data-theme-color-dark="<?php echo Escaper::attr($darkThemeColor); ?>"
>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?php echo Escaper::html($documentTitle); ?></title>
    <?php if ($description !== ''): ?>
        <meta name="description" content="<?php echo Escaper::attr($description); ?>">
    <?php endif; ?>
    <link rel="canonical" href="<?php echo Escaper::url($canonicalUrl); ?>">
    <meta property="og:type" content="<?php echo $isSingle ? 'article' : 'website'; ?>">
    <meta property="og:title" content="<?php echo Escaper::attr($documentTitle); ?>">
    <?php if ($description !== ''): ?>
        <meta property="og:description" content="<?php echo Escaper::attr($description); ?>">
    <?php endif; ?>
    <meta property="og:url" content="<?php echo Escaper::url($canonicalUrl); ?>">
    <meta property="og:site_name" content="<?php echo Escaper::attr($siteTitle); ?>">
    <meta name="twitter:card" content="summary">
    <meta name="theme-color" content="<?php echo Escaper::attr($lightThemeColor); ?>">
    <script type="application/ld+json"><?php
        echo json_encode(
            $structuredData,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP
        );
    ?></script>
    <script>
        (function () {
            var root = document.documentElement;
            var preferred = <?php echo Escaper::js($colorMode); ?>;
            var light = <?php echo Escaper::js($lightThemeColor); ?>;
            var darkColor = <?php echo Escaper::js($darkThemeColor); ?>;
            var saved = null;

            try {
                saved = window.localStorage.getItem('ttdf-theme');
            } catch (error) {
                saved = null;
            }

            var dark = saved
                ? saved === 'dark'
                : (preferred === 'dark'
                    ? true
                    : (preferred === 'light' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches));

            root.dataset.theme = dark ? 'dark' : 'light';

            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) {
                meta.setAttribute('content', dark ? darkColor : light);
            }
        })();
    </script>
    <link rel="icon" href="<?php echo Escaper::url(Assets::url('img/favicon.svg')); ?>" type="image/svg+xml">
    <link rel="stylesheet" href="<?php echo Escaper::url(Assets::url('style.css')); ?>">
    <?php Components::render(\TTDF\Framework::root(), 'layout/ThemeColors'); ?>
    <?php Hooks::doAction('theme.head', $archive); ?>
</head>
<body class="min-h-dvh bg-bg text-ink">
<a class="skip-link" href="#main">跳到正文</a>
<noscript>
    <p class="container-page py-10 text-sm text-ink-mute">
        这个主题使用 React 渲染界面，请启用 JavaScript 后重新打开页面。
    </p>
</noscript>
<div id="ttdf-app" data-ttdf-app>
