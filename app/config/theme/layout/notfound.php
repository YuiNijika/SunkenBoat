<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '404 页面',
                'description' => '错误页提示、搜索与订阅入口。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'NotFound_Blocks',
                'value' => ['notfound', 'search'],
                'label' => '404 区块',
                'description' => '组合 404 页面的提示、搜索、引导按钮与链接列表。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => array_merge($commonBlocks, [
                    'notfound' => [
                        'label' => '404 提示',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '这里没有内容'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 3],
                            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案', 'placeholder' => '返回首页'],
                            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接', 'placeholder' => '留空使用站点首页'],
                        ],
                    ],
                    'search' => [
                        'label' => '站内搜索',
                        'variants' => ['default' => '标准', 'panel' => '卡片'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
                            ['type' => 'Text', 'name' => 'placeholder', 'label' => '输入框占位'],
                            ['type' => 'Text', 'name' => 'button_label', 'label' => '按钮文案'],
                        ],
                    ],
                    'cta' => [
                        'label' => '订阅提示',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 3],
                            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案'],
                            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接'],
                            ...$blockLayoutFields,
                        ],
                    ],
                ]),
            ],
                ],
];
