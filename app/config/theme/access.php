<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '权限设置',
    'tabs' => [
        'content' => require __DIR__ . '/access/content.php',
        'circle' => require __DIR__ . '/access/circle.php',
    ],
];
