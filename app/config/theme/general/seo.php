<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => 'SEO 设置',
                'description' => '统一页面标题、搜索摘要与社交分享元数据。',
                'fields' => [
                    [
                        'type' => 'Text',
                        'name' => 'Seo_Title_Separator',
                        'value' => '·',
                        'label' => '标题分隔符',
                        'description' => '用于页面标题与站点标题之间，例如 ·、-、|、—。留空时使用 ·。',
                    ],
                ],
];
