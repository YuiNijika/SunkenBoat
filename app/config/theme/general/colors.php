<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '主题配色',
                'description' => '浅色与深色模式下的主题色和页面底色。',
                'fields' => [
                    [
                        'type' => 'Select',
                        'name' => 'Color_Mode',
                        'value' => 'auto',
                        'label' => '默认配色',
                        'description' => '访客首次访问时使用的配色。页头右上角可随时切换，之后访问会沿用上次选择。',
                        'options' => [
                            'auto' => '跟随系统',
                            'light' => '浅色',
                            'dark' => '深色',
                        ],
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Accent',
                        'value' => '#2563eb',
                        'inline' => true,
                        'label' => '浅色模式主色',
                        'description' => '按钮、链接与强调元素；留空使用主题默认色。',
                        'predefine' => ['#2563eb', '#0f9d58', '#7c5cff', '#e0435c', '#b45309', '#0e7490'],
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Accent_Dark',
                        'value' => '#7d9bff',
                        'inline' => true,
                        'label' => '深色模式主色',
                        'description' => '深色模式下的按钮、链接与强调元素；留空使用主题默认色。',
                        'predefine' => ['#7d9bff', '#8ab4ff', '#b39dff', '#ff8fa3', '#ffb26b', '#7bd88f'],
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Background',
                        'value' => '#f5f6f7',
                        'inline' => true,
                        'label' => '浅色模式背景',
                        'description' => '页面底色；留空使用主题默认色。',
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Background_Dark',
                        'value' => '#15171c',
                        'inline' => true,
                        'label' => '深色模式背景',
                        'description' => '深色模式下的页面底色；留空使用主题默认色。',
                    ],
                ],
];
