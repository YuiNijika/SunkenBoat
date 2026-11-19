<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use TTDF\Hooks\Hooks;
use TTDF\Support\Escaper;
use TTDF\Theme\Assets;
use TTDF\Theme\Settings;
use TTDF\View\Components;

$archive = $viewData['archive'] ?? null;
$values = Settings::values();
$pageWidth = (int) ($values['Page_Width'] ?? 1300);
$pageWidth = max(960, min(1600, $pageWidth));
$colorMode = (string) ($values['Color_Mode'] ?? 'auto');
$lightThemeColor = (string) ($values['Color_Background'] ?? '');
$darkThemeColor = (string) ($values['Color_Background_Dark'] ?? '');
$lightThemeColor = $lightThemeColor !== '' ? $lightThemeColor : '#f5f6f7';
$darkThemeColor = $darkThemeColor !== '' ? $darkThemeColor : '#15171c';

$seo = \SunkenBoat\Support\Seo::pageMeta($viewData, is_object($archive) ? $archive : null);
$structuredData = \SunkenBoat\Support\Seo::structuredData(
    is_object($archive) ? $archive : null,
    $seo['title'],
    $seo['description'],
    $seo['siteName'],
    $seo['canonical']
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
    <title><?php echo Escaper::html($seo['title']); ?></title>
    <?php if ($seo['description'] !== ''): ?>
        <meta name="description" content="<?php echo Escaper::attr($seo['description']); ?>">
    <?php endif; ?>
    <meta name="robots" content="<?php echo Escaper::attr($seo['robots']); ?>">
    <link rel="canonical" href="<?php echo Escaper::url($seo['canonical']); ?>">
    <meta property="og:locale" content="<?php echo Escaper::attr($seo['locale']); ?>">
    <meta property="og:type" content="<?php echo Escaper::attr($seo['type']); ?>">
    <meta property="og:title" content="<?php echo Escaper::attr($seo['title']); ?>">
    <?php if ($seo['description'] !== ''): ?>
        <meta property="og:description" content="<?php echo Escaper::attr($seo['description']); ?>">
    <?php endif; ?>
    <meta property="og:url" content="<?php echo Escaper::url($seo['canonical']); ?>">
    <meta property="og:site_name" content="<?php echo Escaper::attr($seo['siteName']); ?>">
    <?php if ($seo['image'] !== ''): ?>
        <meta property="og:image" content="<?php echo Escaper::url($seo['image']); ?>">
        <meta property="og:image:alt" content="<?php echo Escaper::attr($seo['title']); ?>">
    <?php endif; ?>
    <?php if ($seo['publishedTime'] !== ''): ?>
        <meta property="article:published_time" content="<?php echo Escaper::attr($seo['publishedTime']); ?>">
    <?php endif; ?>
    <?php if ($seo['modifiedTime'] !== ''): ?>
        <meta property="article:modified_time" content="<?php echo Escaper::attr($seo['modifiedTime']); ?>">
    <?php endif; ?>
    <meta name="twitter:card" content="<?php echo $seo['image'] !== '' ? 'summary_large_image' : 'summary'; ?>">
    <meta name="twitter:title" content="<?php echo Escaper::attr($seo['title']); ?>">
    <?php if ($seo['description'] !== ''): ?>
        <meta name="twitter:description" content="<?php echo Escaper::attr($seo['description']); ?>">
    <?php endif; ?>
    <?php if ($seo['image'] !== ''): ?>
        <meta name="twitter:image" content="<?php echo Escaper::url($seo['image']); ?>">
    <?php endif; ?>
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
