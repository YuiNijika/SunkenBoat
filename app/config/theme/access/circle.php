<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '圈子&互动',
    'description' => '圈子创建、帖子发布、回复、加入与互动权限。论坛关闭时这些设置不生效。',
    'fields' => [
        [
            'type' => 'Select',
            'name' => 'Forum_Circle_Group',
            'value' => 'administrator',
            'show_when' => ['Forum_Switch' => true],
            'label' => '创建圈子权限',
            'options' => [
                'administrator' => '仅管理员',
                'editor' => '编辑及以上',
            ],
        ],
        [
            'type' => 'Select',
            'name' => 'Forum_Topic_Group',
            'value' => 'subscriber',
            'show_when' => ['Forum_Switch' => true],
            'label' => '发布帖子权限',
            'options' => [
                'subscriber' => '登录用户',
                'contributor' => '贡献者及以上',
                'editor' => '编辑及以上',
                'administrator' => '仅管理员',
            ],
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Topic_Review',
            'value' => false,
            'show_when' => ['Forum_Switch' => true],
            'label' => '普通用户发帖先审核',
            'description' => '开启后，普通用户发布的新帖进入待审核；管理员与编辑发布的内容直接公开。',
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Allow_Reply',
            'value' => true,
            'show_when' => ['Forum_Switch' => true],
            'label' => '允许登录用户回复',
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Allow_Join',
            'value' => true,
            'show_when' => ['Forum_Switch' => true],
            'label' => '允许用户加入圈子',
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Join_To_View',
            'value' => false,
            'show_when' => ['Forum_Switch' => true],
            'label' => '加入圈子后才能查看内容',
            'description' => '未加入圈子的访客与普通用户看不到帖子；圈主与管理团队不受限制。',
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Join_To_Post',
            'value' => false,
            'show_when' => ['Forum_Switch' => true],
            'label' => '加入圈子后才能发帖',
            'description' => '用户必须先加入圈子才能发布帖子；圈主与管理团队不受限制。',
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Allow_Reactions',
            'value' => true,
            'show_when' => ['Forum_Switch' => true],
            'label' => '允许点赞、收藏与评分',
        ],
    ],
];
