<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Support\Escaper;
use TTDF\Theme\Options;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

final class DownloadPayment
{
    /** @var array<string, string> */
    private const METHODS = [
        'alipay' => '支付宝',
        'wxpay' => '微信支付',
        'qqpay' => 'QQ 钱包',
        'paypal' => 'PayPal',
        'card' => '银行卡 / 信用卡',
    ];

    /** @var array<string, string> */
    private const PLATFORMS = [
        'official' => '官方直连',
        'epay' => '易支付',
        'mapay' => '码支付（易支付协议）',
        'xunhupay' => '虎皮椒 V3',
        'xhpay' => '迅虎 PAY',
        'payjs' => 'PAYJS',
        'vmq' => 'V免签',
        'codepay' => '码支付（官方协议）',
        'wechat' => '微信支付（官方 V3）',
        'paypal' => 'PayPal',
        'stripe' => 'Stripe Checkout',
    ];

    /**
     * Platforms whose payment entry is resolved on the server. The public
     * checkout dialog only receives a signed /ttdf/sunken/payment/go URL, so
     * API secrets and POST-only provider protocols never reach the browser.
     *
     * @var list<string>
     */
    private const LAUNCH_PLATFORMS = [
        'xunhupay',
        'xhpay',
        'payjs',
        'vmq',
        'codepay',
        'wechat',
        'paypal',
        'stripe',
    ];

    /**
     * Gateways disagree on the payment type label, so callbacks are matched
     * through a small alias table instead of a strict string comparison.
     *
     * @var array<string, string>
     */
    private const TYPE_ALIASES = [
        'ali' => 'alipay',
        'alipay' => 'alipay',
        'wechat' => 'wxpay',
        'weixin' => 'wxpay',
        'wechatpay' => 'wxpay',
        'wxpay' => 'wxpay',
        'qq' => 'qqpay',
        'qqpay' => 'qqpay',
        'tenpay' => 'qqpay',
        'paypal' => 'paypal',
        'stripe' => 'card',
        'card' => 'card',
        'creditcard' => 'card',
    ];

    /**
     * Informational fields some compatible gateways echo back without signing
     * them. Verification retries without these keys before giving up.
     *
     * @var list<string>
     */
    private const UNSIGNED_HINTS = [
        'sitename',
        'addtime',
        'endtime',
        'param',
        'buyer',
        'api_trade_no',
    ];

    public static function configured(): bool
    {
        if (self::enabled() === false) {
            return false;
        }

        return self::gatewayChannels() !== [] || self::balanceEnabled() || self::pointsEnabled();
    }

    public static function balanceEnabled(): bool
    {
        if (self::enabled() === false || !UserEconomy::enabled() || !UserEconomy::available()) {
            return false;
        }

        $stored = Options::instance()->get('Downloads_Balance_Enabled', null);
        if ($stored !== null) {
            return $stored === true;
        }

        $channels = self::legacyChannelValues();
        if (array_key_exists('balance', $channels)) {
            return self::truthy($channels['balance']['enabled'] ?? false);
        }

        return (Options::instance()->all()['Downloads_Allow_Balance'] ?? null) === true;
    }

    public static function pointsEnabled(): bool
    {
        if (self::enabled() === false || !UserEconomy::enabled() || !UserEconomy::available()) {
            return false;
        }

        $stored = Options::instance()->get('Downloads_Points_Enabled', null);
        if ($stored !== null) {
            return $stored === true && self::pointsRate() > 0;
        }

        $config = self::legacyChannelValues()['points'] ?? null;

        return is_array($config)
            && self::truthy($config['enabled'] ?? false)
            && self::pointsRate() > 0;
    }

    public static function pointsRate(): int
    {
        $stored = Options::instance()->get('Downloads_Points_Rate', null);
        if ($stored !== null && is_numeric($stored)) {
            return max(1, min(100000, (int) $stored));
        }

        $config = self::legacyChannelValues()['points'] ?? null;
        $rate = is_array($config) ? (int) ($config['rate'] ?? 100) : 100;

        return max(1, min(100000, $rate));
    }

    /**
     * Lowest amount a paid download order may use, in cents.
     */
    public static function minimumCents(): int
    {
        $value = Settings::values()['Downloads_Payment_Min_Amount'] ?? 0.01;
        if (!is_numeric($value)) {
            return 1;
        }

        return max(1, min(99999999, (int) round((float) $value * 100)));
    }

    public static function minimumAmount(): string
    {
        return Downloads::formatAmount(self::minimumCents());
    }

    /**
     * Public callback URL used by every gateway. Some hosts terminate TLS at a
     * proxy while Typecho still stores an http:// site URL; upgrading the URL
     * here prevents providers from POSTing to a 301 redirect and losing the
     * notification body.
     */
    public static function notifyUrl(): string
    {
        $base = self::baseUrl();

        return $base === '' ? '' : $base . '/ttdf/sunken/payment/notify';
    }

    /**
     * Site entry URL with the current request's scheme applied.
     */
    public static function baseUrl(): string
    {
        $base = rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/');
        if ($base === '') {
            return '';
        }

        if (self::requestIsSecure() && stripos($base, 'http://') === 0) {
            return 'https://' . substr($base, 7);
        }

        return $base;
    }

    /**
     * Flatten every configured channel into one entry per payment method.
     *
     * @return array<string, array{method: string, label: string, platform: string, gateway: string, endpoint: string, site_name: string, id: string, secret: string, public_key: string, token: string, provider: array<string, mixed>}>
     */
    public static function gatewayChannels(): array
    {
        if (self::enabled() === false) {
            return [];
        }

        $channels = [];
        foreach (self::channelConfigs() as $index => $config) {
            $prepared = self::prepare($config);
            if ($prepared === null) {
                continue;
            }

            foreach ($prepared['methods'] as $method) {
                $id = 'channel-' . $index . '-' . $method;
                $channels[$id] = [
                    'method' => $method,
                    'label' => self::channelLabel($prepared, $method),
                    'platform' => $prepared['platform'],
                    'gateway' => $prepared['gateway'],
                    'endpoint' => $prepared['endpoint'],
                    'site_name' => $prepared['site_name'],
                    'id' => $prepared['id'],
                    'secret' => $prepared['secret'],
                    'public_key' => $prepared['public_key'],
                    'token' => $prepared['token'],
                    'provider' => $prepared['provider'],
                ];
            }
        }

        return $channels;
    }

    /**
     * Build one signed payment URL for the selected channel.
     *
     * @param array<string, mixed> $order
     */
    public static function checkout(array $order, string $method = ''): string
    {
        $channels = self::gatewayChannels();
        if ($channels === []) {
            return '';
        }

        $channelId = $method === '' ? (string) array_key_first($channels) : $method;
        $channel = $channels[$channelId] ?? null;
        if (!is_array($channel)) {
            return '';
        }

        if (in_array($channel['platform'], self::LAUNCH_PLATFORMS, true)) {
            return self::launchUrl($channelId, $order);
        }

        return $channel['platform'] === 'official'
            ? self::officialCheckout($channel, $order)
            : self::compatibleCheckout($channel, $order);
    }

    /**
     * Payment entry points shown in the checkout dialog. Balance settlement is
     * exposed through the existing wallet action and is not a redirect URL.
     *
     * @param array<string, mixed> $order
     * @return list<array{method: string, label: string, url: string}>
     */
    public static function options(array $order): array
    {
        $options = [];
        foreach (self::gatewayChannels() as $id => $channel) {
            $url = in_array($channel['platform'], self::LAUNCH_PLATFORMS, true)
                ? self::launchUrl($id, $order)
                : self::checkout($order, $id);
            if ($url === '') {
                continue;
            }
            $options[] = [
                'method' => $id,
                'label' => $channel['label'],
                'url' => $url,
            ];
        }

        return $options;
    }

    /**
     * Signed entry point used by POST/API-based providers. The checkout dialog
     * never receives merchant secrets or provider request bodies.
     *
     * @param array<string, mixed> $order
     */
    private static function launchUrl(string $channel, array $order): string
    {
        $base = self::baseUrl();
        $number = (string) ($order['number'] ?? '');
        if (
            $base === ''
            || !self::validOrderNumber($number)
            || preg_match('/^channel-[0-9]+-[a-z]+$/D', $channel) !== 1
        ) {
            return '';
        }

        return $base . '/ttdf/sunken/payment/go?' . http_build_query([
            'order' => $number,
            'channel' => $channel,
            'token' => self::launchToken($number, $channel),
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Resolve a signed payment entry and redirect the browser to the provider.
     *
     * @param array<string, mixed> $input
     */
    public static function launch(array $input): never
    {
        $number = trim((string) ($input['order'] ?? ''));
        $channelId = trim((string) ($input['channel'] ?? ''));
        $token = strtolower(trim((string) ($input['token'] ?? '')));
        if (
            !self::validOrderNumber($number)
            || preg_match('/^channel-[0-9]+-[a-z]+$/D', $channelId) !== 1
            || preg_match('/^[a-f0-9]{64}$/D', $token) !== 1
            || !hash_equals(self::launchToken($number, $channelId), $token)
        ) {
            self::fail('支付链接无效或已过期');
        }

        if (!DownloadStore::available()) {
            self::fail('下载数据表尚未初始化，请管理员保存一次主题设置');
        }
        $order = DownloadStore::orderByNumber($number);
        if ($order === null || (string) ($order['status'] ?? '') !== 'pending') {
            self::fail('订单不存在或已支付');
        }

        $channels = self::gatewayChannels();
        $channel = $channels[$channelId] ?? null;
        if (!is_array($channel)) {
            self::fail('支付通道未启用');
        }

        try {
            $result = self::launchChannel($channel, $order, $channelId);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat payment launch failed: ' . $exception->getMessage());
            $result = null;
        }

        if (!is_array($result) || !isset($result['url']) || !is_string($result['url'])) {
            self::fail('支付通道暂时不可用，请稍后重试');
        }

        if (($result['html'] ?? false) === true) {
            if (!headers_sent()) {
                header('Content-Type: text/html; charset=UTF-8');
                header('Cache-Control: no-store');
                header('Referrer-Policy: no-referrer');
                header('X-Frame-Options: DENY');
                header('X-Content-Type-Options: nosniff');
            }
            echo $result['url'];
            exit;
        }

        if (!self::isSafeUrl($result['url'], $channel['platform'] === 'vmq')) {
            self::fail('支付通道返回了不安全的地址');
        }
        if (!headers_sent()) {
            header('Cache-Control: no-store');
            header('Referrer-Policy: no-referrer');
            header('Location: ' . $result['url'], true, 302);
        }
        exit;
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string, token: string} $channel
     * @param array<string, mixed> $order
     * @return array{url: string, html?: bool}|null
     */
    private static function launchChannel(array $channel, array $order, string $channelId = ''): ?array
    {
        return match ($channel['platform']) {
            'xunhupay' => self::xunhupayCheckout($channel, $order),
            'xhpay' => self::xhpayCheckout($channel, $order),
            'payjs' => self::payjsCheckout($channel, $order),
            'vmq' => self::vmqCheckout($channel, $order),
            'codepay' => self::codepayCheckout($channel, $order),
            'wechat' => self::wechatCheckout($channel, $order),
            'paypal' => self::paypalCheckout($channel, $order, $channelId),
            'stripe' => self::stripeCheckout($channel, $order, $channelId),
            default => null,
        };
    }

    private static function launchToken(string $number, string $channel): string
    {
        return hash_hmac('sha256', $number . '|' . $channel, self::secret());
    }

    private static function secret(): string
    {
        try {
            $options = Typecho::options();
            $secret = is_scalar($options?->secret ?? null) ? (string) $options->secret : '';
            $site = Typecho::siteUrl();
        } catch (\Throwable) {
            $secret = '';
            $site = '';
        }

        return hash('sha256', $secret . '|' . $site . '|ttdf-download-payment');
    }

    private static function isSafeUrl(string $url, bool $allowHttp = false): bool
    {
        $parts = parse_url($url);
        if (
            !is_array($parts)
            || empty($parts['host'])
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
            || preg_match('/[\x00-\x20\x7f\\\\]/', $url) === 1
            || filter_var($url, FILTER_VALIDATE_URL) === false
        ) {
            return false;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        return $scheme === 'https' || ($allowHttp && $scheme === 'http');
    }

    private static function fail(string $message): never
    {
        if (!headers_sent()) {
            if (class_exists('Typecho\\Response')) {
                \Typecho\Response::getInstance()->setStatus(400);
            } else {
                http_response_code(400);
            }
            header('Content-Type: text/html; charset=UTF-8');
            header('Cache-Control: no-store');
            header('Referrer-Policy: no-referrer');
            header('X-Frame-Options: DENY');
            header('X-Content-Type-Options: nosniff');
        }

        $home = Escaper::url(Typecho::siteUrl() ?: '/');
        echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>支付暂不可用</title></head>'
            . '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;color:#111827;font:15px/1.6 system-ui,sans-serif">'
            . '<main style="max-width:28rem;margin:24px;padding:28px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center">'
            . '<h1 style="margin:0 0 8px;font-size:20px">支付暂不可用</h1>'
            . '<p style="margin:0 0 20px;color:#4b5563">' . Escaper::html($message) . '</p>'
            . '<a href="' . $home . '" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#111827;color:#fff;text-decoration:none">返回首页</a>'
            . '</main></body></html>';
        exit;
    }

    /**
     * Validate a provider callback against every configured gateway. epay
     * compatible platforms carry a merchant id and payment type; Alipay
     * direct callbacks carry an app id and an RSA2 signature.
     *
     * @param array<string, mixed> $input
     * @param array<string, string> $headers
     * @return array{number: string, trade: string, amount: int}|null
     */
    public static function verify(array $input, string $rawBody = '', array $headers = []): ?array
    {
        foreach (self::gatewayChannels() as $channel) {
            $result = self::verifyChannel($channel, $input, $rawBody, $headers);
            if ($result !== null) {
                return $result;
            }
        }

        return null;
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string, public_key: string, token: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @param array<string, string> $headers
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyChannel(array $channel, array $input, string $rawBody, array $headers): ?array
    {
        return match ($channel['platform']) {
            'official' => self::verifyOfficial($channel, $input),
            'xunhupay' => self::verifyXunhupay($channel, $input),
            'xhpay' => self::verifyXhpay($channel, $input),
            'payjs' => self::verifyPayjs($channel, $input),
            'vmq' => self::verifyVmq($channel, $input),
            'codepay' => self::verifyCodepay($channel, $input, $rawBody),
            'wechat' => self::verifyWechat($channel, $input, $rawBody, $headers),
            'paypal' => self::verifyPaypal($channel, $input, $rawBody, $headers),
            'stripe' => self::verifyStripe($channel, $input, $rawBody, $headers),
            default => self::verifyCompatible($channel, $input),
        };
    }

    /**
     * EasyPay / 彩虹易支付 / 码支付 compatible callback. V1 uses MD5 with the
     * merchant key; V2 uses SHA256WithRSA for requests and the platform public
     * key for callback verification.
     *
     * @param array{method: string, platform: string, id: string, secret: string, public_key: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyCompatible(array $channel, array $input): ?array
    {
        $signature = self::field($input, ['sign']);
        $number = self::field($input, ['out_trade_no', 'order_no', 'order_id', 'orderid', 'trade_order_no']);
        $trade = self::field($input, ['trade_no', 'pay_no', 'transaction_id', 'api_trade_no']);
        $signMode = strtolower((string) ($channel['provider']['sign_mode'] ?? 'md5'));
        $signType = strtoupper(self::field($input, ['sign_type']));
        $isRsa = in_array($signType, ['RSA', 'RSA2', 'SHA256WITHRSA'], true)
            || ($signType === '' && $signMode === 'rsa');
        $isMd5 = $signType === 'MD5' || ($signType === '' && $signMode === 'md5');
        if (
            $signature === ''
            || (!$isRsa && !$isMd5)
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || !self::paidStatus($input)
        ) {
            return null;
        }
        if ($isMd5 && preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1) {
            return null;
        }
        if ($isRsa && preg_match('/^[A-Za-z0-9+\/=\s]{16,2048}$/D', $signature) !== 1) {
            return null;
        }

        $amount = self::callbackAmount(self::field($input, [
            'money',
            'total_amount',
            'price',
            'amount',
            'total_fee',
        ]));
        if ($amount === null || $amount <= 0) {
            return null;
        }

        $pid = self::field($input, ['pid', 'merchant_id', 'mch_id']);
        if ($pid !== '' && $pid !== $channel['id']) {
            return null;
        }
        $type = self::normalizeType(self::field($input, ['type', 'pay_type', 'payment_type']));
        if ($type !== '' && $type !== $channel['method']) {
            return null;
        }

        $verified = false;
        if ($isRsa) {
            $publicKey = (string) ($channel['public_key'] ?? '');
            if ($publicKey !== '') {
                foreach (self::signatureVariants($input) as $params) {
                    if (
                        self::rsaVerifyString(self::signable($params), $signature, $publicKey)
                        || self::rsaVerifyString(self::signable($params, true), $signature, $publicKey)
                    ) {
                        $verified = true;
                        break;
                    }
                }
            }
        }
        if (!$verified && $isMd5) {
            $merchantKey = (string) ($channel['provider']['merchant_key'] ?? '');
            if ($merchantKey === '' && $signMode === 'md5') {
                $merchantKey = (string) ($channel['secret'] ?? '');
            }
            if (
                $merchantKey !== ''
                && self::md5SignatureMatches($input, strtolower($signature), $merchantKey)
            ) {
                $verified = true;
            }
        }
        if (!$verified) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string, public_key: string} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyXunhupay(array $channel, array $input): ?array
    {
        $signature = self::field($input, ['hash']);
        $number = self::field($input, ['trade_order_id']);
        $trade = self::field($input, ['transaction_id']);
        if (
            $signature === ''
            || strtoupper(self::field($input, ['status'])) !== 'OD'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1
        ) {
            return null;
        }

        $amount = self::callbackAmount(self::field($input, ['total_fee', 'money', 'amount']));
        if ($amount === null || $amount <= 0) {
            return null;
        }
        if (!hash_equals(self::xhHash($input, $channel['secret']), strtolower($signature))) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyXhpay(array $channel, array $input): ?array
    {
        $signature = self::field($input, ['sign']);
        $number = self::field($input, ['out_trade_no']);
        $trade = self::field($input, ['order_id']);
        if (
            $signature === ''
            || strtoupper(self::field($input, ['return_code'])) !== 'SUCCESS'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1
        ) {
            return null;
        }

        $amount = self::callbackFen(self::field($input, ['total_fee']));
        if ($amount === null) {
            return null;
        }
        if (!hash_equals(self::xhpaySign($input, $channel['secret']), strtoupper($signature))) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyPayjs(array $channel, array $input): ?array
    {
        $signature = self::field($input, ['sign']);
        $number = self::field($input, ['out_trade_no']);
        $trade = self::field($input, ['payjs_order_id']);
        if (
            $signature === ''
            || self::field($input, ['return_code']) !== '1'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1
        ) {
            return null;
        }

        $amount = self::callbackFen(self::field($input, ['total_fee']));
        if ($amount === null) {
            return null;
        }
        if (!hash_equals(self::payjsSign($input, $channel['secret']), strtoupper($signature))) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyVmq(array $channel, array $input): ?array
    {
        $signature = self::field($input, ['sign']);
        $number = self::field($input, ['payId']);
        $type = self::field($input, ['type']);
        $price = self::field($input, ['price']);
        $really = self::field($input, ['reallyPrice']);
        if (
            $signature === ''
            || !self::validOrderNumber($number)
            || $type === ''
            || $price === ''
            || $really === ''
            || preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1
        ) {
            return null;
        }

        $amount = self::callbackAmount($really);
        if ($amount === null || $amount <= 0) {
            return null;
        }

        $expected = md5($number . self::field($input, ['param']) . $type . $price . $really . $channel['secret']);
        if (!hash_equals($expected, strtolower($signature))) {
            return null;
        }

        $trade = self::field($input, ['transaction_id']);
        if (!self::validTrade($trade)) {
            $trade = $number;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{method: string, platform: string, id: string, secret: string} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyCodepay(array $channel, array $input, string $rawBody = ''): ?array
    {
        $signature = self::field($input, ['sign']);
        $number = self::field($input, [
            'out_trade_no',
            'order_no',
            'order_id',
            'orderid',
            'trade_order_no',
            'pay_id',
        ]);
        $trade = self::field($input, [
            'trade_no',
            'transaction_id',
            'api_trade_no',
            'pay_no',
        ]);
        $version = strtolower((string) ($channel['provider']['version'] ?? 'auto'));
        if (!in_array($version, ['auto', 'v1', 'v2'], true)) {
            $version = 'auto';
        }
        $status = self::field($input, ['trade_status', 'status', 'trade_state', 'pay_status']);
        if (
            $signature === ''
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || preg_match('/^[a-f0-9]{32}$|^[a-f0-9]{64}$/Di', $signature) !== 1
            || ($status !== '' && !self::paidStatus($input))
            || ($status === '' && $version === 'v2')
        ) {
            return null;
        }

        $amount = self::callbackAmount(self::field($input, [
            'total_amount',
            'amount',
            'money',
            'price',
            'total_fee',
        ]));
        if ($amount === null || $amount <= 0) {
            return null;
        }

        $merchant = self::field($input, ['id', 'pid', 'merchant_id']);
        if ($merchant !== '' && $merchant !== $channel['id']) {
            return null;
        }
        $type = self::field($input, ['type', 'pay_type', 'payment_type']);
        if ($type !== '' && !self::codepayTypeMatches($type, $channel['method'])) {
            return null;
        }
        if (!self::codepaySignatureMatches($input, $signature, $channel['secret'], $rawBody, $version)) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{method: string, platform: string, id: string, public_key: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @param array<string, string> $headers
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyWechat(
        array $channel,
        array $input,
        string $rawBody,
        array $headers
    ): ?array {
        $signature = self::header($headers, 'wechatpay-signature');
        $timestamp = self::header($headers, 'wechatpay-timestamp');
        $nonce = self::header($headers, 'wechatpay-nonce');
        $apiV3Key = (string) ($channel['provider']['api_v3_key'] ?? '');
        if (
            $rawBody === ''
            || $signature === ''
            || $nonce === ''
            || preg_match('/^[0-9]{10}$/D', $timestamp) !== 1
            || abs(time() - (int) $timestamp) > 300
            || strlen($apiV3Key) !== 32
        ) {
            return null;
        }

        $message = $timestamp . "\n" . $nonce . "\n" . $rawBody . "\n";
        if (!self::rsaVerifyString($message, $signature, $channel['public_key'])) {
            return null;
        }

        $event = json_decode($rawBody, true);
        if (!is_array($event)) {
            return null;
        }
        $resource = is_array($event['resource'] ?? null) ? $event['resource'] : [];
        $ciphertext = (string) ($resource['ciphertext'] ?? '');
        $resourceNonce = (string) ($resource['nonce'] ?? '');
        $associated = (string) ($resource['associated_data'] ?? '');
        if (
            (string) ($resource['algorithm'] ?? '') !== 'AEAD_AES_256_GCM'
            || $ciphertext === ''
            || strlen($resourceNonce) !== 12
        ) {
            return null;
        }

        $binary = base64_decode($ciphertext, true);
        if (!is_string($binary) || strlen($binary) <= 16) {
            return null;
        }
        $tag = substr($binary, -16);
        $plain = openssl_decrypt(
            substr($binary, 0, -16),
            'aes-256-gcm',
            $apiV3Key,
            OPENSSL_RAW_DATA,
            $resourceNonce,
            $tag,
            $associated
        );
        if (!is_string($plain) || $plain === '') {
            return null;
        }

        $transaction = json_decode($plain, true);
        if (!is_array($transaction)) {
            return null;
        }
        $number = self::field($transaction, ['out_trade_no']);
        $trade = self::field($transaction, ['transaction_id']);
        $amount = self::callbackFen((string) (($transaction['amount']['total'] ?? '')));
        if (
            strtoupper(self::field($transaction, ['trade_state'])) !== 'SUCCESS'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || $amount === null
            || (string) ($transaction['appid'] ?? '') !== $channel['id']
            || (string) ($transaction['mchid'] ?? '') !== (string) ($channel['provider']['mch_id'] ?? '')
        ) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{gateway: string, id: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @param array<string, string> $headers
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyPaypal(
        array $channel,
        array $input,
        string $rawBody,
        array $headers
    ): ?array {
        $webhookId = trim((string) ($channel['provider']['webhook_id'] ?? ''));
        $transmissionId = self::header($headers, 'paypal-transmission-id');
        $transmissionTime = self::header($headers, 'paypal-transmission-time');
        $transmissionSig = self::header($headers, 'paypal-transmission-sig');
        $certUrl = self::header($headers, 'paypal-cert-url');
        $authAlgo = self::header($headers, 'paypal-auth-algo');
        if (
            $webhookId === ''
            || $transmissionId === ''
            || $transmissionTime === ''
            || $transmissionSig === ''
            || $certUrl === ''
            || $rawBody === ''
        ) {
            return null;
        }

        $event = json_decode($rawBody, true);
        if (!is_array($event)) {
            return null;
        }
        $token = self::paypalAccessToken($channel);
        if ($token === null) {
            return null;
        }
        $verification = self::paypalApi(
            $channel,
            'POST',
            '/v1/notify-webhook/verify-webhook-signature',
            (string) json_encode([
                'auth_algo' => $authAlgo,
                'cert_url' => $certUrl,
                'transmission_id' => $transmissionId,
                'transmission_sig' => $transmissionSig,
                'transmission_time' => $transmissionTime,
                'webhook_id' => $webhookId,
                'webhook_event' => $event,
            ], JSON_UNESCAPED_SLASHES),
            $token
        );
        if (
            $verification === null
            || $verification['status'] < 200
            || $verification['status'] >= 300
            || strtoupper((string) ($verification['data']['verification_status'] ?? '')) !== 'SUCCESS'
        ) {
            return null;
        }

        $type = strtoupper((string) ($event['event_type'] ?? ''));
        $resource = is_array($event['resource'] ?? null) ? $event['resource'] : [];
        if ($type !== 'PAYMENT.CAPTURE.COMPLETED') {
            return null;
        }

        $captureId = self::field($resource, ['id']);
        $customNumber = self::field($resource, ['custom_id', 'invoice_id']);
        $currency = strtoupper((string) ($resource['amount']['currency_code'] ?? ''));
        $amount = self::callbackAmount((string) ($resource['amount']['value'] ?? ''));
        if (
            $currency !== (string) ($channel['provider']['currency'] ?? '')
            || $amount === null
            || $amount <= 0
        ) {
            return null;
        }
        if (self::validOrderNumber($customNumber)) {
            return [
                'number' => $customNumber,
                'trade' => self::validTrade($captureId) ? $captureId : $customNumber,
                'amount' => $amount,
            ];
        }

        $orderId = self::field($resource, [
            'supplementary_data.related_ids.order_id',
        ]);
        if (!self::validTrade($orderId)) {
            $orderId = (string) ($resource['supplementary_data']['related_ids']['order_id'] ?? '');
        }
        if (!self::validTrade($orderId)) {
            return null;
        }
        $orderData = self::paypalOrder($channel, $orderId, $token);
        if ($orderData === null) {
            return null;
        }
        $settlement = self::paypalSettlement($orderData, (string) ($channel['provider']['currency'] ?? ''));
        if ($settlement === null) {
            return null;
        }
        if (self::validTrade($captureId)) {
            $settlement['trade'] = $captureId;
        }

        return $settlement;
    }

    /**
     * @param array{secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @param array<string, string> $headers
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyStripe(
        array $channel,
        array $input,
        string $rawBody,
        array $headers
    ): ?array {
        $webhookSecret = trim((string) ($channel['provider']['webhook_secret'] ?? ''));
        $header = self::header($headers, 'stripe-signature');
        if ($webhookSecret === '' || $header === '' || $rawBody === '') {
            return null;
        }

        $timestamp = 0;
        $signatures = [];
        foreach (explode(',', $header) as $part) {
            $pair = explode('=', trim($part), 2);
            if (count($pair) !== 2) {
                continue;
            }
            if ($pair[0] === 't' && preg_match('/^[0-9]{10}$/D', $pair[1]) === 1) {
                $timestamp = (int) $pair[1];
            } elseif ($pair[0] === 'v1' && preg_match('/^[a-f0-9]{64}$/Di', $pair[1]) === 1) {
                $signatures[] = strtolower($pair[1]);
            }
        }
        if ($timestamp <= 0 || $signatures === [] || abs(time() - $timestamp) > 300) {
            return null;
        }

        $expected = hash_hmac('sha256', $timestamp . '.' . $rawBody, $webhookSecret);
        $matched = false;
        foreach ($signatures as $signature) {
            if (hash_equals($expected, $signature)) {
                $matched = true;
                break;
            }
        }
        if (!$matched) {
            return null;
        }

        $event = json_decode($rawBody, true);
        if (!is_array($event)) {
            return null;
        }
        $type = (string) ($event['type'] ?? '');
        if (!in_array($type, ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], true)) {
            return null;
        }
        $session = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
        $number = self::field($session, ['client_reference_id']);
        if (!self::validOrderNumber($number)) {
            $number = (string) ($session['metadata']['order_number'] ?? '');
        }
        $amount = self::callbackFen((string) ($session['amount_total'] ?? ''));
        $currency = strtolower((string) ($session['currency'] ?? ''));
        $trade = self::field($session, ['payment_intent', 'id']);
        if (
            strtolower((string) ($session['payment_status'] ?? '')) !== 'paid'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || $amount === null
            || $currency !== strtolower((string) ($channel['provider']['currency'] ?? ''))
        ) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    public static function providerReturn(string $platform, array $input): ?array
    {
        $number = trim((string) ($input['order'] ?? ''));
        $channelId = trim((string) ($input['channel'] ?? ''));
        $token = strtolower(trim((string) ($input['rt'] ?? '')));
        if (
            !in_array($platform, ['paypal', 'stripe'], true)
            || !self::validOrderNumber($number)
            || preg_match('/^channel-[0-9]+-[a-z]+$/D', $channelId) !== 1
            || preg_match('/^[a-f0-9]{64}$/D', $token) !== 1
            || !hash_equals(self::returnToken($number, $channelId), $token)
        ) {
            return null;
        }

        $channel = self::gatewayChannels()[$channelId] ?? null;
        if (!is_array($channel) || $channel['platform'] !== $platform) {
            return null;
        }

        return $platform === 'paypal'
            ? self::paypalReturnSettlement($channel, $input, $number)
            : self::stripeReturnSettlement($channel, $input, $number);
    }

    /**
     * @param array{gateway: string, id: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function paypalReturnSettlement(array $channel, array $input, string $number): ?array
    {
        $orderId = trim((string) ($input['token'] ?? ''));
        if (!self::validTrade($orderId)) {
            return null;
        }
        $token = self::paypalAccessToken($channel);
        if ($token === null) {
            return null;
        }

        $response = self::paypalApi(
            $channel,
            'POST',
            '/v2/checkout/orders/' . rawurlencode($orderId) . '/capture',
            '{}',
            $token
        );
        if (
            $response === null
            || !in_array($response['status'], [200, 201], true)
            || strtoupper((string) ($response['data']['status'] ?? '')) !== 'COMPLETED'
        ) {
            return null;
        }

        $settlement = self::paypalSettlement(
            $response['data'],
            (string) ($channel['provider']['currency'] ?? '')
        );
        if ($settlement === null || $settlement['number'] !== $number) {
            return null;
        }

        return $settlement;
    }

    /**
     * @param array{gateway: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function stripeReturnSettlement(array $channel, array $input, string $number): ?array
    {
        $sessionId = trim((string) ($input['session_id'] ?? ''));
        if (preg_match('/^cs_(?:test|live)_[A-Za-z0-9_]{8,200}$/D', $sessionId) !== 1) {
            return null;
        }
        $response = self::requestJson(
            'GET',
            $channel['gateway'] . '/v1/checkout/sessions/' . rawurlencode($sessionId),
            null,
            [
                'Authorization: Bearer ' . $channel['secret'],
                'Accept: application/json',
            ]
        );
        if ($response === null || $response['status'] < 200 || $response['status'] >= 300) {
            return null;
        }

        $session = $response['data'];
        $sessionNumber = self::field($session, ['client_reference_id']);
        if (
            strtolower((string) ($session['payment_status'] ?? '')) !== 'paid'
            || $sessionNumber !== $number
            || strtolower((string) ($session['currency'] ?? '')) !== strtolower((string) ($channel['provider']['currency'] ?? ''))
        ) {
            return null;
        }
        $amount = self::callbackFen((string) ($session['amount_total'] ?? ''));
        $trade = self::field($session, ['payment_intent', 'id']);
        if ($amount === null || !self::validTrade($trade)) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array{gateway: string, id: string, secret: string} $channel
     * @return array<string, mixed>|null
     */
    private static function paypalOrder(array $channel, string $orderId, string $token): ?array
    {
        $response = self::paypalApi(
            $channel,
            'GET',
            '/v2/checkout/orders/' . rawurlencode($orderId),
            null,
            $token
        );
        if ($response === null || $response['status'] < 200 || $response['status'] >= 300) {
            return null;
        }

        return $response['data'];
    }

    /**
     * @param array<string, mixed> $orderData
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function paypalSettlement(array $orderData, string $currency): ?array
    {
        if (strtoupper((string) ($orderData['status'] ?? '')) !== 'COMPLETED') {
            return null;
        }
        $units = is_array($orderData['purchase_units'] ?? null) ? $orderData['purchase_units'] : [];
        $unit = is_array($units[0] ?? null) ? $units[0] : [];
        $captures = is_array($unit['payments']['captures'] ?? null) ? $unit['payments']['captures'] : [];
        $capture = is_array($captures[0] ?? null) ? $captures[0] : [];
        $number = self::field($unit, ['custom_id', 'reference_id', 'invoice_id']);
        if (!self::validOrderNumber($number)) {
            $number = self::field($capture, ['custom_id', 'invoice_id']);
        }

        $amount = self::callbackAmount((string) ($capture['amount']['value'] ?? ''));
        if ($amount === null) {
            $amount = self::callbackAmount((string) ($unit['amount']['value'] ?? ''));
        }
        $actualCurrency = strtoupper((string) ($capture['amount']['currency_code'] ?? ''));
        if ($actualCurrency === '') {
            $actualCurrency = strtoupper((string) ($unit['amount']['currency_code'] ?? ''));
        }
        $trade = self::field($capture, ['id']);
        if (!self::validTrade($trade)) {
            $trade = self::field($orderData, ['id']);
        }
        if (
            strtoupper((string) ($capture['status'] ?? '')) !== 'COMPLETED'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || $amount === null
            || $amount <= 0
            || $actualCurrency !== strtoupper($currency)
        ) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * @param array<string, string> $headers
     */
    private static function header(array $headers, string $name): string
    {
        return trim($headers[strtolower($name)] ?? '');
    }

    /**
     * Copy channels saved by the previous per-method accordion into the new
     * channel list. Runs once from the admin settings page, then the new list
     * is non-empty and this becomes a no-op.
     */
    public static function migrateLegacyChannels(): void
    {
        try {
            $all = Options::instance()->all();
            $current = $all['Downloads_Payment_Gateways'] ?? null;
            if (is_array($current) && $current !== []) {
                return;
            }

            $configs = self::legacyConfigs($all);
            if ($configs === []) {
                return;
            }

            $blocks = [];
            foreach ($configs as $config) {
                $platform = $config['platform'];
                unset($config['platform'], $config['key_env']);
                $blocks[] = ['name' => $platform, 'data' => $config];
            }

            $payload = ['Downloads_Payment_Gateways' => $blocks];
            $channels = self::legacyChannelValues($all);
            if (!array_key_exists('Downloads_Balance_Enabled', $all) && is_array($channels['balance'] ?? null)) {
                $payload['Downloads_Balance_Enabled'] = self::truthy($channels['balance']['enabled'] ?? false);
            }
            if (!array_key_exists('Downloads_Points_Enabled', $all) && is_array($channels['points'] ?? null)) {
                $payload['Downloads_Points_Enabled'] = self::truthy($channels['points']['enabled'] ?? false);
                if (is_numeric($channels['points']['rate'] ?? null)) {
                    $payload['Downloads_Points_Rate'] = max(1, min(100000, (int) $channels['points']['rate']));
                }
            }

            Settings::save($payload);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat payment channel migration failed: ' . $exception->getMessage());
        }
    }

    private static function enabled(): bool
    {
        return (Settings::values()['Downloads_Payment_Enabled'] ?? false) === true;
    }

    private static function truthy(mixed $value): bool
    {
        return $value === true
            || $value === 1
            || $value === '1'
            || $value === 'true'
            || $value === 'on'
            || $value === 'yes';
    }

    /**
     * @return list<array<string, mixed>>
     */
    private static function channelConfigs(): array
    {
        $all = Options::instance()->all();
        $blocks = Settings::values()['Downloads_Payment_Gateways'] ?? [];
        $configs = [];
        if (is_array($blocks) && array_is_list($blocks)) {
            foreach ($blocks as $entry) {
                if (!is_array($entry)) {
                    continue;
                }
                $platform = strtolower(trim((string) ($entry['name'] ?? '')));
                if (!isset(self::PLATFORMS[$platform])) {
                    continue;
                }
                $data = is_array($entry['data'] ?? null) ? $entry['data'] : [];
                $configs[] = ['platform' => $platform] + $data;
            }
        }
        if ($configs !== []) {
            return $configs;
        }
        if (array_key_exists('Downloads_Payment_Gateways', $all)) {
            return [];
        }

        return self::legacyConfigs($all);
    }

    /**
     * @param array<string, mixed> $all
     * @return list<array<string, mixed>>
     */
    private static function legacyConfigs(array $all): array
    {
        $configs = [];
        $channels = self::legacyChannelValues($all);

        foreach (self::METHODS as $method => $label) {
            $config = $channels[$method] ?? null;
            if (!is_array($config) || !self::truthy($config['enabled'] ?? false)) {
                continue;
            }

            $platform = strtolower(trim((string) ($config['platform'] ?? 'epay')));
            if (!isset(self::PLATFORMS[$platform]) || $platform === 'official') {
                $platform = 'epay';
            }

            $configs[] = [
                'platform' => $platform,
                'label' => $label,
                'methods' => [$method],
                'gateway' => $config['gateway'] ?? '',
                'endpoint' => $config['endpoint'] ?? 'submit.php',
                'merchant_id' => $config['merchant_id'] ?? '',
                'key' => self::legacySecret($config),
                'sign_mode' => $config['sign_mode'] ?? 'md5',
                'merchant_private_key' => $config['merchant_private_key'] ?? '',
                'platform_public_key' => $config['platform_public_key'] ?? '',
                'site_name' => $config['site_name'] ?? '',
            ];
        }

        if ($configs !== []) {
            return $configs;
        }

        $gateway = trim((string) ($all['Downloads_Gateway'] ?? ''));
        if ($gateway === '') {
            return [];
        }

        $method = strtolower(trim((string) ($all['Downloads_Payment_Method'] ?? 'alipay')));
        if (!isset(self::METHODS[$method])) {
            return [];
        }

        return [[
            'platform' => 'epay',
            'label' => self::METHODS[$method],
            'methods' => [$method],
            'gateway' => $gateway,
            'endpoint' => 'submit.php',
            'merchant_id' => $all['Downloads_Merchant_ID'] ?? '',
            'key' => self::legacySecret([
                'key' => $all['Downloads_Merchant_Key'] ?? '',
                'key_env' => $all['Downloads_Merchant_Key_Env'] ?? '',
            ]),
        ]];
    }

    /**
     * @param array<string, mixed> $all
     * @return array<string, array<string, mixed>>
     */
    private static function legacyChannelValues(?array $all = null): array
    {
        $all ??= Options::instance()->all();
        $value = $all['Downloads_Payment_Channels'] ?? [];

        return is_array($value) ? $value : [];
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function legacySecret(array $config): string
    {
        $key = trim((string) ($config['key'] ?? ''));
        if ($key !== '') {
            return $key;
        }

        $variable = trim((string) ($config['key_env'] ?? ''));
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,99}$/D', $variable) !== 1) {
            return '';
        }

        $value = getenv($variable);

        return is_string($value) ? trim($value) : '';
    }

    /**
     * @param array<string, mixed> $config
     * @return array{platform: string, methods: list<string>, label: string, gateway: string, endpoint: string, site_name: string, id: string, secret: string, public_key: string, token: string, provider: array<string, mixed>}|null
     */
    private static function prepare(array $config): ?array
    {
        $platform = strtolower(trim((string) ($config['platform'] ?? 'epay')));
        if (!isset(self::PLATFORMS[$platform])) {
            return null;
        }

        $methods = self::methods($config['methods'] ?? null, $platform);
        if ($methods === []) {
            return null;
        }

        $label = trim((string) ($config['label'] ?? ''));
        if (function_exists('mb_substr')) {
            $label = mb_substr($label, 0, 48, 'UTF-8');
        } elseif (strlen($label) > 48) {
            $label = substr($label, 0, 48);
        }
        $siteName = trim((string) ($config['site_name'] ?? ''));
        if (function_exists('mb_substr')) {
            $siteName = mb_substr($siteName, 0, 64, 'UTF-8');
        } elseif (strlen($siteName) > 64) {
            $siteName = substr($siteName, 0, 64);
        }

        $gateway = rtrim(trim((string) ($config['gateway'] ?? '')), '/');
        if ($platform === 'wechat') {
            $gateway = 'https://api.mch.weixin.qq.com';
        } elseif ($platform === 'paypal') {
            $gateway = self::truthy($config['sandbox'] ?? false)
                ? 'https://api-m.sandbox.paypal.com'
                : 'https://api-m.paypal.com';
        } elseif ($platform === 'stripe') {
            $gateway = 'https://api.stripe.com';
        }
        if (!self::validGateway($gateway, $platform === 'vmq')) {
            return null;
        }

        $channel = [
            'platform' => $platform,
            'methods' => $methods,
            'label' => $label,
            'gateway' => $gateway,
            'endpoint' => '',
            'site_name' => $siteName,
            'id' => '',
            'secret' => '',
            'public_key' => '',
            'token' => '',
            'provider' => [],
        ];

        if ($platform === 'official') {
            $appId = trim((string) ($config['app_id'] ?? ''));
            $secret = self::privateKey($config['private_key'] ?? '');
            $publicKey = self::publicKey($config['public_key'] ?? '');
            if (
                preg_match('/^[0-9]{6,32}$/D', $appId) !== 1
                || $secret === null
                || $publicKey === null
            ) {
                return null;
            }

            $channel['methods'] = ['alipay'];
            $channel['id'] = $appId;
            $channel['secret'] = $secret;
            $channel['public_key'] = $publicKey;

            return $channel;
        }

        if ($platform === 'wechat') {
            $appId = trim((string) ($config['app_id'] ?? ''));
            $mchId = trim((string) ($config['mch_id'] ?? ''));
            $serialNo = strtoupper(trim((string) ($config['serial_no'] ?? '')));
            $privateKey = self::privateKey($config['private_key'] ?? '');
            $apiV3Key = trim((string) ($config['api_v3_key'] ?? ''));
            $platformKey = self::publicKey(
                $config['platform_public_key'] ?? ($config['platform_cert'] ?? '')
            );
            if (
                preg_match('/^[A-Za-z0-9_@.-]{6,64}$/D', $appId) !== 1
                || preg_match('/^[0-9]{6,32}$/D', $mchId) !== 1
                || preg_match('/^[A-F0-9]{16,64}$/D', $serialNo) !== 1
                || $privateKey === null
                || strlen($apiV3Key) !== 32
                || $platformKey === null
            ) {
                return null;
            }

            $channel['methods'] = ['wxpay'];
            $channel['id'] = $appId;
            $channel['secret'] = $privateKey;
            $channel['public_key'] = $platformKey;
            $channel['token'] = $apiV3Key;
            $channel['provider'] = [
                'mch_id' => $mchId,
                'serial_no' => $serialNo,
                'api_v3_key' => $apiV3Key,
            ];

            return $channel;
        }

        if ($platform === 'paypal') {
            $clientId = trim((string) ($config['client_id'] ?? ''));
            $clientSecret = trim((string) ($config['client_secret'] ?? ''));
            $currency = strtoupper(trim((string) ($config['currency'] ?? 'USD')));
            $webhookId = trim((string) ($config['webhook_id'] ?? ''));
            if (
                preg_match('/^[A-Za-z0-9._-]{6,255}$/D', $clientId) !== 1
                || strlen($clientSecret) < 10
                || strlen($clientSecret) > 512
                || preg_match('/^[A-Z]{3}$/D', $currency) !== 1
                || strlen($webhookId) > 128
            ) {
                return null;
            }

            $channel['methods'] = ['paypal'];
            $channel['id'] = $clientId;
            $channel['secret'] = $clientSecret;
            $channel['provider'] = [
                'sandbox' => self::truthy($config['sandbox'] ?? false),
                'currency' => $currency,
                'webhook_id' => $webhookId,
            ];

            return $channel;
        }

        if ($platform === 'stripe') {
            $secretKey = trim((string) ($config['secret_key'] ?? ''));
            $webhookSecret = trim((string) ($config['webhook_secret'] ?? ''));
            $currency = strtoupper(trim((string) ($config['currency'] ?? 'USD')));
            if (
                preg_match('/^(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{8,}$/D', $secretKey) !== 1
                || ($webhookSecret !== '' && preg_match('/^whsec_[A-Za-z0-9]{8,}$/D', $webhookSecret) !== 1)
                || preg_match('/^[A-Z]{3}$/D', $currency) !== 1
            ) {
                return null;
            }

            $channel['methods'] = ['card'];
            $channel['id'] = 'stripe';
            $channel['secret'] = $secretKey;
            $channel['provider'] = [
                'sandbox' => str_contains($secretKey, '_test_'),
                'currency' => $currency,
                'webhook_secret' => $webhookSecret,
            ];

            return $channel;
        }

        if ($platform === 'xunhupay') {
            $appId = trim((string) ($config['appid'] ?? ''));
            $secret = self::merchantSecret($config);
            if (
                preg_match('/^[A-Za-z0-9._-]{4,64}$/D', $appId) !== 1
                || $secret === null
            ) {
                return null;
            }

            $channel['id'] = $appId;
            $channel['secret'] = $secret;

            return $channel;
        }

        if (in_array($platform, ['xhpay', 'payjs'], true)) {
            $merchantId = trim((string) ($config['merchant_id'] ?? ''));
            $secret = self::merchantSecret($config);
            if (
                preg_match('/^[0-9]{1,32}$/D', $merchantId) !== 1
                || $secret === null
            ) {
                return null;
            }

            $channel['id'] = $merchantId;
            $channel['secret'] = $secret;

            return $channel;
        }

        if ($platform === 'vmq') {
            $secret = self::merchantSecret($config);
            if ($secret === null) {
                return null;
            }

            $channel['secret'] = $secret;

            return $channel;
        }

        if ($platform === 'codepay') {
            $merchantId = trim((string) ($config['merchant_id'] ?? ''));
            $secret = self::merchantSecret($config);
            $token = trim((string) ($config['token'] ?? ''));
            $version = strtolower(trim((string) ($config['version'] ?? 'auto')));
            if (!in_array($version, ['auto', 'v1', 'v2'], true)) {
                $version = 'auto';
            }
            if (
                preg_match('/^[0-9]{1,32}$/D', $merchantId) !== 1
                || $secret === null
                || $token === ''
                || strlen($token) > 128
            ) {
                return null;
            }

            $channel['id'] = $merchantId;
            $channel['secret'] = $secret;
            $channel['token'] = $token;
            $channel['provider'] = ['version' => $version];

            return $channel;
        }

        $endpoint = self::endpoint($config['endpoint'] ?? '');
        $merchantId = trim((string) ($config['merchant_id'] ?? ''));
        $signMode = strtolower(trim((string) ($config['sign_mode'] ?? 'md5')));
        if (!in_array($signMode, ['md5', 'rsa'], true)) {
            $signMode = 'md5';
        }
        if (
            $endpoint === null
            || preg_match('/^[0-9]{1,32}$/D', $merchantId) !== 1
        ) {
            return null;
        }

        $channel['endpoint'] = $endpoint;
        $channel['id'] = $merchantId;

        if ($signMode === 'rsa') {
            $privateKey = self::privateKey(
                $config['merchant_private_key'] ?? ($config['private_key'] ?? '')
            );
            $platformPublicKey = self::publicKey(
                $config['platform_public_key'] ?? ($config['public_key'] ?? '')
            );
            if ($privateKey === null || $platformPublicKey === null) {
                return null;
            }

            $merchantKey = self::merchantSecret($config);
            $channel['secret'] = $privateKey;
            $channel['public_key'] = $platformPublicKey;
            $channel['provider'] = [
                'sign_mode' => 'rsa',
                'merchant_key' => $merchantKey ?? '',
            ];

            return $channel;
        }

        $secret = self::merchantSecret($config);
        if ($secret === null) {
            return null;
        }

        $channel['secret'] = $secret;
        $channel['provider'] = ['sign_mode' => 'md5'];

        return $channel;
    }

    /**
     * @return list<string>
     */
    private static function methods(mixed $value, string $platform): array
    {
        $allowed = match ($platform) {
            'official' => ['alipay'],
            'wechat' => ['wxpay'],
            'paypal' => ['paypal'],
            'stripe' => ['card'],
            'xunhupay', 'xhpay', 'payjs', 'vmq' => ['alipay', 'wxpay'],
            'codepay' => ['alipay', 'wxpay', 'qqpay'],
            default => ['alipay', 'wxpay', 'qqpay'],
        };

        $methods = [];
        foreach (is_array($value) ? $value : [] as $method) {
            if (!is_scalar($method)) {
                continue;
            }
            $method = strtolower(trim((string) $method));
            if (
                isset(self::METHODS[$method])
                && in_array($method, $allowed, true)
                && !in_array($method, $methods, true)
            ) {
                $methods[] = $method;
            }
        }

        if ($platform === 'official') {
            return ['alipay'];
        }

        return $methods;
    }

    /**
     * @param array{platform: string, methods: list<string>, label: string} $channel
     */
    private static function channelLabel(array $channel, string $method): string
    {
        $custom = $channel['label'];
        $methodLabel = self::METHODS[$method] ?? $method;
        if ($custom === '') {
            if ($channel['platform'] === 'official') {
                return '支付宝官方';
            }
            if (in_array($channel['platform'], self::LAUNCH_PLATFORMS, true)) {
                return (self::PLATFORMS[$channel['platform']] ?? $methodLabel) . ' · ' . $methodLabel;
            }

            return $methodLabel;
        }

        return count($channel['methods']) > 1 ? $custom . ' · ' . $methodLabel : $custom;
    }

    /**
     * @param array{method: string, gateway: string, endpoint: string, site_name: string, id: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $order
     */
    private static function compatibleCheckout(array $channel, array $order): string
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return '';
        }
        $params = [
            'pid' => $channel['id'],
            'type' => $channel['method'],
            'out_trade_no' => (string) ($order['number'] ?? ''),
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'name' => mb_substr((string) ($order['title'] ?? ''), 0, 64, 'UTF-8'),
            'money' => Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)),
        ];
        if ($channel['site_name'] !== '') {
            $params['sitename'] = $channel['site_name'];
        }

        if (strtolower((string) ($channel['provider']['sign_mode'] ?? 'md5')) === 'rsa') {
            $params['timestamp'] = (string) time();
            $signature = self::rsaSignString(self::signable($params), $channel['secret']);
            if ($signature === '') {
                error_log('SunkenBoat epay RSA request signing failed.');

                return '';
            }
            $params['sign'] = $signature;
            $params['sign_type'] = 'RSA';
        } else {
            $params['sign'] = self::md5Sign($params, $channel['secret']);
            $params['sign_type'] = 'MD5';
        }

        return $channel['gateway'] . '/' . $channel['endpoint'] . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Alipay computer website payment (alipay.trade.page.pay) with RSA2.
     *
     * @param array{method: string, gateway: string, id: string, secret: string} $channel
     * @param array<string, mixed> $order
     */
    private static function officialCheckout(array $channel, array $order): string
    {
        if ($channel['method'] !== 'alipay') {
            return '';
        }

        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return '';
        }

        $subject = trim((string) ($order['title'] ?? ''));
        if ($subject === '') {
            $subject = '付费下载';
        }
        $bizContent = json_encode([
            'out_trade_no' => (string) ($order['number'] ?? ''),
            'total_amount' => Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)),
            'subject' => mb_substr($subject, 0, 128, 'UTF-8'),
            'product_code' => 'FAST_INSTANT_TRADE_PAY',
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($bizContent) || $bizContent === '') {
            return '';
        }

        $params = [
            'app_id' => $channel['id'],
            'method' => 'alipay.trade.page.pay',
            'format' => 'JSON',
            'charset' => 'utf-8',
            'sign_type' => 'RSA2',
            'timestamp' => (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Shanghai')))
                ->format('Y-m-d H:i:s'),
            'version' => '1.0',
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'biz_content' => $bizContent,
        ];
        $signature = self::rsaSign($params, $channel['secret']);
        if ($signature === '') {
            error_log('SunkenBoat Alipay checkout signing failed.');

            return '';
        }
        $params['sign'] = $signature;

        return $channel['gateway'] . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * 虎皮椒 V3 (迅虎 xunhupay) accepts a JSON POST and returns a payment URL.
     *
     * @param array{method: string, gateway: string, id: string, secret: string, site_name: string} $channel
     * @param array<string, mixed> $order
     * @return array{url: string}|null
     */
    private static function xunhupayCheckout(array $channel, array $order): ?array
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return null;
        }

        $method = $channel['method'] === 'alipay' ? 'alipay' : 'wechat';
        $title = mb_substr(trim((string) ($order['title'] ?? '')), 0, 32, 'UTF-8');
        $params = [
            'version' => '1.1',
            'lang' => 'zh-cn',
            'plugins' => 'ttdf_sunken_' . $method,
            'appid' => $channel['id'],
            'trade_order_id' => (string) ($order['number'] ?? ''),
            'payment' => $method,
            'total_fee' => Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)),
            'title' => $title !== '' ? $title : '付费下载',
            'time' => time(),
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'callback_url' => $returnUrl,
            'nonce_str' => bin2hex(random_bytes(16)),
        ];
        if ($method === 'wechat') {
            $base = self::baseUrl();
            if ($base === '') {
                $base = Typecho::siteUrl();
            }
            $name = $channel['site_name'] !== '' ? $channel['site_name'] : '付费下载';
            $params['type'] = 'WAP';
            $params['wap_url'] = $base;
            $params['wap_name'] = mb_substr($name, 0, 32, 'UTF-8');
        }
        $params['hash'] = self::xhHash($params, $channel['secret']);

        $response = self::postJson($channel['gateway'], $params);
        if ($response === null) {
            return null;
        }

        $hash = self::field($response, ['hash']);
        if (
            $hash === ''
            || !hash_equals(self::xhHash($response, $channel['secret']), strtolower($hash))
        ) {
            error_log('SunkenBoat xunhupay response signature mismatch.');

            return null;
        }
        if ((string) ($response['errcode'] ?? '') !== '0') {
            error_log('SunkenBoat xunhupay error: ' . (string) ($response['errmsg'] ?? 'unknown'));

            return null;
        }

        $url = self::field($response, ['url']);
        if (str_starts_with($url, '//')) {
            $url = 'https:' . $url;
        }

        return self::isSafeUrl($url) ? ['url' => $url] : null;
    }

    /**
     * 迅虎 PAY cashier mode. total_fee is in cents.
     *
     * @param array{method: string, gateway: string, id: string, secret: string} $channel
     * @param array<string, mixed> $order
     * @return array{url: string}|null
     */
    private static function xhpayCheckout(array $channel, array $order): ?array
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return null;
        }

        $method = $channel['method'] === 'alipay' ? 'alipay' : 'wechat';
        $title = mb_substr(trim((string) ($order['title'] ?? '')), 0, 64, 'UTF-8');
        $data = [
            'mchid' => $channel['id'],
            'total_fee' => (int) ($order['amount_cents'] ?? 0),
            'out_trade_no' => (string) ($order['number'] ?? ''),
            'body' => $title !== '' ? $title : '付费下载',
            'goods_detail' => $title !== '' ? $title : '付费下载',
            'notify_url' => $notifyUrl,
            'type' => $method,
            'attach' => 'ttdf_sunken_' . $method,
            'nonce_str' => bin2hex(random_bytes(16)),
            'redirect_url' => $returnUrl,
        ];
        $data['sign'] = self::xhpaySign($data, $channel['secret']);
        $path = $method === 'alipay' ? '/alipaycashier' : '/pay/cashier';

        return [
            'url' => $channel['gateway'] . $path . '?'
                . http_build_query($data, '', '&', PHP_QUERY_RFC3986),
        ];
    }

    /**
     * PAYJS cashier mode. total_fee is in cents.
     *
     * @param array{method: string, gateway: string, id: string, secret: string} $channel
     * @param array<string, mixed> $order
     * @return array{url: string}|null
     */
    private static function payjsCheckout(array $channel, array $order): ?array
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return null;
        }

        $title = mb_substr(trim((string) ($order['title'] ?? '')), 0, 64, 'UTF-8');
        $data = [
            'mchid' => $channel['id'],
            'total_fee' => (int) ($order['amount_cents'] ?? 0),
            'out_trade_no' => (string) ($order['number'] ?? ''),
            'body' => $title !== '' ? $title : '付费下载',
            'notify_url' => $notifyUrl,
            'callback_url' => $returnUrl,
            'attach' => 'ttdf_sunken',
        ];
        if ($channel['method'] === 'alipay') {
            $data['type'] = 'alipay';
        }
        $data['sign'] = self::payjsSign($data, $channel['secret']);

        return [
            'url' => $channel['gateway'] . '?'
                . http_build_query($data, '', '&', PHP_QUERY_RFC3986),
        ];
    }

    /**
     * V免签 createOrder endpoint returns a self-contained payment page when
     * isHtml=1, so the browser can be redirected to it directly.
     *
     * @param array{method: string, gateway: string, secret: string} $channel
     * @param array<string, mixed> $order
     * @return array{url: string}|null
     */
    private static function vmqCheckout(array $channel, array $order): ?array
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return null;
        }

        $type = $channel['method'] === 'alipay' ? '2' : '1';
        $param = $channel['method'] . '|' . $returnUrl;
        $price = Downloads::formatAmount((int) ($order['amount_cents'] ?? 0));
        $payId = (string) ($order['number'] ?? '');
        $data = [
            'payId' => $payId,
            'type' => $type,
            'price' => $price,
            'notifyUrl' => $notifyUrl,
            'returnUrl' => $returnUrl,
            'param' => $param,
            'isHtml' => '1',
        ];
        $data['sign'] = md5($payId . $param . $type . $price . $channel['secret']);

        return [
            'url' => rtrim($channel['gateway'], '/') . '/createOrder?'
                . http_build_query($data, '', '&', PHP_QUERY_RFC3986),
        ];
    }

    /**
     * 码支付 (codepay) returns a QR image URL, so a small local page is used
     * instead of redirecting the browser straight to an image.
     *
     * @param array{method: string, gateway: string, id: string, secret: string, token: string} $channel
     * @param array<string, mixed> $order
     * @return array{url: string, html: bool}|null
     */
    private static function codepayCheckout(array $channel, array $order): ?array
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        if ($notifyUrl === '' || $returnUrl === '') {
            return null;
        }

        $type = match ($channel['method']) {
            'wxpay' => '3',
            'qqpay' => '2',
            default => '1',
        };
        $data = [
            'id' => $channel['id'],
            'token' => $channel['token'],
            'pay_id' => (string) ($order['number'] ?? ''),
            'type' => $type,
            'price' => Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)),
            'param' => 'ttdf_sunken',
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
        ];
        $data['sign'] = self::codepaySign($data, $channel['secret']);
        $url = rtrim($channel['gateway'], '/') . '/creat_order/?'
            . http_build_query($data, '', '&', PHP_QUERY_RFC3986)
            . '&page=4';
        $response = self::getJson($url);
        if ($response === null || (string) ($response['status'] ?? '') !== '0') {
            error_log('SunkenBoat codepay error: ' . (string) ($response['msg'] ?? 'unknown'));

            return null;
        }

        $qrcode = self::field($response, ['qrcode']);
        if (str_starts_with($qrcode, '/')) {
            $qrcode = rtrim($channel['gateway'], '/') . $qrcode;
        }
        $image = self::imageSrc($qrcode);
        if ($image === '') {
            return null;
        }

        return ['url' => self::qrPage($order, $image, $returnUrl), 'html' => true];
    }

    /**
     * WeChat Pay API v3 Native order. The merchant private key signs the API
     * request locally; only the returned code_url is exposed to the browser.
     *
     * @param array{method: string, gateway: string, id: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $order
     * @return array{url: string, html: bool}|null
     */
    private static function wechatCheckout(array $channel, array $order): ?array
    {
        $notifyUrl = self::notifyUrl();
        $returnUrl = Downloads::returnUrl($order);
        $mchId = trim((string) ($channel['provider']['mch_id'] ?? ''));
        $serialNo = trim((string) ($channel['provider']['serial_no'] ?? ''));
        if ($notifyUrl === '' || $returnUrl === '' || $mchId === '' || $serialNo === '') {
            return null;
        }

        $description = trim((string) ($order['title'] ?? ''));
        if ($description === '') {
            $description = '付费下载';
        }
        $body = json_encode([
            'appid' => $channel['id'],
            'mchid' => $mchId,
            'description' => mb_substr($description, 0, 64, 'UTF-8'),
            'out_trade_no' => (string) ($order['number'] ?? ''),
            'notify_url' => $notifyUrl,
            'amount' => [
                'total' => (int) ($order['amount_cents'] ?? 0),
                'currency' => 'CNY',
            ],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($body) || $body === '') {
            return null;
        }

        $path = '/v3/pay/transactions/native';
        $timestamp = time();
        $nonce = bin2hex(random_bytes(16));
        $message = "POST\n" . $path . "\n" . $timestamp . "\n" . $nonce . "\n" . $body . "\n";
        $signature = self::rsaSignString($message, $channel['secret']);
        if ($signature === '') {
            error_log('SunkenBoat WeChat Pay request signing failed.');

            return null;
        }
        $authorization = 'WECHATPAY2-SHA256-RSA2048 '
            . 'mchid="' . $mchId . '",'
            . 'nonce_str="' . $nonce . '",'
            . 'timestamp="' . $timestamp . '",'
            . 'serial_no="' . $serialNo . '",'
            . 'signature="' . $signature . '"';

        $response = self::requestJson('POST', $channel['gateway'] . $path, $body, [
            'Authorization: ' . $authorization,
            'Accept: application/json',
        ]);
        if ($response === null || $response['status'] < 200 || $response['status'] >= 300) {
            error_log('SunkenBoat WeChat Pay order failed.');

            return null;
        }

        $codeUrl = self::field($response['data'] ?? [], ['code_url']);
        if (preg_match('#^weixin://[A-Za-z0-9?=&_./:%+-]+$#D', $codeUrl) !== 1) {
            return null;
        }
        $image = QrCode::dataUri($codeUrl);
        if ($image === '') {
            return null;
        }

        return ['url' => self::qrPage($order, $image, $returnUrl), 'html' => true];
    }

    /**
     * @param array{method: string, gateway: string, id: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $order
     * @return array{url: string}|null
     */
    private static function paypalCheckout(array $channel, array $order, string $channelId): ?array
    {
        $returnUrl = self::providerReturnUrl($channelId, 'paypal', $order);
        $cancelUrl = Downloads::returnUrl($order);
        $currency = (string) ($channel['provider']['currency'] ?? '');
        $number = (string) ($order['number'] ?? '');
        if ($returnUrl === '' || $cancelUrl === '' || $currency === '' || !self::validOrderNumber($number)) {
            return null;
        }

        $token = self::paypalAccessToken($channel);
        if ($token === null) {
            return null;
        }

        $title = trim((string) ($order['title'] ?? ''));
        if ($title === '') {
            $title = '付费下载';
        }
        $body = json_encode([
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'reference_id' => $number,
                'custom_id' => $number,
                'invoice_id' => substr($number, 0, 127),
                'description' => mb_substr($title, 0, 127, 'UTF-8'),
                'amount' => [
                    'currency_code' => $currency,
                    'value' => Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)),
                ],
            ]],
            'application_context' => [
                'brand_name' => mb_substr((string) (Typecho::options()?->title ?? 'SunkenBoat'), 0, 127, 'UTF-8'),
                'user_action' => 'PAY_NOW',
                'return_url' => $returnUrl,
                'cancel_url' => $cancelUrl,
            ],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($body) || $body === '') {
            return null;
        }

        $response = self::paypalApi($channel, 'POST', '/v2/checkout/orders', $body, $token);
        if ($response === null || $response['status'] < 200 || $response['status'] >= 300) {
            error_log('SunkenBoat PayPal order failed.');

            return null;
        }
        $url = self::paypalLink($response['data'] ?? [], 'approve');

        return self::isSafeUrl($url) ? ['url' => $url] : null;
    }

    /**
     * @param array{method: string, gateway: string, id: string, secret: string, provider: array<string, mixed>} $channel
     * @param array<string, mixed> $order
     * @return array{url: string}|null
     */
    private static function stripeCheckout(array $channel, array $order, string $channelId): ?array
    {
        $returnUrl = self::providerReturnUrl($channelId, 'stripe', $order);
        $cancelUrl = Downloads::returnUrl($order);
        $currency = strtolower((string) ($channel['provider']['currency'] ?? ''));
        $number = (string) ($order['number'] ?? '');
        if ($returnUrl === '' || $cancelUrl === '' || $currency === '' || !self::validOrderNumber($number)) {
            return null;
        }

        $title = trim((string) ($order['title'] ?? ''));
        if ($title === '') {
            $title = '付费下载';
        }
        $body = http_build_query([
            'mode' => 'payment',
            'success_url' => $returnUrl . '&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => $cancelUrl,
            'client_reference_id' => $number,
            'line_items[0][quantity]' => 1,
            'line_items[0][price_data][currency]' => $currency,
            'line_items[0][price_data][unit_amount]' => (int) ($order['amount_cents'] ?? 0),
            'line_items[0][price_data][product_data][name]' => mb_substr($title, 0, 127, 'UTF-8'),
            'metadata[order_number]' => $number,
            'payment_intent_data[metadata][order_number]' => $number,
        ], '', '&', PHP_QUERY_RFC3986);

        $response = self::requestJson('POST', $channel['gateway'] . '/v1/checkout/sessions', $body, [
            'Authorization: Bearer ' . $channel['secret'],
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json',
        ]);
        if ($response === null || $response['status'] < 200 || $response['status'] >= 300) {
            error_log('SunkenBoat Stripe Checkout failed.');

            return null;
        }
        $url = self::field($response['data'] ?? [], ['url']);

        return self::isSafeUrl($url) ? ['url' => $url] : null;
    }

    private static function providerReturnUrl(string $channelId, string $platform, array $order): string
    {
        $base = self::baseUrl();
        $number = (string) ($order['number'] ?? '');
        if (
            $base === ''
            || !in_array($platform, ['paypal', 'stripe'], true)
            || !self::validOrderNumber($number)
            || preg_match('/^channel-[0-9]+-[a-z]+$/D', $channelId) !== 1
        ) {
            return '';
        }

        return $base . '/ttdf/sunken/payment/' . $platform . '/return?' . http_build_query([
            'order' => $number,
            'channel' => $channelId,
            'rt' => self::returnToken($number, $channelId),
        ], '', '&', PHP_QUERY_RFC3986);
    }

    private static function returnToken(string $number, string $channel): string
    {
        return hash_hmac('sha256', 'return|' . $number . '|' . $channel, self::secret());
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function paypalAccessToken(array $channel): ?string
    {
        $response = self::requestJson(
            'POST',
            $channel['gateway'] . '/v1/oauth2/token',
            'grant_type=client_credentials',
            [
                'Authorization: Basic ' . base64_encode($channel['id'] . ':' . $channel['secret']),
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json',
            ]
        );
        if ($response === null || $response['status'] < 200 || $response['status'] >= 300) {
            return null;
        }
        $token = self::field($response['data'] ?? [], ['access_token']);

        return preg_match('/^[A-Za-z0-9._-]{8,4096}$/D', $token) === 1 ? $token : null;
    }

    /**
     * @return array{status: int, data: array<string, mixed>}|null
     */
    private static function paypalApi(
        array $channel,
        string $method,
        string $path,
        ?string $body,
        string $token
    ): ?array {
        $headers = [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
            'Content-Type: application/json',
        ];

        $response = self::requestJson($method, $channel['gateway'] . $path, $body, $headers);
        if ($response === null) {
            return null;
        }

        return ['status' => $response['status'], 'data' => $response['data']];
    }

    /**
     * @param array<string, mixed> $data
     */
    private static function paypalLink(array $data, string $rel): string
    {
        foreach (is_array($data['links'] ?? null) ? $data['links'] : [] as $link) {
            if (!is_array($link) || (string) ($link['rel'] ?? '') !== $rel) {
                continue;
            }
            $url = trim((string) ($link['href'] ?? ''));
            if ($url !== '') {
                return $url;
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    private static function postJson(string $url, array $payload): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($body) || $body === '') {
            return null;
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'SunkenBoat-Payment/1.0',
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (
            !is_string($response)
            || $status < 200
            || $status >= 300
            || strlen($response) > 1048576
        ) {
            return null;
        }
        $decoded = json_decode($response, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, data: array<string, mixed>, raw: string}|null
     */
    private static function requestJson(string $method, string $url, ?string $body, array $headers): ?array
    {
        if (!function_exists('curl_init') || !self::isSafeUrl($url)) {
            return null;
        }

        $hasContentType = false;
        $hasAccept = false;
        foreach ($headers as $header) {
            $name = strtolower(trim(explode(':', $header, 2)[0]));
            if ($name === 'content-type') {
                $hasContentType = true;
            } elseif ($name === 'accept') {
                $hasAccept = true;
            }
        }
        if (!$hasContentType && $body !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        if (!$hasAccept) {
            $headers[] = 'Accept: application/json';
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        $options = [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'SunkenBoat-Payment/1.0',
        ];
        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (!is_string($raw) || $status < 100 || strlen($raw) > 1048576) {
            return null;
        }

        $decoded = $raw === '' ? [] : json_decode($raw, true);

        return [
            'status' => $status,
            'data' => is_array($decoded) ? $decoded : [],
            'raw' => $raw,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function getJson(string $url): ?array
    {
        if (!function_exists('curl_init')) {
            return null;
        }

        $ch = curl_init($url);
        if ($ch === false) {
            return null;
        }
        curl_setopt_array($ch, [
            CURLOPT_HTTPGET => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 20,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'SunkenBoat-Payment/1.0',
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (
            !is_string($response)
            || $status < 200
            || $status >= 300
            || strlen($response) > 1048576
        ) {
            return null;
        }
        $decoded = json_decode($response, true);

        return is_array($decoded) ? $decoded : null;
    }

    private static function imageSrc(string $value): string
    {
        if (str_starts_with($value, '//')) {
            $value = 'https:' . $value;
        }
        if (
            strlen($value) <= 524288
            && preg_match('#^data:image/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$#D', $value) === 1
        ) {
            return $value;
        }

        return self::isSafeUrl($value, true) ? $value : '';
    }

    /**
     * @param array<string, mixed> $order
     */
    private static function qrPage(array $order, string $image, string $returnUrl): string
    {
        $number = Escaper::html((string) ($order['number'] ?? ''));
        $amount = Escaper::html(Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)));
        $src = str_starts_with($image, 'data:') ? Escaper::attr($image) : Escaper::url($image);
        $return = Escaper::url($returnUrl);

        return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<meta name="robots" content="noindex,nofollow">'
            . '<title>扫码支付</title></head>'
            . '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7f9;color:#111827;font:15px/1.6 system-ui,sans-serif">'
            . '<main style="max-width:26rem;margin:24px;padding:28px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);text-align:center">'
            . '<h1 style="margin:0 0 4px;font-size:20px">扫码支付</h1>'
            . '<p style="margin:0 0 18px;color:#4b5563">订单 ' . $number . ' · ¥' . $amount . '</p>'
            . '<img src="' . $src . '" alt="支付二维码" width="240" height="240" style="display:block;width:240px;height:240px;margin:0 auto 18px;border-radius:12px;background:#fff">'
            . '<p style="margin:0 0 18px;color:#6b7280">请使用对应的支付应用扫码完成付款，付款后点击下方按钮返回。</p>'
            . '<a href="' . $return . '" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#111827;color:#fff;text-decoration:none">我已完成支付</a>'
            . '</main></body></html>';
    }

    /**
     * @param array{method: string, platform: string, id: string, public_key: string} $channel
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyOfficial(array $channel, array $input): ?array
    {
        $signature = self::field($input, ['sign']);
        $number = self::field($input, ['out_trade_no', 'order_no', 'orderid', 'trade_order_no']);
        $trade = self::field($input, ['trade_no', 'transaction_id', 'api_trade_no']);
        if (
            $signature === ''
            || strtoupper(self::field($input, ['sign_type'])) !== 'RSA2'
            || !self::validOrderNumber($number)
            || !self::validTrade($trade)
            || !self::paidStatus($input)
        ) {
            return null;
        }

        $appId = self::field($input, ['app_id', 'auth_app_id']);
        if ($appId === '' || $appId !== $channel['id']) {
            return null;
        }

        $amount = self::callbackAmount(self::field($input, [
            'total_amount',
            'money',
            'amount',
            'total_fee',
        ]));
        if ($amount === null || $amount <= 0) {
            return null;
        }
        if (!self::rsaVerify($input, $signature, $channel['public_key'])) {
            return null;
        }

        return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
    }

    /**
     * Providers label successful callbacks differently: EasyPay uses
     * TRADE_SUCCESS, some 码支付-compatible services send status=1, and
     * Alipay may send TRADE_FINISHED for already-settled orders.
     *
     * @param array<string, mixed> $input
     */
    private static function paidStatus(array $input): bool
    {
        $status = strtoupper(self::field($input, [
            'trade_status',
            'status',
            'trade_state',
            'pay_status',
        ]));

        return in_array($status, [
            'TRADE_SUCCESS',
            'TRADE_FINISHED',
            'SUCCESS',
            'SUCCEEDED',
            'PAID',
            'COMPLETED',
            'FINISHED',
            '1',
        ], true);
    }

    /**
     * Read the first non-empty scalar field from a callback alias list.
     *
     * @param array<string, mixed> $input
     * @param list<string> $names
     */
    private static function field(array $input, array $names): string
    {
        foreach ($names as $name) {
            if (!array_key_exists($name, $input)) {
                continue;
            }

            $value = $input[$name];
            if (!is_string($value) && !is_numeric($value)) {
                continue;
            }

            $value = trim((string) $value);
            if ($value !== '') {
                return $value;
            }
        }

        return '';
    }

    /**
     * Accept cent amounts with the extra decimal places some gateways emit
     * (e.g. 1.000000) and normalize them to an integer cent value.
     */
    private static function callbackAmount(string $value): ?int
    {
        $value = str_replace([',', '¥', '￥'], '', trim($value));
        if (
            $value === ''
            || strlen($value) > 20
            || preg_match('/^(0|[1-9][0-9]{0,8})(?:\.([0-9]{1,6}))?$/D', $value, $match) !== 1
        ) {
            return null;
        }

        $fraction = (string) ($match[2] ?? '');
        $cents = ((int) $match[1]) * 100 + (int) substr(str_pad($fraction, 2, '0'), 0, 2);
        if ($fraction !== '' && strlen($fraction) > 2 && (int) $fraction[2] >= 5) {
            $cents++;
        }

        return $cents;
    }

    /**
     * PayJS / 迅虎 PAY callbacks use integer cents instead of yuan strings.
     */
    private static function callbackFen(string $value): ?int
    {
        $value = trim($value);
        if (
            $value === ''
            || strlen($value) > 12
            || preg_match('/^([0-9]{1,10})(?:\.0{1,6})?$/D', $value, $match) !== 1
        ) {
            return null;
        }

        $cents = (int) $match[1];

        return $cents > 0 ? $cents : null;
    }

    private static function validOrderNumber(string $value): bool
    {
        return preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $value) === 1;
    }

    private static function validTrade(string $value): bool
    {
        return preg_match('/^[A-Za-z0-9._:-]{1,100}$/D', $value) === 1;
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function merchantSecret(array $config): ?string
    {
        foreach (['key', 'appsecret', 'secret'] as $name) {
            $value = trim((string) ($config[$name] ?? ''));
            if ($value !== '') {
                return strlen($value) >= 16 ? $value : null;
            }
        }

        $legacy = self::legacySecret($config);

        return strlen($legacy) >= 16 ? $legacy : null;
    }

    private static function privateKey(mixed $value): ?string
    {
        $pem = self::pem($value);
        if ($pem === null) {
            return null;
        }
        foreach (self::pemVariants($pem, ['PRIVATE KEY', 'RSA PRIVATE KEY']) as $candidate) {
            if (@openssl_pkey_get_private($candidate) !== false) {
                return $candidate;
            }
        }

        return null;
    }

    private static function publicKey(mixed $value): ?string
    {
        $pem = self::pem($value);
        if ($pem === null) {
            return null;
        }
        foreach (self::pemVariants($pem, ['PUBLIC KEY', 'RSA PUBLIC KEY']) as $candidate) {
            if (@openssl_pkey_get_public($candidate) !== false) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * Accept full PEM blocks as well as bare Base64 bodies pasted from the
     * Alipay console. Literal \n sequences from JSON exports are normalized.
     */
    private static function pem(mixed $value): ?string
    {
        $pem = trim((string) $value);
        $pem = trim($pem, "\"'");
        $pem = str_replace(["\\r\\n", "\\n", "\\r"], ["\n", "\n", ''], $pem);
        if ($pem === '') {
            return null;
        }
        if (str_contains($pem, '-----BEGIN')) {
            return $pem;
        }

        $body = preg_replace('/\s+/', '', $pem);
        if (
            !is_string($body)
            || strlen($body) < 64
            || strlen($body) % 4 !== 0
            || preg_match('/^[A-Za-z0-9+\/=]+$/D', $body) !== 1
            || !is_string(base64_decode($body, true))
        ) {
            return null;
        }

        return $body;
    }

    /**
     * @param list<string> $labels
     * @return list<string>
     */
    private static function pemVariants(string $pem, array $labels): array
    {
        if (str_contains($pem, '-----BEGIN')) {
            return [$pem];
        }

        $variants = [];
        foreach ($labels as $label) {
            $variants[] = '-----BEGIN ' . $label . "-----\n"
                . chunk_split($pem, 64, "\n")
                . '-----END ' . $label . "-----\n";
        }

        return $variants;
    }

    /**
     * @param array<string, mixed> $params
     */
    private static function rsaSign(array $params, string $privateKey): string
    {
        // Alipay request signatures include sign_type; the official SDK signs
        // every non-empty parameter except sign itself.
        $data = self::signable($params, true);
        foreach (self::pemVariants($privateKey, ['PRIVATE KEY', 'RSA PRIVATE KEY']) as $candidate) {
            $key = @openssl_pkey_get_private($candidate);
            if ($key === false) {
                continue;
            }
            $signature = '';
            if (@openssl_sign($data, $signature, $key, OPENSSL_ALGO_SHA256)) {
                return base64_encode($signature);
            }
        }

        return '';
    }

    private static function rsaSignString(string $data, string $privateKey): string
    {
        foreach (self::pemVariants($privateKey, ['PRIVATE KEY', 'RSA PRIVATE KEY']) as $candidate) {
            $key = @openssl_pkey_get_private($candidate);
            if ($key === false) {
                continue;
            }
            $signature = '';
            if (@openssl_sign($data, $signature, $key, OPENSSL_ALGO_SHA256)) {
                return base64_encode($signature);
            }
        }

        return '';
    }

    private static function rsaVerifyString(string $data, string $signature, string $publicKey): bool
    {
        $binary = base64_decode(str_replace(' ', '+', $signature), true);
        if (!is_string($binary) || $binary === '') {
            return false;
        }
        foreach (self::pemVariants($publicKey, ['PUBLIC KEY', 'RSA PUBLIC KEY']) as $candidate) {
            $key = @openssl_pkey_get_public($candidate);
            if ($key === false) {
                continue;
            }
            if (@openssl_verify($data, $binary, $key, OPENSSL_ALGO_SHA256) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $params
     */
    private static function rsaVerify(array $params, string $signature, string $publicKey): bool
    {
        $binary = base64_decode(str_replace(' ', '+', $signature), true);
        if (!is_string($binary) || $binary === '') {
            return false;
        }
        // Async notifications exclude both sign and sign_type from the
        // verification string (AlipaySignature::rsaCheckV1 behaviour).
        $data = self::signable($params);
        foreach (self::pemVariants($publicKey, ['PUBLIC KEY', 'RSA PUBLIC KEY']) as $candidate) {
            $key = @openssl_pkey_get_public($candidate);
            if ($key === false) {
                continue;
            }
            if (@openssl_verify($data, $binary, $key, OPENSSL_ALGO_SHA256) === 1) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param array<string, mixed> $params
     */
    private static function signable(array $params, bool $includeSignType = false): string
    {
        unset($params['sign']);
        if (!$includeSignType) {
            unset($params['sign_type']);
        }
        ksort($params, SORT_STRING);
        $parts = [];
        foreach ($params as $name => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            if ((string) $value === '') {
                continue;
            }
            $parts[] = $name . '=' . $value;
        }

        return implode('&', $parts);
    }

    private static function endpoint(mixed $value): ?string
    {
        $path = trim((string) $value);
        if ($path === '') {
            return 'submit.php';
        }
        if (
            strlen($path) > 120
            || preg_match('#^[A-Za-z0-9._~/-]+$#D', $path) !== 1
        ) {
            return null;
        }

        $path = ltrim($path, '/');
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                return null;
            }
        }

        return $path;
    }

    private static function validGateway(string $gateway, bool $allowHttp = false): bool
    {
        $parts = parse_url($gateway);
        if (
            !is_array($parts)
            || empty($parts['host'])
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
            || isset($parts['query'])
            || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\]/', $gateway) === 1
            || filter_var($gateway, FILTER_VALIDATE_URL) === false
        ) {
            return false;
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        return $scheme === 'https' || ($allowHttp && $scheme === 'http');
    }

    private static function requestIsSecure(): bool
    {
        $https = strtolower(trim((string) ($_SERVER['HTTPS'] ?? '')));
        if ($https !== '' && $https !== 'off' && $https !== '0') {
            return true;
        }

        $forwarded = strtolower(trim((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')));

        return $forwarded === 'https';
    }

    private static function md5Sign(array $params, string $key): string
    {
        unset($params['sign'], $params['sign_type']);
        ksort($params, SORT_STRING);
        $parts = [];
        foreach ($params as $name => $value) {
            if ((string) $value !== '') {
                $parts[] = $name . '=' . $value;
            }
        }

        return md5(implode('&', $parts) . $key);
    }

    /**
     * 虎皮椒 V3 hash: sorted non-empty parameters joined with & plus the app
     * secret, MD5 lowercase. The callback and response use the same rule.
     */
    private static function xhHash(array $params, string $key): string
    {
        unset($params['hash']);
        ksort($params, SORT_STRING);
        $parts = [];
        foreach ($params as $name => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            $value = stripslashes((string) $value);
            if ($value === '') {
                continue;
            }
            $parts[] = $name . '=' . $value;
        }

        return md5(implode('&', $parts) . $key);
    }

    /**
     * 迅虎 PAY: sorted parameters joined as k=v& then key=KEY, MD5 uppercase.
     */
    private static function xhpaySign(array $params, string $key): string
    {
        unset($params['sign']);
        ksort($params, SORT_STRING);
        $buffer = '';
        foreach ($params as $name => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            $buffer .= $name . '=' . $value . '&';
        }

        return strtoupper(md5($buffer . 'key=' . $key));
    }

    /**
     * PAYJS: urldecoded query string + &key=KEY, MD5 uppercase.
     */
    private static function payjsSign(array $params, string $key): string
    {
        unset($params['sign']);
        $filtered = [];
        foreach ($params as $name => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            if ((string) $value === '' || (string) $value === '0') {
                continue;
            }
            $filtered[$name] = $value;
        }
        ksort($filtered, SORT_STRING);

        return strtoupper(md5(urldecode(http_build_query($filtered)) . '&key=' . $key));
    }

    /**
     * 码支付: sorted non-empty k=v joined with & plus the merchant key.
     */
    private static function codepaySign(array $params, string $key): string
    {
        unset($params['sign']);
        ksort($params, SORT_STRING);
        $parts = [];
        foreach ($params as $name => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            $value = (string) $value;
            if ($value === '') {
                continue;
            }
            $parts[] = $name . '=' . $value;
        }

        return md5(implode('&', $parts) . $key);
    }

    private static function codepaySignatureMatches(
        array $input,
        string $signature,
        string $key,
        string $rawBody = '',
        string $version = 'auto'
    ): bool {
        $signature = strtolower($signature);
        $versions = $version === 'v1' || $version === 'v2' ? [$version] : ['v1', 'v2'];
        foreach ($versions as $candidateVersion) {
            $canonical = self::codepayCanonical($input, $candidateVersion === 'v2');
            if ($canonical === '') {
                continue;
            }
            $candidates = [
                md5($canonical . $key),
                md5($key . $canonical),
                hash_hmac('sha256', $canonical, $key),
                hash('sha256', $canonical . $key),
                hash('sha256', $key . $canonical),
            ];
            if ($candidateVersion === 'v2' && $rawBody !== '') {
                $candidates[] = hash_hmac('sha256', $rawBody, $key);
                $candidates[] = hash('sha256', $rawBody . $key);
            }
            foreach ($candidates as $candidate) {
                if (hash_equals($candidate, $signature)) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function codepayCanonical(array $params, bool $v2 = false): string
    {
        unset($params['sign']);
        if ($v2) {
            unset($params['sign_type'], $params['signType']);
        }
        ksort($params, SORT_STRING);
        $parts = [];
        foreach ($params as $name => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            $value = (string) $value;
            if ($value === '') {
                continue;
            }
            $parts[] = $name . '=' . $value;
        }

        return implode('&', $parts);
    }

    private static function codepayTypeMatches(string $type, string $method): bool
    {
        $type = strtolower(trim($type));
        $mapped = match ($type) {
            '1' => 'alipay',
            '2' => 'qqpay',
            '3' => 'wxpay',
            default => self::normalizeType($type),
        };

        return $mapped === $method;
    }

    private static function normalizeType(string $type): string
    {
        $type = strtolower(trim($type));

        return self::TYPE_ALIASES[$type] ?? $type;
    }

    private static function md5SignatureMatches(array $input, string $signature, string $key): bool
    {
        foreach (self::signatureVariants($input) as $params) {
            if (hash_equals(self::md5Sign($params, $key), $signature)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Full callback payload first, then payloads with likely unsigned extras
     * removed. Core fields such as pid, out_trade_no and money are never
     * dropped, so this only widens tolerance for provider metadata.
     *
     * @return list<array<string, mixed>>
     */
    private static function signatureVariants(array $input): array
    {
        $variants = [$input];
        $present = array_values(array_filter(
            self::UNSIGNED_HINTS,
            static fn (string $name): bool => array_key_exists($name, $input)
        ));
        if ($present === []) {
            return $variants;
        }

        $withoutAll = $input;
        foreach ($present as $name) {
            unset($withoutAll[$name]);
        }
        $variants[] = $withoutAll;

        foreach ($present as $name) {
            $variant = $input;
            unset($variant[$name]);
            $variants[] = $variant;
        }

        return $variants;
    }
}
