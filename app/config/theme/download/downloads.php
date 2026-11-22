<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '下载设置',
                'description' => '文章与帖子的资源下载范围、免费额度与记录。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Downloads_Enabled',
                        'value' => false,
                        'label' => '启用下载',
                        'description' => '开启后，可为文章&帖子添加下载资源；用户登录后可领取，并在下载记录中查看订单。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Downloads_Free_Daily_Limit',
                        'value' => '3',
                        'show_when' => ['Downloads_Enabled' => true],
                        'label' => '每日免费下载次数',
                        'description' => '每位用户每天可免费下载的次数，文章&帖子共用；填写 0 表示不限次数。',
                        'placeholder' => '3',
                    ],
                ],
];
