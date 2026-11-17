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

Components::render($root, 'layout/AppHeader', ['archive' => $this]);

if (!Templates::render($root, 'page', $this, 'content/Page')) {
    PageData::emit(PageData::page($this));
}

Components::render($root, 'layout/AppFooter', ['archive' => $this]);
