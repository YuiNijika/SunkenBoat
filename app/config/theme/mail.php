<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '用户&邮件',
    'tabs' => [
        'user' => require __DIR__ . '/mail/user.php',
        'smtp' => require __DIR__ . '/mail/smtp.php',
        'sms' => require __DIR__ . '/mail/sms.php',
        'captcha' => require __DIR__ . '/mail/captcha.php',
        'oauth' => require __DIR__ . '/mail/oauth.php',
    ],
];
