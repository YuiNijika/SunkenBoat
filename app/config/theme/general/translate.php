<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '多语言翻译',
                'description' => '启用页面语言切换，访客可选择目标语言阅读内容。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Translate_Enabled',
                        'value' => false,
                        'label' => '启用网站多语言翻译',
                        'description' => '开启后，页头显示语言切换入口；原文始终保留，由访客主动切换。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Translate_Script',
                        'value' => 'https://res.zvo.cn/translate/translate.js',
                        'show_when' => ['Translate_Enabled' => true],
                        'label' => '翻译脚本地址',
                        'description' => '可填写 translate.js 的公开脚本地址；私有部署时填写对应的脚本地址。',
                    ],
                    [
                        'type' => 'Select',
                        'name' => 'Translate_Local',
                        'value' => 'chinese_simplified',
                        'inline' => true,
                        'show_when' => ['Translate_Enabled' => true],
                        'label' => '页面原文语言',
                        'options' => [
                            'chinese_simplified' => '简体中文',
                            'chinese_traditional' => '繁体中文',
                            'english' => '英语',
                            'japanese' => '日语',
                        ],
                    ],
                    [
                        'type' => 'Select',
                        'name' => 'Translate_Service',
                        'value' => 'client.edge',
                        'inline' => true,
                        'show_when' => ['Translate_Enabled' => true],
                        'label' => '翻译服务',
                        'description' => '公开边缘服务可直接使用；私有部署时选择自建翻译服务并填写对应脚本地址。',
                        'options' => [
                            'client.edge' => '公开边缘服务',
                            'translate.service' => '自建翻译服务',
                        ],
                    ],
                    [
                        'type' => 'Autocomplete',
                        'name' => 'Translate_Languages',
                        'value' => [
                            'english',
                            'chinese_traditional',
                            'japanese',
                            'korean',
                            'french',
                            'german',
                            'spanish',
                            'russian',
                        ],
                        'show_when' => ['Translate_Enabled' => true],
                        'label' => '可选语言',
                        'placeholder' => '搜索常用语言，或输入代码后回车添加',
                        'description' => '最多 16 种语言。可以从常用语言中选择，也可以直接输入 translate.js 支持的语言代码，例如 english、japanese、korean。',
                        'maxItems' => 16,
                        'options' => [
                            'english' => 'English',
                            'chinese_simplified' => '简体中文',
                            'chinese_traditional' => '繁體中文',
                            'japanese' => '日本語',
                            'korean' => '한국어',
                            'french' => 'Français',
                            'german' => 'Deutsch',
                            'spanish' => 'Español',
                            'russian' => 'Русский',
                            'portuguese' => 'Português',
                            'italian' => 'Italiano',
                            'arabic' => 'العربية',
                            'thai' => 'ไทย',
                            'vietnamese' => 'Tiếng Việt',
                            'indonesian' => 'Bahasa Indonesia',
                            'turkish' => 'Türkçe',
                        ],
                    ],
                ],
];
