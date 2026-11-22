<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '加载动画',
                'description' => 'React 初始化前显示加载层，避免服务端兜底内容闪现；脚本异常时会按设定时间自动显示页面。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Loader_Enabled',
                        'value' => true,
                        'label' => '启用加载动画',
                        'description' => '关闭后页面直接显示服务端兜底内容，React 就绪时再替换。',
                    ],
                    [
                        'type' => 'Select',
                        'name' => 'Loader_Style',
                        'value' => 'ring',
                        'show_when' => ['Loader_Enabled' => true],
                        'label' => '动画样式',
                        'options' => [
                            'ring' => '旋转圆环',
                            'dots' => '跳动圆点',
                            'bars' => '音柱律动',
                            'pulse' => '脉冲光环',
                            'orbit' => '轨道旋转',
                            'logo' => '站点 Logo 呼吸',
                        ],
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Loader_Text',
                        'value' => '正在加载…',
                        'show_when' => ['Loader_Enabled' => true],
                        'label' => '加载文案',
                        'description' => '留空时只显示动画图标。',
                    ],
                    [
                        'type' => 'Number',
                        'name' => 'Loader_Timeout',
                        'value' => 12,
                        'show_when' => ['Loader_Enabled' => true],
                        'label' => '超时自动显示（秒）',
                        'description' => 'React 脚本加载失败时，等待该时间后自动淡出并展示页面内容。',
                        'min' => 3,
                        'max' => 60,
                        'step' => 1,
                    ],
                ],
];
