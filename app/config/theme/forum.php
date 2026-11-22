<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '论坛&圈子',
    'tabs' => [
        'general' => require __DIR__ . '/forum/general.php',
        'access' => require __DIR__ . '/forum/access.php',
        'layout' => require __DIR__ . '/forum/layout.php',
    ],
];
