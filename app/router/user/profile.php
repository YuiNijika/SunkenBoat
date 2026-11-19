<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use TTDF\Framework;
use TTDF\View\Components;

$root = Framework::root();

Components::render($root, 'layout/AppHeader', ['title' => '个人资料', 'noindex' => true]);
PageData::emit(PageData::user('profile'));
Components::render($root, 'layout/AppFooter', []);
