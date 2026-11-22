<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '上传&媒体',
                'description' => '限制前台文章、论坛帖子、头像与背景图上传的图片大小。框架媒体接口本身上限为 5 MB。',
                'fields' => [
                    [
                        'type' => 'Number',
                        'name' => 'Upload_Article_Max_MB',
                        'value' => 5,
                        'inline' => true,
                        'label' => '文章图片上限（MB）',
                        'description' => '文章编辑器、文章评论与文章字段中的图片上传。',
                        'min' => 1,
                        'max' => 5,
                        'step' => 1,
                    ],
                    [
                        'type' => 'Number',
                        'name' => 'Upload_Topic_Max_MB',
                        'value' => 5,
                        'inline' => true,
                        'label' => '帖子图片上限（MB）',
                        'description' => '论坛帖子、回复与圈子图标中的图片上传。',
                        'min' => 1,
                        'max' => 5,
                        'step' => 1,
                    ],
                    [
                        'type' => 'Number',
                        'name' => 'Upload_Avatar_Max_MB',
                        'value' => 5,
                        'inline' => true,
                        'label' => '头像图片上限（MB）',
                        'description' => '用户中心头像上传，需启用更多资料。',
                        'min' => 1,
                        'max' => 5,
                        'step' => 1,
                    ],
                    [
                        'type' => 'Number',
                        'name' => 'Upload_Background_Max_MB',
                        'value' => 5,
                        'inline' => true,
                        'label' => '背景图/主题设置图片上限（MB）',
                        'description' => '个人主页背景图与后台主题设置中的图片上传。',
                        'min' => 1,
                        'max' => 5,
                        'step' => 1,
                    ],
                ],
];
