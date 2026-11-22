<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Every gateway channel shares the same epay-compatible submit protocol.
 * 易支付/彩虹易支付 and 码支付 both accept pid, type, out_trade_no, name,
 * money, notify_url, return_url and an MD5 sign; the endpoint path is exposed
 * so other compatible platforms can be connected without another adapter.
 */
$gatewayChannel = static function (string $label, string $description): array {
    return [
        'label' => $label,
        'description' => $description,
        'fields' => [
            [
                'type' => 'Switch',
                'name' => 'enabled',
                'value' => false,
                'label' => '启用' . $label,
            ],
            [
                'type' => 'Select',
                'name' => 'platform',
                'value' => 'epay',
                'label' => '接入平台',
                'description' => '易支付与码支付使用同一套兼容协议；其他平台可选择自定义接口路径。',
                'options' => [
                    'epay' => '易支付 / 彩虹易支付',
                    'mapay' => '码支付',
                    'custom' => '其他易支付兼容平台',
                ],
            ],
            [
                'type' => 'Text',
                'name' => 'gateway',
                'value' => '',
                'label' => '平台地址',
                'description' => '填写平台根地址，不需要带 submit.php。',
                'placeholder' => 'https://pay.example.com',
            ],
            [
                'type' => 'Text',
                'name' => 'endpoint',
                'value' => 'submit.php',
                'label' => '接口路径',
                'description' => '相对路径，例如 submit.php 或 pay/submit.php。',
                'placeholder' => 'submit.php',
            ],
            [
                'type' => 'Text',
                'name' => 'merchant_id',
                'value' => '',
                'inline' => true,
                'inline_group' => 'merchant',
                'label' => '商户 ID',
            ],
            [
                'type' => 'Text',
                'name' => 'key_env',
                'value' => 'SUNKEN_PAY_KEY',
                'inline' => true,
                'inline_group' => 'merchant',
                'label' => '密钥环境变量',
                'description' => '优先读取该环境变量。',
            ],
            [
                'type' => 'Password',
                'name' => 'key',
                'value' => '',
                'label' => '商户密钥（可选）',
                'description' => '环境变量未配置时使用；密钥会保存在主题设置中，仅管理员可见。',
            ],
            [
                'type' => 'Text',
                'name' => 'site_name',
                'value' => '',
                'label' => '网站名称（可选）',
                'description' => '部分平台要求提交 sitename，留空则不传。',
            ],
        ],
    ];
};

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
                'alipay' => $gatewayChannel(
                    '支付宝',
                    '通过易支付、码支付或兼容平台收取支付宝付款。'
                ),
                'wxpay' => $gatewayChannel(
                    '微信支付',
                    '通过易支付、码支付或兼容平台收取微信付款。'
                ),
                'qqpay' => $gatewayChannel(
                    'QQ 钱包',
                    '通过易支付、码支付或兼容平台收取 QQ 钱包付款。'
                ),
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
