<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '权限&互动',
                'description' => '谁可以创建圈子、发帖、回复与加入圈子。',
                'fields' => [
                    [
                        'type' => 'Select',
                        'name' => 'Forum_Circle_Group',
                        'value' => 'administrator',
                        'inline' => true,
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
                        'inline' => true,
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
                        'name' => 'Forum_Allow_Reply',
                        'value' => true,
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '允许登录用户回复',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'Forum_Allow_Join',
                        'value' => true,
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '允许加入圈子',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Forum_Follow_Label',
                        'value' => '关注',
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '关注名称',
                        'placeholder' => '关注',
                        'description' => '可改为“加入”“入驻”“订阅”等；会同步用于按钮与关注后的提示。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'Forum_Join_To_View',
                        'value' => false,
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '关注后才能查看板块',
                        'description' => '开启后，未关注圈子的访客与用户看不到圈子帖子；圈主与管理团队不受限制。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'Forum_Join_To_Post',
                        'value' => false,
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '关注后才能发帖',
                        'description' => '开启后，用户必须先关注圈子才能发布帖子；圈主与管理团队不受限制。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'Forum_Allow_Reactions',
                        'value' => true,
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '允许点赞与收藏',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'Forum_Quick_Reply',
                        'value' => true,
                        'inline' => true,
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '启用快捷回复',
                        'description' => '在帖子回复框旁显示快捷回复面板，用户可一键插入常用短语。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'Forum_Quick_Reply_Items',
                        'value' => "感谢分享，这个思路很有启发。\n我也遇到过类似情况，先检查一下配置和日志。\n建议贴上相关代码或报错信息，方便大家排查。\n同意这个观点，补充一点实际使用体验。\n已收藏，回头按这个步骤试试。\n欢迎继续补充，期待后续更新。",
                        'rows' => 6,
                        'show_when' => ['Forum_Switch' => true, 'Forum_Quick_Reply' => true],
                        'label' => '系统快捷短语',
                        'description' => '每行一条，最多 20 条。用户端还会保留自己最近使用的短语。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Forum_Report_Email',
                        'value' => '',
                        'show_when' => ['Forum_Switch' => true],
                        'label' => '举报联系邮箱',
                        'placeholder' => 'admin@example.com',
                        'description' => '填写后帖子页会显示举报入口；留空则隐藏。',
                    ],
                ],
];
