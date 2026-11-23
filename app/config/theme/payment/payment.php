<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 每个「通道」对应一套独立的支付适配器：
 * - 易支付 / 彩虹易支付 / 码支付（易支付协议）共用 pid 协议，支持商户密钥
 *   MD5 与证书模式 SHA256WithRSA；
 * - 支付宝官方直连使用 RSA2；
 * - 虎皮椒 V3、迅虎 PAY、PAYJS、V免签、码支付（官方协议）各自使用
 *   不同的签名与提交方式，由 DownloadPayment 在服务端完成。
 * 同一个站点可以同时接入多套通道，结算页会按支付方式分别列出入口。
 */
$compatibleChannel = static function (string $label, string $description): array {
    return [
        'label' => $label,
        'description' => $description,
        'fields' => [
            [
                'type' => 'Text',
                'name' => 'label',
                'value' => '',
                'label' => '通道名称',
                'description' => '用于在后台和结算页区分不同通道，留空则显示平台名称。',
                'placeholder' => '例如：易支付 A',
            ],
            [
                'type' => 'Checkbox',
                'name' => 'methods',
                'value' => ['alipay', 'wxpay'],
                'label' => '支持的支付方式',
                'description' => '该通道实际开通的方式；结算页只会列出勾选的付款入口。',
                'options' => [
                    'alipay' => '支付宝',
                    'wxpay' => '微信支付',
                    'qqpay' => 'QQ 钱包',
                ],
            ],
            [
                'type' => 'Text',
                'name' => 'gateway',
                'value' => '',
                'label' => '平台地址',
                'description' => '填写平台根地址，需以 https:// 开头，不需要带 submit.php。',
                'placeholder' => 'https://pay.example.com',
            ],
            [
                'type' => 'Text',
                'name' => 'endpoint',
                'value' => 'submit.php',
                'label' => '接口路径',
                'description' => '相对路径，例如 submit.php 或 pay/submit.php。证书模式下若平台要求 API 提交，可填写 api/pay/submit。',
                'placeholder' => 'submit.php',
            ],
            [
                'type' => 'Select',
                'name' => 'sign_mode',
                'value' => 'md5',
                'label' => '签名方式',
                'description' => '商户密钥模式使用 MD5 签名；证书模式使用商户私钥做 SHA256WithRSA 签名，并用平台公钥校验回调。证书模式需要平台支持 V2/RSA。',
                'options' => [
                    'md5' => '商户密钥（MD5）',
                    'rsa' => '证书模式（RSA2）',
                ],
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
                'type' => 'Password',
                'name' => 'key',
                'value' => '',
                'inline' => true,
                'inline_group' => 'merchant',
                'label' => '商户密钥',
                'description' => '商户密钥模式必填；证书模式下可留空，仅用于兼容仍以 MD5 回调的平台。',
            ],
            [
                'type' => 'Textarea',
                'name' => 'merchant_private_key',
                'value' => '',
                'rows' => 6,
                'label' => '商户私钥（证书模式）',
                'description' => '证书模式必填。粘贴商户 RSA 私钥 PEM 或纯 Base64，支持 PKCS#8 / PKCS#1；不会输出到前台。',
            ],
            [
                'type' => 'Textarea',
                'name' => 'platform_public_key',
                'value' => '',
                'rows' => 6,
                'label' => '平台公钥（证书模式）',
                'description' => '证书模式必填。粘贴易支付平台公钥，用于验证异步通知签名。',
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

$officialChannel = [
    'label' => '支付宝官方直连',
    'description' => '通过支付宝开放平台的电脑网站支付直接收款，不经过第三方聚合平台；需要 PHP OpenSSL 扩展。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「支付宝官方」。',
            'placeholder' => '例如：支付宝官方',
        ],
        [
            'type' => 'Text',
            'name' => 'app_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'official-app',
            'label' => '应用 AppID',
            'placeholder' => '2021xxxxxxxxxxxx',
        ],
        [
            'type' => 'Text',
            'name' => 'gateway',
            'value' => 'https://openapi.alipay.com/gateway.do',
            'inline' => true,
            'inline_group' => 'official-app',
            'label' => '网关地址',
            'description' => '支付宝开放平台网关，通常保持默认即可。',
        ],
        [
            'type' => 'Textarea',
            'name' => 'private_key',
            'value' => '',
            'rows' => 6,
            'label' => '应用私钥（RSA2）',
            'description' => '支付宝开放平台「应用私钥」。支持粘贴完整 PEM，或只粘贴 Base64 内容；也支持 PKCS8 / PKCS1 两种格式，换行不会丢失。',
        ],
        [
            'type' => 'Textarea',
            'name' => 'public_key',
            'value' => '',
            'rows' => 6,
            'label' => '支付宝公钥（RSA2）',
            'description' => '支付宝开放平台「支付宝公钥」，用于校验异步通知签名。请勿填写应用公钥。',
        ],
    ],
];

$xunhupayChannel = [
    'label' => '虎皮椒 V3（迅虎）',
    'description' => '虎皮椒 / 迅虎 V3 接口，支持支付宝与微信；接口为 JSON POST，支付地址由服务器端换取，密钥不会下发到浏览器。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「虎皮椒 V3 · 支付方式」。',
            'placeholder' => '例如：虎皮椒 A',
        ],
        [
            'type' => 'Checkbox',
            'name' => 'methods',
            'value' => ['alipay', 'wxpay'],
            'label' => '支持的支付方式',
            'description' => '该通道实际开通的方式；结算页只会列出勾选的付款入口。',
            'options' => [
                'alipay' => '支付宝',
                'wxpay' => '微信支付',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'appid',
            'value' => '',
            'inline' => true,
            'inline_group' => 'xunhupay-app',
            'label' => 'APPID',
            'placeholder' => '虎皮椒后台的 APPID',
        ],
        [
            'type' => 'Password',
            'name' => 'appsecret',
            'value' => '',
            'inline' => true,
            'inline_group' => 'xunhupay-app',
            'label' => 'APP Secret',
            'description' => '至少 16 位，保存在主题设置中，不会输出到前台。',
        ],
        [
            'type' => 'Text',
            'name' => 'gateway',
            'value' => 'https://api.xunhupay.com/payment/do.html',
            'label' => '接口地址',
            'description' => '虎皮椒 V3 的支付接口完整地址，通常保持默认即可。',
        ],
        [
            'type' => 'Text',
            'name' => 'site_name',
            'value' => '',
            'label' => '网站名称（可选）',
            'description' => '微信 WAP 支付时显示的名称，留空则使用「付费下载」。',
        ],
    ],
];

$xhpayChannel = [
    'label' => '迅虎 PAY（虎皮椒 V4）',
    'description' => '迅虎 PAY 收银台接口，支持支付宝与微信；金额按分提交，异步通知使用 JSON。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「迅虎 PAY · 支付方式」。',
            'placeholder' => '例如：迅虎 PAY A',
        ],
        [
            'type' => 'Checkbox',
            'name' => 'methods',
            'value' => ['alipay', 'wxpay'],
            'label' => '支持的支付方式',
            'description' => '该通道实际开通的方式；结算页只会列出勾选的付款入口。',
            'options' => [
                'alipay' => '支付宝',
                'wxpay' => '微信支付',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'merchant_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'xhpay-merchant',
            'label' => '商户号',
        ],
        [
            'type' => 'Password',
            'name' => 'key',
            'value' => '',
            'inline' => true,
            'inline_group' => 'xhpay-merchant',
            'label' => 'API 密钥',
            'description' => '至少 16 位，保存在主题设置中。',
        ],
        [
            'type' => 'Text',
            'name' => 'gateway',
            'value' => 'https://admin.xunhuweb.com',
            'label' => '接口地址',
            'description' => '迅虎 PAY 网关根地址，通常保持默认即可。',
        ],
    ],
];

$payjsChannel = [
    'label' => 'PAYJS',
    'description' => 'PAYJS 收银台接口，金额按分提交；支持微信，支付宝是否可用取决于 PAYJS 账户开通情况。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「PAYJS · 支付方式」。',
            'placeholder' => '例如：PAYJS A',
        ],
        [
            'type' => 'Checkbox',
            'name' => 'methods',
            'value' => ['wxpay', 'alipay'],
            'label' => '支持的支付方式',
            'description' => '该通道实际开通的方式；结算页只会列出勾选的付款入口。',
            'options' => [
                'wxpay' => '微信支付',
                'alipay' => '支付宝',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'merchant_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'payjs-merchant',
            'label' => '商户号 MCHID',
        ],
        [
            'type' => 'Password',
            'name' => 'key',
            'value' => '',
            'inline' => true,
            'inline_group' => 'payjs-merchant',
            'label' => '通信密钥',
            'description' => '至少 16 位，保存在主题设置中。',
        ],
        [
            'type' => 'Text',
            'name' => 'gateway',
            'value' => 'https://payjs.cn/api/cashier',
            'label' => '收银台地址',
            'description' => 'PAYJS 收银台接口完整地址，通常保持默认即可。',
        ],
    ],
];

$vmqChannel = [
    'label' => 'V免签',
    'description' => 'V免签监控端接口，支持支付宝与微信；监控端可以是 http(s)，建议使用 HTTPS 域名。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「V免签 · 支付方式」。',
            'placeholder' => '例如：V免签 A',
        ],
        [
            'type' => 'Checkbox',
            'name' => 'methods',
            'value' => ['alipay', 'wxpay'],
            'label' => '支持的支付方式',
            'description' => '该通道实际开通的方式；结算页只会列出勾选的付款入口。',
            'options' => [
                'alipay' => '支付宝',
                'wxpay' => '微信支付',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'gateway',
            'value' => '',
            'label' => '监控端地址',
            'description' => 'V免签监控端的根地址，例如 https://vmq.example.com，不需要带 /createOrder。',
            'placeholder' => 'https://vmq.example.com',
        ],
        [
            'type' => 'Password',
            'name' => 'key',
            'value' => '',
            'label' => '通信密钥',
            'description' => 'V免签后台配置的通信密钥，至少 16 位。',
        ],
    ],
];

$codepayChannel = [
    'label' => '码支付（官方协议）',
    'description' => '码支付官方 creat_order 协议，支持支付宝、微信与 QQ 钱包；返回二维码后在站内展示。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「码支付 · 支付方式」。',
            'placeholder' => '例如：码支付 A',
        ],
        [
            'type' => 'Checkbox',
            'name' => 'methods',
            'value' => ['alipay', 'wxpay'],
            'label' => '支持的支付方式',
            'description' => '该通道实际开通的方式；结算页只会列出勾选的付款入口。',
            'options' => [
                'alipay' => '支付宝',
                'wxpay' => '微信支付',
                'qqpay' => 'QQ 钱包',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'merchant_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'codepay-merchant',
            'label' => '码支付 ID',
        ],
        [
            'type' => 'Password',
            'name' => 'key',
            'value' => '',
            'inline' => true,
            'inline_group' => 'codepay-merchant',
            'label' => '通信密钥',
            'description' => '至少 16 位，保存在主题设置中。',
        ],
        [
            'type' => 'Password',
            'name' => 'token',
            'value' => '',
            'label' => '接口 Token',
            'description' => '码支付后台的接口 Token，与通信密钥分开填写。',
        ],
        [
            'type' => 'Select',
            'name' => 'version',
            'value' => 'auto',
            'label' => '回调协议版本',
            'description' => '自动模式会同时兼容 V1 与 V2 的字段名和签名算法；只在平台明确要求时手动指定。',
            'options' => [
                'auto' => '自动识别（推荐）',
                'v1' => 'V1',
                'v2' => 'V2',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'gateway',
            'value' => 'https://api.xiuxiu888.com',
            'label' => '接口地址',
            'description' => '码支付网关根地址，通常保持默认即可。',
        ],
    ],
];

$wechatChannel = [
    'label' => '微信支付（官方 V3）',
    'description' => '微信支付 API v3 Native 下单，服务端签名并生成站内二维码；回调使用平台证书验签与 AES-256-GCM 解密。需要 PHP OpenSSL 与 cURL 扩展。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「微信支付（官方 V3） · 微信支付」。',
            'placeholder' => '例如：微信官方 A',
        ],
        [
            'type' => 'Text',
            'name' => 'app_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'wechat-app',
            'label' => 'AppID',
            'placeholder' => 'wx0000000000000000',
        ],
        [
            'type' => 'Text',
            'name' => 'mch_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'wechat-app',
            'label' => '商户号 MchID',
            'placeholder' => '1900000001',
        ],
        [
            'type' => 'Text',
            'name' => 'serial_no',
            'value' => '',
            'label' => '商户 API 证书序列号',
            'description' => '微信支付商户平台下载的 API 证书序列号，用于请求签名。',
            'placeholder' => '例如：5157F09EFDC096DE15EBE81A47057A7232F1B8E1',
        ],
        [
            'type' => 'Textarea',
            'name' => 'private_key',
            'value' => '',
            'rows' => 6,
            'label' => '商户 API 私钥',
            'description' => '粘贴 apiclient_key.pem 的完整 PEM 内容；支持 \\n 转义的 JSON 导出格式。',
        ],
        [
            'type' => 'Password',
            'name' => 'api_v3_key',
            'value' => '',
            'label' => 'APIv3 密钥',
            'description' => '微信支付商户平台设置的 32 位 APIv3 密钥，用于解密回调 resource。',
        ],
        [
            'type' => 'Textarea',
            'name' => 'platform_public_key',
            'value' => '',
            'rows' => 6,
            'label' => '微信支付平台证书 / 公钥',
            'description' => '用于验证微信支付回调签名，可粘贴平台证书 PEM 或平台公钥。',
        ],
    ],
];

$paypalChannel = [
    'label' => 'PayPal',
    'description' => 'PayPal Orders v2 收银台，支持沙箱与正式环境；回调将在服务端二次校验 Webhook 签名与订单金额。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「PayPal」。',
            'placeholder' => '例如：PayPal 国际',
        ],
        [
            'type' => 'Text',
            'name' => 'client_id',
            'value' => '',
            'inline' => true,
            'inline_group' => 'paypal-app',
            'label' => 'Client ID',
        ],
        [
            'type' => 'Password',
            'name' => 'client_secret',
            'value' => '',
            'inline' => true,
            'inline_group' => 'paypal-app',
            'label' => 'Client Secret',
            'description' => '保存在主题设置中，不会输出到前台。',
        ],
        [
            'type' => 'Switch',
            'name' => 'sandbox',
            'value' => false,
            'label' => '使用沙箱环境',
            'description' => '调试时开启；正式收款请关闭并使用正式环境的 Client ID / Secret。',
        ],
        [
            'type' => 'Select',
            'name' => 'currency',
            'value' => 'USD',
            'label' => '结算币种',
            'description' => 'PayPal 账户支持的币种，订单金额会按该币种提交。',
            'options' => [
                'USD' => 'USD 美元',
                'EUR' => 'EUR 欧元',
                'GBP' => 'GBP 英镑',
                'CAD' => 'CAD 加元',
                'AUD' => 'AUD 澳元',
                'HKD' => 'HKD 港币',
                'SGD' => 'SGD 新加坡元',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'webhook_id',
            'value' => '',
            'label' => 'Webhook ID（可选）',
            'description' => '创建 PayPal Webhook 后填写其 ID；回调地址使用「支付设置」页展示的异步通知地址。留空时仍可通过同步返回完成扣款校验。',
        ],
    ],
];

$stripeChannel = [
    'label' => 'Stripe Checkout',
    'description' => 'Stripe Checkout 托管收银台，支持银行卡与 Stripe 已启用的本地支付方式；Webhook 与同步返回都会在服务端核对金额和币种。',
    'fields' => [
        [
            'type' => 'Text',
            'name' => 'label',
            'value' => '',
            'label' => '通道名称',
            'description' => '用于在后台和结算页区分不同通道，留空则显示「Stripe Checkout · 银行卡 / 信用卡」。',
            'placeholder' => '例如：Stripe 国际',
        ],
        [
            'type' => 'Password',
            'name' => 'secret_key',
            'value' => '',
            'label' => 'Secret Key',
            'description' => 'Stripe 后台的 sk_live_ 或 sk_test_ 密钥，只保存在服务端。',
        ],
        [
            'type' => 'Password',
            'name' => 'webhook_secret',
            'value' => '',
            'label' => 'Webhook Signing Secret',
            'description' => 'Stripe Webhook 的 whsec_ 密钥；留空时只能通过同步返回结算，建议填写。',
        ],
        [
            'type' => 'Select',
            'name' => 'currency',
            'value' => 'USD',
            'label' => '结算币种',
            'description' => 'Stripe 账户支持的币种，订单金额会按该币种提交。',
            'options' => [
                'USD' => 'USD 美元',
                'CNY' => 'CNY 人民币',
                'EUR' => 'EUR 欧元',
                'GBP' => 'GBP 英镑',
                'CAD' => 'CAD 加元',
                'AUD' => 'AUD 澳元',
                'HKD' => 'HKD 港币',
                'SGD' => 'SGD 新加坡元',
            ],
        ],
    ],
];

$notifyPath = '/ttdf/sunken/payment/notify';
$notifyUrl = '';
$notifyFallback = '';
$pingUrl = '';
try {
    $base = rtrim(\TTDF\Compat\Typecho::indexUrl() ?: \TTDF\Compat\Typecho::siteUrl(), '/');
    if ($base !== '') {
        $secure = (
            !empty($_SERVER['HTTPS'])
            && strtolower((string) $_SERVER['HTTPS']) !== 'off'
        ) || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
        if ($secure && str_starts_with($base, 'http://')) {
            $base = 'https://' . substr($base, 7);
        }
        $notifyPath = $base . $notifyPath;
        $notifyUrl = $base . '/ttdf/sunken/payment/notify';
        $pingUrl = $base . '/ttdf/sunken/payment/ping';
    }
    $site = rtrim(\TTDF\Compat\Typecho::siteUrl(), '/');
    if ($site !== '') {
        $notifyFallback = $site . '/index.php/ttdf/sunken/payment/notify';
    }
} catch (\Throwable) {
    // Settings can also be loaded outside a booted Typecho request.
}
if ($notifyUrl !== '' && $notifyFallback === $notifyUrl) {
    $notifyFallback = '';
}

return [
    'title' => '支付设置',
    'description' => '下载开关、每日免费额度、最低支付金额与收款通道都在这里配置；支持支付宝官方、微信支付官方 V3、PayPal、Stripe、易支付 / 彩虹易支付（商户密钥或证书模式）、码支付、虎皮椒 V3、迅虎 PAY、PAYJS、V免签等常见通道。付费下载记录在用户中心「下载记录」中查看。支付平台的异步通知必须能公网访问下方回调地址。',
    'fields' => [
        [
            'type' => 'Switch',
            'name' => 'Downloads_Payment_Enabled',
            'value' => false,
            'inline' => true,
            'inline_group' => 'payment-base',
            'label' => '启用支付服务',
            'description' => '开启后，付费下载可以使用支付通道或站内余额结算。',
        ],
        [
            'type' => 'Number',
            'name' => 'Downloads_Payment_Min_Amount',
            'value' => 0.01,
            'inline' => true,
            'inline_group' => 'payment-base',
            'show_when' => ['Downloads_Payment_Enabled' => true],
            'label' => '最低支付金额（元）',
            'description' => '单笔付费下载不能低于此金额；低于该值的资源不会生成支付订单。',
            'min' => 0.01,
            'max' => 999999.99,
            'step' => 0.01,
        ],
        [
            'type' => 'Switch',
            'name' => 'Downloads_Enabled',
            'value' => false,
            'inline' => true,
            'inline_group' => 'download-base',
            'label' => '启用下载',
            'description' => '开启后，文章与帖子可以添加下载资源；未登录用户只能看到下载入口。',
        ],
        [
            'type' => 'Number',
            'name' => 'Downloads_Free_Daily_Limit',
            'value' => 3,
            'inline' => true,
            'inline_group' => 'download-base',
            'show_when' => ['Downloads_Enabled' => true],
            'label' => '每日免费下载次数',
            'description' => '每位登录用户每天可免费领取的次数，文章与帖子共用；填写 0 表示不限次数。',
            'min' => 0,
            'max' => 999,
            'step' => 1,
        ],
        [
            'type' => 'Blocks',
            'name' => 'Downloads_Payment_Gateways',
            'value' => [],
            'show_when' => ['Downloads_Payment_Enabled' => true],
            'label' => '付款方式',
            'item_label' => '通道',
            'description' => '按「通道」配置收款：可以同时添加支付宝官方、微信支付官方 V3、PayPal、Stripe、易支付、码支付、虎皮椒 V3、迅虎 PAY、PAYJS、V免签或码支付官方协议。官方直连当前支持支付宝电脑网站支付；微信官方通道使用 Native 扫码，PayPal 与 Stripe 使用托管收银台。结算页会按这些通道分别列出付款入口。',
            'reorder' => ['drag', 'buttons'],
            'options' => [
                'official' => $officialChannel,
                'epay' => $compatibleChannel(
                    '易支付 / 彩虹易支付',
                    '适用于易支付、彩虹易支付及同协议的聚合支付平台；支持商户密钥（MD5）与证书模式（RSA2）。'
                ),
                'mapay' => $compatibleChannel(
                    '码支付（易支付协议）',
                    '适用于码支付及同协议的聚合支付平台（易支付协议）。'
                ),
                'xunhupay' => $xunhupayChannel,
                'xhpay' => $xhpayChannel,
                'payjs' => $payjsChannel,
                'vmq' => $vmqChannel,
                'codepay' => $codepayChannel,
                'wechat' => $wechatChannel,
                'paypal' => $paypalChannel,
                'stripe' => $stripeChannel,
            ],
        ],
        [
            'type' => 'Switch',
            'name' => 'Downloads_Balance_Enabled',
            'value' => false,
            'inline' => true,
            'inline_group' => 'local-pay',
            'show_when' => ['Downloads_Payment_Enabled' => true],
            'label' => '启用账户余额支付',
            'description' => '使用用户余额直接结算，需要先启用用户经济系统。',
        ],
        [
            'type' => 'Switch',
            'name' => 'Downloads_Points_Enabled',
            'value' => false,
            'inline' => true,
            'inline_group' => 'local-pay',
            'show_when' => ['Downloads_Payment_Enabled' => true],
            'label' => '启用积分支付',
            'description' => '使用用户积分抵扣付费下载，需要先启用用户经济系统。',
        ],
        [
            'type' => 'Number',
            'name' => 'Downloads_Points_Rate',
            'value' => 100,
            'show_when' => ['Downloads_Payment_Enabled' => true, 'Downloads_Points_Enabled' => true],
            'label' => '积分兑换比例',
            'description' => '每 1 元需要多少积分，例如 100 表示 1 元 = 100 积分。',
            'min' => 1,
            'max' => 100000,
            'step' => 1,
        ],
        [
            'type' => 'Html',
            'show_when' => ['Downloads_Payment_Enabled' => true],
            'content' => '<div class="ttdf-pay-notify">'
                . '<p>支付平台回调地址（异步通知）：<code>'
                . \TTDF\Support\Escaper::html($notifyUrl !== '' ? $notifyUrl : $notifyPath)
                . '</code></p>'
                . ($notifyFallback === '' ? '' : '<p>备用地址（未开启伪静态时）：<code>'
                    . \TTDF\Support\Escaper::html($notifyFallback)
                    . '</code></p>')
                . ($pingUrl === '' ? '' : '<p><a href="'
                    . \TTDF\Support\Escaper::html($pingUrl)
                    . '" target="_blank" rel="noopener noreferrer">测试回调地址</a>，打开后应返回 JSON 且 reachable 为 true。</p>')
                . '<p>该地址必须能被支付平台公网访问，支持 GET / POST / JSON 回调；易支付、码支付、虎皮椒、迅虎 PAY、PAYJS、V免签、微信官方与 Stripe 请在商户后台填写异步通知地址，支付宝官方直连会在每笔请求中自动携带该地址。PayPal 请把同一地址配置为 Webhook，并填写 Webhook ID。同步跳转地址由每笔订单自动生成。</p>'
                . '</div>',
        ],
    ],
];
