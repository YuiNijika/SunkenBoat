<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '独立页面',
                'description' => '独立页面标题、正文与评论区块。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Page_Blocks',
                'value' => ['page-header', 'prose', 'comments'],
                'label' => '独立页面区块',
                'description' => '组合独立页面的标题、正文与评论区。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => array_merge($commonBlocks, [
                    'page-header' => [
                        'label' => '页面标题',
                        'variants' => ['default' => '标准', 'compact' => '紧凑'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
                        ],
                    ],
                    'prose' => [
                        'label' => '正文内容',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'toc_title', 'label' => '目录标题', 'placeholder' => '本页目录'],
                        ],
                    ],
                    'hero' => $heroBlockOption,
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
