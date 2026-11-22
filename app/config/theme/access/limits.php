<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '下载&额度',
    'description' => '面向登录用户的免费额度；付费下载与支付渠道仍在「下载」和「支付」分组配置。',
    'fields' => [
        [
            'type' => 'Number',
            'name' => 'Downloads_Free_Daily_Limit',
            'value' => 3,
            'show_when' => ['Downloads_Enabled' => true],
            'label' => '每日免费下载次数',
            'description' => '每位用户每天可免费领取的次数，文章与帖子共用。',
            'min' => 0,
            'max' => 999,
            'step' => 1,
        ],
    ],
];
