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
        'type' => 'Text',
        'name' => 'TTDF_Fields_Text',
        'value' => '',
        'label' => '文本框',
        'description' => '示例字段，可替换为业务字段。',
    ],
    [
        'type' => 'Textarea',
        'name' => 'TTDF_Fields_Textarea',
        'value' => '',
        'label' => '文本域',
        'description' => '示例字段，可替换为业务字段。',
        'attributes' => [
            'style' => 'height: 100px;',
        ],
    ],
    [
        'type' => 'Select',
        'name' => 'TTDF_Fields_Select',
        'value' => '',
        'label' => '下拉框',
        'description' => '示例字段，可替换为业务字段。',
        'options' => [
            'option1' => '选项一',
            'option2' => '选项二',
        ],
    ],
];
