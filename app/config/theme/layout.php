<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '页面&显示',
    'tabs' => [
        'general' => require __DIR__ . '/layout/general.php',
        'loading' => require __DIR__ . '/layout/loading.php',
        'templates' => require __DIR__ . '/layout/templates.php',
        'home' => require __DIR__ . '/layout/home.php',
        'archive' => require __DIR__ . '/layout/archive.php',
        'post' => require __DIR__ . '/layout/post.php',
        'page' => require __DIR__ . '/layout/page.php',
        'notfound' => require __DIR__ . '/layout/notfound.php',
    ],
];
