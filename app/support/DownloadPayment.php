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
    private const GATEWAYS = [
        'alipay' => '支付宝',
        'wxpay' => '微信支付',
        'qqpay' => 'QQ 钱包',
    ];

    /** @var array<string, string> */
    private const PLATFORMS = [
        'epay' => '易支付 / 彩虹易支付',
        'mapay' => '码支付',
        'custom' => '其他易支付兼容平台',
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

        $channels = self::channelValues();
        if (array_key_exists('balance', $channels)) {
            return ($channels['balance']['enabled'] ?? false) === true;
        }

        return self::legacyValue('Downloads_Allow_Balance') === true;
    }

    public static function pointsEnabled(): bool
    {
        if (self::enabled() === false || !UserEconomy::enabled() || !UserEconomy::available()) {
            return false;
        }

        $config = self::channelValues()['points'] ?? null;

        return is_array($config)
            && ($config['enabled'] ?? false) === true
            && self::pointsRate() > 0;
    }

    public static function pointsRate(): int
    {
        $config = self::channelValues()['points'] ?? null;
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
     * @return array<string, array{method: string, label: string, platform: string, gateway: string, endpoint: string, site_name: string, id: string, key: string}>
     */
    public static function gatewayChannels(): array
    {
        if (self::enabled() === false) {
            return [];
        }

        $configured = self::channelValues();
        if ($configured === []) {
            return self::legacyChannels();
        }

        $channels = [];
        foreach (self::GATEWAYS as $method => $label) {
            $channel = self::channel($method, $label, $configured[$method] ?? null);
            if ($channel !== null) {
                $channels[$method] = $channel;
            }
        }

        return $channels;
    }

    /**
     * Build one signed payment URL for the selected gateway.
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

        $index = rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/');
        $params = [
            'pid' => $channel['id'],
            'type' => $channel['method'],
            'out_trade_no' => (string) $order['number'],
            'notify_url' => $index . '/ttdf/sunken/payment/notify',
            'return_url' => $index . '/user/downloads?' . http_build_query(['order' => $order['number']]),
            'name' => mb_substr((string) $order['title'], 0, 64, 'UTF-8'),
            'money' => Downloads::formatAmount((int) $order['amount_cents']),
        ];
        if ($channel['site_name'] !== '') {
            $params['sitename'] = $channel['site_name'];
        }
        $params['sign'] = self::sign($params, $channel['key']);
        $params['sign_type'] = 'MD5';

        return $channel['gateway'] . '/' . $channel['endpoint'] . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
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
        foreach (self::gatewayChannels() as $method => $channel) {
            $url = self::checkout($order, $method);
            if ($url === '') {
                continue;
            }
            $options[] = [
                'method' => $method,
                'label' => $channel['label'],
                'url' => $url,
            ];
        }

        return $options;
    }

    /**
     * Validate a provider callback against every configured gateway. The
     * callback only carries its merchant id and payment type, so each matching
     * channel gets an independent HMAC check.
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
        if (
            strtoupper(trim((string) ($input['sign_type'] ?? 'MD5'))) !== 'MD5'
            || strtoupper(trim((string) ($input['trade_status'] ?? ''))) !== 'TRADE_SUCCESS'
            || preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $number) !== 1
            || preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $trade) !== 1
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
            if ($pid !== $channel['id']) {
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
            if (!self::signatureMatches($input, strtolower($signature), $channel['key'])) {
                continue;
            }

            return ['number' => $number, 'trade' => $trade, 'amount' => $amount];
        }

        return null;
    }

    private static function enabled(): bool
    {
        return (Settings::values()['Downloads_Payment_Enabled'] ?? false) === true;
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private static function channelValues(): array
    {
        $value = Settings::values()['Downloads_Payment_Channels'] ?? [];

        return is_array($value) ? $value : [];
    }

    /**
     * @param mixed $config
     * @return array{method: string, label: string, platform: string, gateway: string, endpoint: string, site_name: string, id: string, key: string}|null
     */
    private static function channel(string $method, string $label, mixed $config): ?array
    {
        if (!is_array($config) || ($config['enabled'] ?? false) !== true) {
            return null;
        }

        $credentials = self::credentials($config);
        if ($credentials === null) {
            return null;
        }

        return [
            'method' => $method,
            'label' => $label,
            'platform' => $credentials['platform'],
            'gateway' => $credentials['gateway'],
            'endpoint' => $credentials['endpoint'],
            'site_name' => $credentials['site_name'],
            'id' => $credentials['id'],
            'key' => $credentials['key'],
        ];
    }

    /**
     * @param array<string, mixed> $config
     * @return array{platform: string, gateway: string, endpoint: string, site_name: string, id: string, key: string}|null
     */
    private static function credentials(array $config): ?array
    {
        $gateway = rtrim(trim((string) ($config['gateway'] ?? '')), '/');
        $parts = parse_url($gateway);
        $id = trim((string) ($config['merchant_id'] ?? ''));
        $endpoint = self::endpoint($config['endpoint'] ?? '');
        $platform = strtolower(trim((string) ($config['platform'] ?? 'epay')));
        if (!isset(self::PLATFORMS[$platform])) {
            $platform = 'epay';
        }
        $siteName = trim((string) ($config['site_name'] ?? ''));
        if (function_exists('mb_substr')) {
            $siteName = mb_substr($siteName, 0, 64, 'UTF-8');
        } elseif (strlen($siteName) > 64) {
            $siteName = substr($siteName, 0, 64);
        }
        if (
            $endpoint === null
            || !is_array($parts)
            || ($parts['scheme'] ?? '') !== 'https'
            || empty($parts['host'])
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
            || isset($parts['query'])
            || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f\\\\]/', $gateway) === 1
            || filter_var($gateway, FILTER_VALIDATE_URL) === false
            || preg_match('/^[0-9]{1,32}$/D', $id) !== 1
        ) {
            return null;
        }

        $key = self::secret($config);
        if ($key === null) {
            return null;
        }

        return [
            'platform' => $platform,
            'gateway' => $gateway,
            'endpoint' => $endpoint,
            'site_name' => $siteName,
            'id' => $id,
            'key' => $key,
        ];
    }

    /**
     * Read the merchant secret from the environment first, then fall back to
     * the value saved in the admin settings.
     *
     * @param array<string, mixed> $config
     */
    private static function secret(array $config): ?string
    {
        $variable = trim((string) ($config['key_env'] ?? ''));
        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,99}$/D', $variable) === 1) {
            $value = getenv($variable);
            if (is_string($value) && strlen(trim($value)) >= 16) {
                return trim($value);
            }
        }

        $value = trim((string) ($config['key'] ?? ''));

        return strlen($value) >= 16 ? $value : null;
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

    /**
     * @return array<string, array{method: string, label: string, platform: string, gateway: string, endpoint: string, site_name: string, id: string, key: string}>
     */
    private static function legacyChannels(): array
    {
        $raw = Options::instance()->all();
        $method = strtolower(trim((string) ($raw['Downloads_Payment_Method'] ?? 'alipay')));
        if (!isset(self::GATEWAYS[$method])) {
            return [];
        }

        $channel = self::channel($method, self::GATEWAYS[$method], [
            'enabled' => true,
            'gateway' => $raw['Downloads_Gateway'] ?? '',
            'merchant_id' => $raw['Downloads_Merchant_ID'] ?? '',
            'key_env' => $raw['Downloads_Merchant_Key_Env'] ?? 'SUNKEN_PAY_KEY',
        ]);

        return $channel === null ? [] : [$method => $channel];
    }

    private static function legacyValue(string $name): mixed
    {
        return Options::instance()->all()[$name] ?? null;
    }

    private static function sign(array $params, string $key): string
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

    private static function signatureMatches(array $input, string $signature, string $key): bool
    {
        foreach (self::signatureVariants($input) as $params) {
            if (hash_equals(self::sign($params, $key), $signature)) {
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
