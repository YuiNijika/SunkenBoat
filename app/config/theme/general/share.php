<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '分享设置',
                'description' => '控制帖子与文章页的分享入口；关闭后只保留复制链接。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Share_Enabled',
                        'value' => true,
                        'label' => '启用分享功能',
                    ],
                    [
                        'type' => 'Checkbox',
                        'name' => 'Share_Items',
                        'value' => ['qzone', 'weibo', 'qq', 'x', 'reddit', 'facebook', 'copy'],
                        'show_when' => ['Share_Enabled' => true],
                        'label' => '启用的分享渠道',
                        'options' => [
                            'qzone' => 'QQ 空间',
                            'weibo' => '微博',
                            'qq' => 'QQ 好友',
                            'x' => 'X / Twitter',
                            'reddit' => 'Reddit',
                            'facebook' => 'Facebook',
                            'telegram' => 'Telegram',
                            'copy' => '复制链接',
                            'native' => '系统分享',
                            'poster' => '海报分享',
                        ],
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Share_Poster_Brand',
                        'value' => '',
                        'show_when' => ['Share_Enabled' => true],
                        'label' => '海报品牌名',
                        'placeholder' => '留空使用站点标题',
                        'description' => '仅“海报分享”生成图片时使用。',
                    ],
                ],
];
