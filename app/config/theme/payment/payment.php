<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 易支付 / 彩虹易支付 / 码支付共用同一套提交协议：pid、type、out_trade_no、
 * name、money、notify_url、return_url 与 MD5 签名。每个通道可以单独设置
 * 接口地址、商户号、密钥与支持的支付方式，因此同一个站点可以同时接入多套
 * 易支付或码支付账号。
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
                'type' => 'Password',
                'name' => 'key',
                'value' => '',
                'inline' => true,
                'inline_group' => 'merchant',
                'label' => '商户密钥',
                'description' => '直接填写平台给出的商户密钥，保存在主题设置中。',
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
    'description' => '下载开关、每日免费额度、最低支付金额与收款通道都在这里配置；付费下载记录在用户中心「下载记录」中查看。支付平台的异步通知必须能公网访问下方回调地址。',
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
            'description' => '按「通道」配置收款：可以同时添加多套官方直连、易支付或码支付，每套通道单独填写商户号与密钥，并勾选它支持的支付方式。官方直连当前支持支付宝电脑网站支付；微信 / QQ 请使用易支付或码支付通道。结算页会按这些通道分别列出付款入口。',
            'reorder' => ['drag', 'buttons'],
            'options' => [
                'official' => $officialChannel,
                'epay' => $compatibleChannel(
                    '易支付 / 彩虹易支付',
                    '适用于易支付、彩虹易支付及同协议的聚合支付平台。'
                ),
                'mapay' => $compatibleChannel(
                    '码支付',
                    '适用于码支付及同协议的聚合支付平台。'
                ),
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
                . '<p>该地址必须能被支付平台公网访问，支持 GET / POST 回调；易支付 / 码支付请在商户后台填写异步通知地址，支付宝官方直连会在每笔请求中自动携带该地址。同步跳转地址由每笔订单自动生成。</p>'
                . '</div>',
        ],
    ],
];
