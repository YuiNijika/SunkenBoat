<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '导航设置',
                'description' => '页头标题与自定义导航。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Show_Title',
                        'value' => true,
                        'inline' => true,
                        'label' => '显示站点标题',
                        'description' => '关闭后页头只显示 Logo；没有设置 Logo 时仍会显示站点标题，避免导航无法识别站点。',
                    ],
                    [
                        'type' => 'Nav',
                        'name' => 'Nav_Items',
                        'value' => [],
                        'label' => '自定义导航',
                        'description' => '最多 12 个一级导航、每项最多 8 个二级导航。留空时自动使用首页与 Typecho 独立页面。链接支持 https://、以 / 开头的站内路径和 # 锚点；图标填写 Lucide 图标名，例如 home、file-text、message-square。',
                    ],
                ],
];
