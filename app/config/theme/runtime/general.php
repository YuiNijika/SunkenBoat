<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '调试&资源',
                'description' => '调试与静态资源。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Debug_Switch',
                        'value' => false,
                        'label' => '调试模式',
                        'description' => '开启后显示详细错误信息，便于排查；正式站点建议关闭。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Assets_CDN',
                        'value' => '',
                        'label' => '静态资源 CDN',
                        'description' => '留空使用主题本地资源；仅支持 http(s) 地址，非法地址会自动回退。',
                    ],
                ],
];
