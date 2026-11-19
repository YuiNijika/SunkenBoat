<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use TTDF\Framework;
use TTDF\Theme\Templates;
use TTDF\View\Components;

$root = Framework::root();

Components::render($root, 'layout/AppHeader', [
    'archive' => $this,
    'title' => '页面没找到',
    'noindex' => true,
]);

if (!Templates::render($root, '404', $this, 'content/NotFound')) {
    PageData::emit(PageData::notFound($this));
}

Components::render($root, 'layout/AppFooter', ['archive' => $this]);
