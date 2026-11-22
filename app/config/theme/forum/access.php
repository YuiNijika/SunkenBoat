<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'title' => '互动&文案',
    'description' => '关注按钮名称、快捷回复与举报入口。访问权限请到「权限设置 - 圈子&互动」统一管理。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'Forum_Follow_Label',
            'value' => '关注',
            'show_when' => ['Forum_Switch' => true],
            'label' => '关注名称',
            'placeholder' => '关注',
            'description' => '可改为“加入”“入驻”“订阅”等；会同步用于按钮、提示与圈子状态文案。',
        ],
        [
            'type' => 'Switch',
            'name' => 'Forum_Quick_Reply',
            'value' => true,
            'show_when' => ['Forum_Switch' => true],
            'label' => '启用快捷回复',
            'description' => '在帖子回复框旁显示快捷短语面板，用户可一键插入常用内容。',
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
