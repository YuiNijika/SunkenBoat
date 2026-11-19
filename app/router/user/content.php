<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use TTDF\Framework;
use TTDF\View\Components;

$root = Framework::root();

Components::render($root, 'layout/AppHeader', ['title' => '内容管理', 'noindex' => true]);
PageData::emit(PageData::user('content'));
Components::render($root, 'layout/AppFooter', []);
