<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '下载&支付',
    'tabs' => [
        'payment' => require __DIR__ . '/payment/payment.php',
        'economy' => require __DIR__ . '/payment/economy.php',
    ],
];
