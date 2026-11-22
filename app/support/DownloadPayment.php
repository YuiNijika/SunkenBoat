<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
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
    ];

    /** @var array<string, string> */
    private const PLATFORMS = [
        'official' => '官方直连',
        'epay' => '易支付',
        'mapay' => '码支付',
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
     * Flatten every configured channel into one entry per payment method.
     *
     * @return array<string, array{method: string, label: string, platform: string, gateway: string, endpoint: string, site_name: string, id: string, secret: string, public_key: string}>
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

        $channel = $method === ''
            ? reset($channels)
            : ($channels[$method] ?? null);
        if (!is_array($channel)) {
            return '';
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
            $url = self::checkout($order, $id);
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
     * Validate a provider callback against every configured gateway. epay
     * compatible platforms carry a merchant id and payment type; Alipay
     * direct callbacks carry an app id and an RSA2 signature.
     *
     * @return array{number: string, trade: string, amount: int}|null
     */
    public static function verify(array $input): ?array
    {
        foreach ($input as $value) {
            if (!is_string($value) && !is_numeric($value)) {
                return null;
            }
        }

        $signature = (string) ($input['sign'] ?? '');
        $number = (string) ($input['out_trade_no'] ?? '');
        $trade = (string) ($input['trade_no'] ?? '');
        $signType = strtoupper(trim((string) ($input['sign_type'] ?? 'MD5')));
        if (
            $signature === ''
            || preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $number) !== 1
            || preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $trade) !== 1
        ) {
            return null;
        }

        if ($signType === 'RSA2') {
            return self::verifyOfficial($input, $signature, $number, $trade);
        }

        if (
            $signType !== 'MD5'
            || strtoupper(trim((string) ($input['trade_status'] ?? ''))) !== 'TRADE_SUCCESS'
            || preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1
        ) {
            return null;
        }

        $amount = Downloads::amountCents($input['money'] ?? null);
        if ($amount === null || $amount <= 0) {
            return null;
        }

        $pid = (string) ($input['pid'] ?? '');
        $type = self::normalizeType((string) ($input['type'] ?? ''));
        $candidates = [];
        $preferred = null;
        foreach (self::gatewayChannels() as $channel) {
            if ($channel['platform'] === 'official' || $pid !== $channel['id']) {
                continue;
            }
            if ($type === '' || $type === $channel['method']) {
                $preferred = $channel;
                break;
            }
            $candidates[] = $channel;
        }
        if ($preferred !== null) {
            array_unshift($candidates, $preferred);
        }

        foreach ($candidates as $channel) {
            if (!self::md5SignatureMatches($input, strtolower($signature), $channel['secret'])) {
                continue;
            }

            return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
        }

        return null;
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
     * @return array{platform: string, methods: list<string>, label: string, gateway: string, endpoint: string, site_name: string, id: string, secret: string, public_key: string}|null
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
        $parts = parse_url($gateway);
        if (
            !is_array($parts)
            || ($parts['scheme'] ?? '') !== 'https'
            || empty($parts['host'])
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
            || isset($parts['query'])
            || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\]/', $gateway) === 1
            || filter_var($gateway, FILTER_VALIDATE_URL) === false
        ) {
            return null;
        }

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

            return [
                'platform' => $platform,
                'methods' => ['alipay'],
                'label' => $label,
                'gateway' => $gateway,
                'endpoint' => '',
                'site_name' => $siteName,
                'id' => $appId,
                'secret' => $secret,
                'public_key' => $publicKey,
            ];
        }

        $endpoint = self::endpoint($config['endpoint'] ?? '');
        $merchantId = trim((string) ($config['merchant_id'] ?? ''));
        $secret = self::merchantSecret($config);
        if (
            $endpoint === null
            || preg_match('/^[0-9]{1,32}$/D', $merchantId) !== 1
            || $secret === null
        ) {
            return null;
        }

        return [
            'platform' => $platform,
            'methods' => $methods,
            'label' => $label,
            'gateway' => $gateway,
            'endpoint' => $endpoint,
            'site_name' => $siteName,
            'id' => $merchantId,
            'secret' => $secret,
            'public_key' => '',
        ];
    }

    /**
     * @return list<string>
     */
    private static function methods(mixed $value, string $platform): array
    {
        $methods = [];
        foreach (is_array($value) ? $value : [] as $method) {
            if (!is_scalar($method)) {
                continue;
            }
            $method = strtolower(trim((string) $method));
            if (isset(self::METHODS[$method]) && !in_array($method, $methods, true)) {
                $methods[] = $method;
            }
        }

        if ($platform === 'official') {
            return in_array('alipay', $methods, true) || $methods === [] ? ['alipay'] : [];
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
            return $channel['platform'] === 'official' ? '支付宝官方' : $methodLabel;
        }

        return count($channel['methods']) > 1 ? $custom . ' · ' . $methodLabel : $custom;
    }

    /**
     * @param array{method: string, gateway: string, endpoint: string, site_name: string, id: string, secret: string} $channel
     * @param array<string, mixed> $order
     */
    private static function compatibleCheckout(array $channel, array $order): string
    {
        $index = rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/');
        if ($index === '') {
            return '';
        }
        $params = [
            'pid' => $channel['id'],
            'type' => $channel['method'],
            'out_trade_no' => (string) ($order['number'] ?? ''),
            'notify_url' => $index . '/ttdf/sunken/payment/notify',
            'return_url' => $index . '/user/downloads?' . http_build_query(['order' => $order['number'] ?? '']),
            'name' => mb_substr((string) ($order['title'] ?? ''), 0, 64, 'UTF-8'),
            'money' => Downloads::formatAmount((int) ($order['amount_cents'] ?? 0)),
        ];
        if ($channel['site_name'] !== '') {
            $params['sitename'] = $channel['site_name'];
        }
        $params['sign'] = self::md5Sign($params, $channel['secret']);
        $params['sign_type'] = 'MD5';

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

        $index = rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/');
        if ($index === '') {
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
            'notify_url' => $index . '/ttdf/sunken/payment/notify',
            'return_url' => $index . '/user/downloads?' . http_build_query(['order' => $order['number'] ?? '']),
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
     * @param array<string, mixed> $input
     * @return array{number: string, trade: string, amount: int}|null
     */
    private static function verifyOfficial(array $input, string $signature, string $number, string $trade): ?array
    {
        $status = strtoupper(trim((string) ($input['trade_status'] ?? '')));
        if (
            $status !== 'TRADE_SUCCESS'
            && $status !== 'TRADE_FINISHED'
        ) {
            return null;
        }

        $appId = trim((string) ($input['app_id'] ?? ''));
        if ($appId === '') {
            return null;
        }

        $amount = Downloads::amountCents($input['total_amount'] ?? $input['money'] ?? null);
        if ($amount === null || $amount <= 0) {
            return null;
        }

        foreach (self::gatewayChannels() as $channel) {
            if ($channel['platform'] !== 'official' || $channel['id'] !== $appId) {
                continue;
            }
            if (!self::rsaVerify($input, $signature, $channel['public_key'])) {
                continue;
            }

            return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
        }

        return null;
    }

    /**
     * @param array<string, mixed> $config
     */
    private static function merchantSecret(array $config): ?string
    {
        $value = trim((string) ($config['key'] ?? ''));
        if ($value !== '') {
            return strlen($value) >= 16 ? $value : null;
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
