<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '接口&安全',
                'description' => '接口访问、跨域与登录凭证。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'RESTAPI_Switch',
                        'value' => false,
                        'group' => 'rest',
                        'label' => 'REST API 总开关',
                        'description' => '同时控制公开只读接口和完整写接口。关闭后仅保留管理员后台使用的接口；启用前台用户中心时会自动开启。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'CORS_Origins',
                        'value' => '',
                        'group' => 'rest',
                        'label' => 'CORS 白名单',
                        'description' => '每行一个允许访问的站点地址，例如 https://example.com。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'REST_Token_Switch',
                        'value' => false,
                        'group' => 'rest',
                        'inline' => true,
                        'label' => '启用公开 REST Token',
                        'description' => '开启后，公开只读接口必须携带 Token。管理员后台接口不受影响。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'RESTV2_Switch',
                        'value' => false,
                        'group' => 'rest',
                        'inline' => true,
                        'label' => '启用 v2 写接口',
                        'description' => '仅在 API 总开关开启后生效。开启后可使用登录、评论和内容管理功能；启用前台用户中心时会自动开启。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'REST_Token_Env',
                        'value' => 'TTDF_REST_TOKEN',
                        'group' => 'rest',
                        'show_when' => ['REST_Token_Switch' => true],
                        'label' => '公共 REST Token 环境变量名',
                        'description' => '这里填写环境变量名，不是 Token 本身。变量值至少 32 个字符；未配置时公开接口不可用。',
                    ],
                    [
                        'type' => 'Number',
                        'name' => 'RESTV2_Token_TTL',
                        'value' => 604800,
                        'group' => 'rest',
                        'show_when' => ['RESTV2_Switch' => true],
                        'label' => 'v2 登录凭证有效期（秒）',
                        'description' => '登录后签发的访问凭证有效时长，最少 300 秒、最多 2592000 秒（30 天）；留 0 使用默认 7 天。',
                        'min' => 0,
                        'max' => 2592000,
                        'step' => 3600,
                    ],
                ],
];
