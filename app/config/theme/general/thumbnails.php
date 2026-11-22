<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '缩略图&封面',
                'description' => '列表卡片与首屏文章的缩略图来源。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Thumbnail_Use_First_Image',
                        'value' => true,
                        'label' => '未设置缩略图时取正文首图',
                        'description' => '文章或页面没有单独设置缩略图时，自动使用正文第一张图片。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'Thumbnail_Default',
                        'value' => '',
                        'media' => true,
                        'rows' => 3,
                        'label' => '默认缩略图',
                        'description' => '每行一个图片地址。未启用正文首图、正文没有图片或首图无法读取时，会从这些图片中随机选择一张；留空则使用主题内置占位图。',
                    ],
                ],
];
