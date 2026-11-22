<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '支付设置',
                'description' => '支付服务与下载、充值等场景共用同一套收款配置。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Downloads_Payment_Enabled',
                        'value' => false,
                        'label' => '启用支付服务',
                        'description' => '开启后，付费下载与其他需要收款的功能可以使用支付网关或账户余额结算。',
                    ],
                    [
                        'type' => 'Accordion',
                        'name' => 'Downloads_Payment_Channels',
                        'value' => [],
                        'show_when' => ['Downloads_Payment_Enabled' => true],
                        'label' => '付款方式',
                        'description' => '展开需要的付款方式后分别配置。可同时启用多种方式，结算页会按渠道展示付款入口。',
                        'options' => [
                            'alipay' => [
                                'label' => '支付宝',
                                'description' => '通过易支付兼容网关收取支付宝付款。',
                                'fields' => [
                                    [
                                        'type' => 'Switch',
                                        'name' => 'enabled',
                                        'value' => false,
                                        'label' => '启用支付宝',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'gateway',
                                        'value' => '',
                                        'label' => '网关地址',
                                        'description' => '填写兼容易支付的收款平台地址，需以 https:// 开头。',
                                        'placeholder' => 'https://pay.example.com/',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'merchant_id',
                                        'value' => '',
                                        'label' => '商户 ID',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'key_env',
                                        'value' => 'SUNKEN_PAY_KEY',
                                        'label' => '密钥环境变量',
                                        'description' => '填写环境变量名，实际密钥请在站点运行环境中配置。',
                                    ],
                                ],
                            ],
                            'wxpay' => [
                                'label' => '微信支付',
                                'description' => '通过易支付兼容网关收取微信付款。',
                                'fields' => [
                                    [
                                        'type' => 'Switch',
                                        'name' => 'enabled',
                                        'value' => false,
                                        'label' => '启用微信支付',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'gateway',
                                        'value' => '',
                                        'label' => '网关地址',
                                        'description' => '填写兼容易支付的收款平台地址，需以 https:// 开头。',
                                        'placeholder' => 'https://pay.example.com/',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'merchant_id',
                                        'value' => '',
                                        'label' => '商户 ID',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'key_env',
                                        'value' => 'SUNKEN_PAY_KEY',
                                        'label' => '密钥环境变量',
                                        'description' => '填写环境变量名，实际密钥请在站点运行环境中配置。',
                                    ],
                                ],
                            ],
                            'qqpay' => [
                                'label' => 'QQ 钱包',
                                'description' => '通过易支付兼容网关收取 QQ 钱包付款。',
                                'fields' => [
                                    [
                                        'type' => 'Switch',
                                        'name' => 'enabled',
                                        'value' => false,
                                        'label' => '启用 QQ 钱包',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'gateway',
                                        'value' => '',
                                        'label' => '网关地址',
                                        'description' => '填写兼容易支付的收款平台地址，需以 https:// 开头。',
                                        'placeholder' => 'https://pay.example.com/',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'merchant_id',
                                        'value' => '',
                                        'label' => '商户 ID',
                                    ],
                                    [
                                        'type' => 'Text',
                                        'name' => 'key_env',
                                        'value' => 'SUNKEN_PAY_KEY',
                                        'label' => '密钥环境变量',
                                        'description' => '填写环境变量名，实际密钥请在站点运行环境中配置。',
                                    ],
                                ],
                            ],
                            'balance' => [
                                'label' => '账户余额',
                                'description' => '使用账户余额直接结算，需要先启用用户经济系统。',
                                'fields' => [
                                    [
                                        'type' => 'Switch',
                                        'name' => 'enabled',
                                        'value' => false,
                                        'label' => '启用余额支付',
                                    ],
                                ],
                            ],
                            'points' => [
                                'label' => '积分支付',
                                'description' => '使用用户积分抵扣付费下载，需要先启用用户经济系统。',
                                'fields' => [
                                    [
                                        'type' => 'Switch',
                                        'name' => 'enabled',
                                        'value' => false,
                                        'label' => '启用积分支付',
                                    ],
                                    [
                                        'type' => 'Number',
                                        'name' => 'rate',
                                        'value' => 100,
                                        'label' => '积分兑换比例',
                                        'description' => '每 1 元需要多少积分，例如 100 表示 1 元 = 100 积分。',
                                        'min' => 1,
                                        'max' => 100000,
                                        'step' => 1,
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
];
