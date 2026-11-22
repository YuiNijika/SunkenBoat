<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '全局&功能',
    'tabs' => [
        'general' => require __DIR__ . '/general/general.php',
        'seo' => require __DIR__ . '/general/seo.php',
        'navigation' => require __DIR__ . '/general/navigation.php',
        'share' => require __DIR__ . '/general/share.php',
        'translate' => require __DIR__ . '/general/translate.php',
        'uploads' => require __DIR__ . '/general/uploads.php',
        'colors' => require __DIR__ . '/general/colors.php',
        'thumbnails' => require __DIR__ . '/general/thumbnails.php',
    ],
];
