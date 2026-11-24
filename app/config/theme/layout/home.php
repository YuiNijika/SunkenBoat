<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '首页',
                'description' => '首页首屏、轮播、文章列表与分类区块。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Home_Blocks',
                'value' => ['hero', 'carousel', 'post-list:list', 'categories'],
                'label' => '首页区块',
                'description' => '拖动左侧手柄调整顺序；展开箭头可补写区块标题与文案。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => array_merge($commonBlocks, [
                    'hero' => $heroBlockOption,
                    'post-list' => [
                        'label' => '文章列表',
                        'variants' => [
                            'list' => '横向卡片',
                            'grid' => '网格卡片',
                            'masonry' => '瀑布流',
                            'feature' => '头条 + 侧栏',
                            'showcase' => '三列头条',
                            'split' => '列表 + 推荐',
                            'headline' => '纯标题三栏',
                            'compact' => '紧凑列表',
                            'mixed' => '混合密度资讯流',
                        ],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用默认标题'],
                            ['type' => 'Category', 'name' => 'category', 'label' => '限定分类', 'placeholder' => '全部分类'],
                            [
                                'type' => 'Select',
                                'name' => 'source',
                                'label' => '内容来源',
                                'value' => 'articles',
                                'options' => [
                                    'articles' => '站点文章',
                                    'forum' => '圈子帖子',
                                    'mixed' => '文章与圈子帖子混合',
                                ],
                                'description' => '圈子来源仅在启用论坛后生效；混合模式会按发布时间倒序排列。',
                            ],
                            [
                                'type' => 'Select',
                                'name' => 'order',
                                'label' => '内容排序',
                                'value' => 'latest',
                                'options' => [
                                    'latest' => '最新发布',
                                    'random' => '随机内容',
                                ],
                                'description' => '随机内容每次访问都会重新抽取，并自动隐藏分页。',
                            ],
                            [
                                'type' => 'Text',
                                'name' => 'forum_circle',
                                'label' => '限定圈子',
                                'placeholder' => '圈子 slug，留空显示全部圈子',
                                'description' => '仅对圈子帖子与混合来源生效。',
                            ],
                            ['type' => 'Text', 'name' => 'empty', 'label' => '空状态文案', 'placeholder' => '这里还没有文章。'],
                            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 6, 'min' => 0, 'max' => 30, 'step' => 1, 'description' => '0 表示不限制。'],
                            [
                                'type' => 'Select',
                                'name' => 'columns',
                                'label' => '网格列数',
                                'value' => '0',
                                'options' => [
                                    '0' => '跟随模板',
                                    '2' => '两列',
                                    '3' => '三列',
                                    '4' => '四列',
                                    '5' => '五列',
                                ],
                            ],
                            ['type' => 'Switch', 'name' => 'show_pagination', 'label' => '显示分页', 'value' => false],
                            ...$blockLayoutFields,
                        ],
                    ],
                    'carousel' => $carouselBlockOption,
                    'categories' => [
                        'label' => '分类导航',
                        'variants' => ['grid' => '卡片', 'chips' => '标签'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '分类'],
                            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 0, 'min' => 0, 'max' => 24, 'step' => 1, 'description' => '0 表示全部。'],
                            [
                                'type' => 'Select',
                                'name' => 'columns',
                                'label' => '每行列数',
                                'value' => '0',
                                'options' => [
                                    '0' => '跟随模板',
                                    '2' => '两列',
                                    '3' => '三列',
                                    '4' => '四列',
                                    '5' => '五列',
                                ],
                            ],
                            ...$blockLayoutFields,
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
