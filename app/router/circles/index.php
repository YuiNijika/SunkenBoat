<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\Forum;
use SunkenBoat\Support\PageData;
use TTDF\Framework;
use TTDF\View\Components;

$root = Framework::root();
$data = Forum::homePage();
$title = trim((string) ($data['title'] ?? '圈子广场'));

if (($data['kind'] ?? '') === '404' && class_exists('Typecho\\Response')) {
    \Typecho\Response::getInstance()->setStatus(404);
}

Components::render($root, 'layout/AppHeader', [
    'title' => $title,
    'noindex' => ($data['kind'] ?? '') === '404',
    'canonical' => (string) ($data['canonical'] ?? ''),
    'description' => (string) ($data['description'] ?? ''),
]);
PageData::emit($data);
Components::render($root, 'layout/AppFooter', []);
