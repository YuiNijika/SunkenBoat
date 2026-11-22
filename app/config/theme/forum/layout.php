<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '模块&布局',
                'description' => '圈子广场、圈子内页与帖子页都使用区块组合；左侧、正文与右侧分别排序。',
                'fields' => [
                    [
                        'type' => 'Blocks',
                        'name' => 'Forum_Home_Blocks',
                        'value' => ['forum-home-header', 'forum-circle-grid', 'forum-topic-list'],
                        'label' => '圈子广场主内容',
                        'description' => '决定 /circles 正文区的模块顺序。',
                        'placeholder' => '选择圈子广场模块…',
                        'reorder' => ['drag', 'buttons'],
                        'show_when' => ['Forum_Switch' => true],
                        'options' => $forumHomeMainOptions,
                    ],
                    [
                        'type' => 'Blocks',
                        'name' => 'Forum_Home_Left_Blocks',
                        'value' => ['forum-create', 'forum-circle-list', 'forum-notice', 'forum-authors'],
                        'label' => '圈子广场左侧模块',
                        'description' => '桌面端显示在正文左侧；移动端排在正文之后。',
                        'placeholder' => '选择左侧模块…',
                        'reorder' => ['drag', 'buttons'],
                        'show_when' => ['Forum_Switch' => true],
                        'options' => $forumLeftOptions,
                    ],
                    [
                        'type' => 'Blocks',
                        'name' => 'Forum_Home_Right_Blocks',
                        'value' => ['forum-stats', 'forum-hot-circles', 'forum-hot-topics'],
                        'label' => '圈子广场右侧模块',
                        'description' => '桌面端显示在正文右侧；留空即自动变成两栏或单栏布局。',
                        'placeholder' => '选择右侧模块…',
                        'reorder' => ['drag', 'buttons'],
                        'show_when' => ['Forum_Switch' => true],
                        'options' => array_merge($forumRightOptions, $forumLeftOptions),
                    ],
                    [
                        'type' => 'Blocks',
                        'name' => 'Forum_Circle_Blocks',
                        'value' => ['forum-circle-hero', 'forum-topic-list'],
                        'label' => '圈子内页主内容',
                        'description' => '决定 /circle/{slug} 正文区的模块顺序。',
                        'placeholder' => '选择圈子内页模块…',
                        'reorder' => ['drag', 'buttons'],
                        'show_when' => ['Forum_Switch' => true],
                        'options' => $forumCircleMainOptions,
                    ],
                    [
                        'type' => 'Blocks',
                        'name' => 'Forum_Circle_Left_Blocks',
                        'value' => ['forum-circle-info', 'forum-notice', 'forum-stats'],
                        'label' => '圈子内页左侧模块',
                        'description' => '显示圈子简介、公告与数据；可按需替换为其他圈子模块。',
                        'placeholder' => '选择左侧模块…',
                        'reorder' => ['drag', 'buttons'],
                        'show_when' => ['Forum_Switch' => true],
                        'options' => $forumLeftOptions,
                    ],
                    [
                        'type' => 'Blocks',
                        'name' => 'Forum_Circle_Right_Blocks',
                        'value' => ['forum-hot-circles', 'forum-hot-topics'],
                        'label' => '圈子内页右侧模块',
                        'description' => '留空后正文会自动占满剩余宽度。',
                        'placeholder' => '选择右侧模块…',
                        'reorder' => ['drag', 'buttons'],
                        'show_when' => ['Forum_Switch' => true],
                        'options' => array_merge($forumRightOptions, $forumLeftOptions),
                    ],
                ],
];
