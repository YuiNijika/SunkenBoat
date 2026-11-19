<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use SunkenBoat\Support\Forum;
use TTDF\Framework;
use TTDF\View\Components;

$root = Framework::root();
$type = isset($_GET['type']) && is_scalar($_GET['type']) ? (string) $_GET['type'] : '';
$circle = isset($_GET['circle']) && is_scalar($_GET['circle']) ? (string) $_GET['circle'] : '';
$data = $type === 'forum-topic'
    ? Forum::editorPage($circle)
    : PageData::user('content', true);
$title = trim((string) ($data['title'] ?? '写文章'));

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
