<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 文章与页面的“允许评论”直接使用 Typecho 原生 allowComment 字段，
 * 不再重复声明；关闭后 PageData 不会输出 comments 区块。
 */
return [
    [
        'type' => 'Text',
        'name' => 'Thumbnail',
        'value' => '',
        'media' => true,
        'label' => '缩略图',
        'description' => '填写图片地址或从媒体库选择；留空时按主题设置使用正文首图或默认缩略图。',
    ],
    [
        'type' => 'Select',
        'name' => 'Display_Layout',
        'value' => 'default',
        'label' => '正文布局',
        'description' => '标准沿用默认宽度；宽屏占满内容区；窄屏适合长文阅读。',
        'options' => [
            'default' => '标准',
            'wide' => '宽屏',
            'narrow' => '窄屏',
        ],
    ],
    [
        'type' => 'Select',
        'name' => 'Download_Enabled',
        'value' => '0',
        'label' => '启用下载',
        'description' => '为本篇文章添加下载资源，需先在主题设置中启用下载。',
        'options' => [
            '0' => '关闭',
            '1' => '开启',
        ],
    ],
    [
        'type' => 'Text',
        'name' => 'Download_Url',
        'value' => '',
        'label' => '下载链接',
        'description' => '填写 http(s) 下载地址；用户领取或付款后可获取链接。',
        'attributes' => [
            'placeholder' => 'https://example.com/file.zip',
            'maxlength' => '2000',
        ],
    ],
    [
        'type' => 'Select',
        'name' => 'Download_Paid',
        'value' => '0',
        'label' => '启用付费下载',
        'description' => '需先在主题设置中启用付费下载&完成收款配置。',
        'options' => [
            '0' => '免费下载',
            '1' => '付费下载',
        ],
    ],
    [
        'type' => 'Text',
        'name' => 'Download_Price',
        'value' => '1.00',
        'label' => '付费金额（元）',
        'description' => '仅付费下载时生效，最低 0.01 元。',
        'attributes' => [
            'type' => 'number',
            'min' => '0.01',
            'max' => '999999.99',
            'step' => '0.01',
        ],
    ]
];
