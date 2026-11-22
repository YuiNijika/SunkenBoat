<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use SunkenBoat\Support\UserProfile;
use TTDF\Framework;
use TTDF\View\Components;

$root = Framework::root();
$allowed = UserProfile::canOperate();

if (!$allowed && class_exists('Typecho\\Response')) {
    \Typecho\Response::getInstance()->setStatus(404);
}

Components::render($root, 'layout/AppHeader', [
    'title' => $allowed ? '运营中心' : '无权访问',
    'noindex' => true,
]);
PageData::emit(PageData::operations());
Components::render($root, 'layout/AppFooter', []);
