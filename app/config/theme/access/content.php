<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '内容&发布',
    'description' => '文章评论与前台投稿的访问条件。论坛相关权限统一放在「圈子&互动」。',
    'fields' => [
        [
            'type' => 'Select',
            'name' => 'User_Article_Group',
            'value' => 'editor',
            'label' => '前台发布文章权限',
            'description' => '控制哪些用户组可以进入用户中心的内容管理并发布文章；同时影响前台编辑器入口、文章管理接口与媒体上传入口。',
            'options' => [
                'editor' => '编辑及以上',
                'administrator' => '仅管理员',
            ],
        ],
        [
            'type' => 'Switch',
            'name' => 'Comments_Require_Login',
            'value' => false,
            'label' => '文章评论需要登录',
            'description' => '仅作用于文章与独立页面；论坛回复始终要求登录。开启后未登录读者仍可查看评论，但不能提交。',
        ],
    ],
];
