<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '运行&扩展',
    'tabs' => [
        'general' => require __DIR__ . '/runtime/general.php',
        'rest' => require __DIR__ . '/runtime/rest.php',
    ],
];
