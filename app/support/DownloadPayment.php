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

    public static function configured(): bool
    {
        if (self::enabled() === false) {
            return false;
        }

        return self::gatewayChannels() !== [] || self::balanceEnabled();
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

    /**
     * @return array<string, array{method: string, label: string, gateway: string, id: string, key: string}>
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
        $params['sign'] = self::sign($params, $channel['key']);
        $params['sign_type'] = 'MD5';

        return $channel['gateway'] . '/submit.php?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
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
            strtoupper((string) ($input['sign_type'] ?? 'MD5')) !== 'MD5'
            || (string) ($input['trade_status'] ?? '') !== 'TRADE_SUCCESS'
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
        $type = strtolower((string) ($input['type'] ?? ''));
        foreach (self::gatewayChannels() as $channel) {
            if ($pid !== $channel['id'] || ($type !== '' && $type !== $channel['method'])) {
                continue;
            }
            if (!hash_equals(self::sign($input, $channel['key']), strtolower($signature))) {
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
     * @return array{method: string, label: string, gateway: string, id: string, key: string}|null
     */
    private static function channel(string $method, string $label, mixed $config): ?array
    {
        if (!is_array($config) || ($config['enabled'] ?? false) !== true) {
            return null;
        }

        $credentials = self::credentials(
            $config['gateway'] ?? '',
            $config['merchant_id'] ?? '',
            $config['key_env'] ?? 'SUNKEN_PAY_KEY'
        );
        if ($credentials === null) {
            return null;
        }

        return [
            'method' => $method,
            'label' => $label,
            'gateway' => $credentials['gateway'],
            'id' => $credentials['id'],
            'key' => $credentials['key'],
        ];
    }

    /**
     * @return array<string, array{method: string, label: string, gateway: string, id: string, key: string}>
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

    /**
     * @return array{gateway: string, id: string, key: string}|null
     */
    private static function credentials(mixed $gatewayValue, mixed $idValue, mixed $variableValue): ?array
    {
        $gateway = rtrim(trim((string) $gatewayValue), '/');
        $parts = parse_url($gateway);
        $id = trim((string) $idValue);
        $variable = trim((string) $variableValue);
        if (
            $variable === ''
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
            || preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,99}$/D', $variable) !== 1
        ) {
            return null;
        }

        $key = getenv($variable);
        if (!is_string($key) || strlen($key) < 16) {
            return null;
        }

        return ['gateway' => $gateway, 'id' => $id, 'key' => $key];
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
}
