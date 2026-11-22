<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '文章',
                'description' => '文章正文、标签、前后文章与评论区块。',
                'fields' => [
            [
                'type' => 'Select',
                'name' => 'Post_Time_Mode',
                'value' => 'published',
                'label' => '文章时间显示',
                'description' => '文章页头部展示的日期来源。',
                'options' => [
                    'published' => '发布时间',
                    'updated' => '更新时间',
                ],
            ],
            [
                'type' => 'Blocks',
                'name' => 'Post_Blocks',
                'value' => ['prose', 'tags', 'post-nav', 'comments'],
                'label' => '文章区块',
                'description' => '组合文章页的正文、标签、上一篇/下一篇与评论区。标题、分类、作者、日期和正文会显示在同一张内容卡片中。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => array_merge($commonBlocks, [
                    'prose' => [
                        'label' => '正文内容',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'toc_title', 'label' => '目录标题', 'placeholder' => '本页目录'],
                        ],
                    ],
                    'tags' => [
                        'label' => '标签',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '标签'],
                        ],
                    ],
                    'post-author' => [
                        'label' => '作者信息与作者文章',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '作者的其他文章'],
                            ['type' => 'Switch', 'name' => 'show_author', 'label' => '显示作者信息卡', 'value' => true],
                            ['type' => 'Switch', 'name' => 'show_posts', 'label' => '显示作者近期文章', 'value' => true],
                            ['type' => 'Number', 'name' => 'limit', 'label' => '作者文章数量', 'value' => 4, 'min' => 1, 'max' => 8, 'step' => 1],
                            ...$blockLayoutFields,
                        ],
                    ],
                    'post-nav' => ['label' => '前后文章'],
                    'comments' => [
                        'label' => '评论区',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '评论'],
                        ],
                    ],
                ]),
            ],
                ],
];
