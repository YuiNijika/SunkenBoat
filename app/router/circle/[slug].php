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
$slug = isset($params['slug']) && is_scalar($params['slug']) ? (string) $params['slug'] : '';
$data = Forum::circlePage($slug);
$title = trim((string) ($data['title'] ?? '圈子'));

if (($data['kind'] ?? '') === '404' && class_exists('Typecho\\Response')) {
    \Typecho\Response::getInstance()->setStatus(404);
}

Components::render($root, 'layout/AppHeader', [
    'title' => $title,
    'canonical' => (string) ($data['canonical'] ?? ''),
    'description' => (string) ($data['description'] ?? ''),
]);
PageData::emit($data);
Components::render($root, 'layout/AppFooter', []);
