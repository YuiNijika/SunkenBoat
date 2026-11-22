<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '下载&订单',
    'tabs' => [
        'downloads' => require __DIR__ . '/download/downloads.php',
    ],
];
