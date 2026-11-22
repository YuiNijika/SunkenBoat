<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '用户设置',
                'description' => '前台用户中心入口与账号相关功能。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Show_UserCenter',
                        'value' => false,
                        'inline' => true,
                        'implies' => [
                            'RESTAPI_Switch' => true,
                            'RESTV2_Switch' => true,
                        ],
                        'label' => '启用前台用户中心',
                        'description' => '默认关闭。开启后页头显示用户入口并启用 /user/* 路由，同时自动启用 REST API 总开关与 v2 写接口。注册入口还受 Typecho 后台“是否允许注册”控制。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'User_Center_Enhanced',
                        'value' => false,
                        'inline' => true,
                        'show_when' => ['Show_UserCenter' => true],
                        'label' => '启用更多资料',
                        'description' => '默认关闭。开启后，前台用户中心会显示头像上传、个性签名、性别、隐私设置、居住地和手机号绑定；关闭后只保留昵称、邮箱等基础资料。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'User_Certification',
                        'value' => false,
                        'inline' => true,
                        'show_when' => [
                            'Show_UserCenter' => true,
                            'User_Center_Enhanced' => true,
                        ],
                        'label' => '启用认证模式',
                        'description' => '默认关闭。启用后，用户在完善更多资料的基础上可以提交个人或组织认证，管理员审核通过后在个人空间展示认证徽章。',
                    ],
                    [
                        'type' => 'Select',
                        'name' => 'User_Article_Group',
                        'value' => 'editor',
                        'inline' => true,
                        'label' => '前台发布文章权限',
                        'description' => '控制哪些用户组可以进入用户中心的内容管理并发布文章。该选项同时影响前台编辑器入口、文章管理接口和媒体上传入口。',
                        'options' => [
                            'editor' => '编辑及以上',
                            'administrator' => '仅管理员',
                        ],
                    ],
                    [
                        'type' => 'Select',
                        'name' => 'Avatar_Source',
                        'value' => 'gravatar',
                        'inline' => true,
                        'label' => '头像源',
                        'description' => '用户没有设置自定义头像时，评论区和用户中心使用这里选择的头像服务。',
                        'options' => [
                            'gravatar' => 'Gravatar',
                            'weavatar' => 'WeAvatar',
                            'cravatar' => 'Cravatar',
                            'loli' => 'Loli Gravatar',
                            'sep' => 'Sep.cc',
                            'geekzu' => '极客族',
                            'v2ex' => 'V2EX',
                            'custom' => '自定义',
                        ],
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Avatar_Custom_Base',
                        'value' => '',
                        'show_when' => ['Avatar_Source' => 'custom'],
                        'label' => '自定义头像地址',
                        'placeholder' => 'https://example.com/avatar/',
                        'description' => '填写头像服务地址前缀，系统会自动拼接邮箱哈希和尺寸参数。',
                    ],
                ],
];
