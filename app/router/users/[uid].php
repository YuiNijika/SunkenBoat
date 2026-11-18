<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use SunkenBoat\Support\PageData;
use TTDF\Framework;
use TTDF\View\Components;

$root = Framework::root();
$uid = isset($params['uid']) && is_scalar($params['uid']) ? (int) $params['uid'] : 0;
$data = PageData::space($uid);
$title = trim((string) ($data['title'] ?? ''));
if ($title === '') {
    $title = '用户空间';
}

if (($data['kind'] ?? '') === '404') {
    if (class_exists('Typecho\\Response')) {
        \Typecho\Response::getInstance()->setStatus(404);
    }
}

Components::render($root, 'layout/AppHeader', ['title' => $title]);
PageData::emit($data);
Components::render($root, 'layout/AppFooter', []);
