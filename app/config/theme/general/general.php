<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '站点信息',
                'description' => '站点标识、副标题与页脚文案。',
                'fields' => [
                    [
                        'type' => 'Media',
                        'name' => 'Logo',
                        'value' => Assets::url('img/favicon.svg'),
                        'label' => '站点 Logo',
                        'description' => '从媒体库选择图片；留空时显示站点标题。',
                        'aliases' => ['logoUrl'],
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'SubTitle',
                        'value' => '由 沉舟主题·SunkenBoat 强力驱动',
                        'label' => '副标题',
                        'description' => '显示在站点标题下方，留空则不显示。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'FooterText',
                        'value' => '',
                        'label' => '页脚文本',
                        'description' => '仅支持纯文本。',
                    ],
                ],
];
