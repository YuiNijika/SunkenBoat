<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '下载设置',
                'description' => '文章与帖子的下载入口、付费下载与订单记录；每日免费额度在「权限设置 - 下载&额度」中配置。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Downloads_Enabled',
                        'value' => false,
                        'label' => '启用下载',
                        'description' => '开启后，可为文章&帖子添加下载资源；用户登录后可领取，并在下载记录中查看订单。',
                    ],
                ],
];
