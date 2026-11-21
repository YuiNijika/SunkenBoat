<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

final class DownloadPayment
{
    public static function configured(): bool
    {
        $values = Settings::values();

        return ($values['Downloads_Payment_Enabled'] ?? false) === true
            && self::credentials() !== null;
    }

    public static function checkout(array $order): string
    {
        $credentials = self::credentials();
        if (!self::configured() || $credentials === null) {
            return '';
        }

        $index = rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/');
        $method = (string) (Settings::values()['Downloads_Payment_Method'] ?? 'alipay');
        $params = [
            'pid' => $credentials['id'],
            'type' => in_array($method, ['alipay', 'wxpay', 'qqpay'], true) ? $method : 'alipay',
            'out_trade_no' => (string) $order['number'],
            'notify_url' => $index . '/ttdf/sunken/payment/notify',
            'return_url' => $index . '/user/downloads?' . http_build_query(['order' => $order['number']]),
            'name' => mb_substr((string) $order['title'], 0, 64, 'UTF-8'),
            'money' => Downloads::formatAmount((int) $order['amount_cents']),
        ];
        $params['sign'] = self::sign($params, $credentials['key']);
        $params['sign_type'] = 'MD5';

        return $credentials['gateway'] . '/submit.php?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    public static function verify(array $input): ?array
    {
        $credentials = self::credentials();
        if ($credentials === null) {
            return null;
        }

        foreach ($input as $value) {
            if (!is_string($value) && !is_numeric($value)) {
                return null;
            }
        }

        $signature = (string) ($input['sign'] ?? '');
        $number = (string) ($input['out_trade_no'] ?? '');
        $trade = (string) ($input['trade_no'] ?? '');
        if (
            (string) ($input['pid'] ?? '') !== $credentials['id']
            || strtoupper((string) ($input['sign_type'] ?? 'MD5')) !== 'MD5'
            || (string) ($input['trade_status'] ?? '') !== 'TRADE_SUCCESS'
            || preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $number) !== 1
            || preg_match('/^[A-Za-z0-9_-]{1,100}$/D', $trade) !== 1
            || preg_match('/^[a-f0-9]{32}$/Di', $signature) !== 1
            || !hash_equals(self::sign($input, $credentials['key']), strtolower($signature))
        ) {
            return null;
        }

        $amount = Downloads::amountCents($input['money'] ?? null);

        return $amount !== null && $amount > 0
            ? ['number' => $number, 'trade' => $trade, 'amount' => $amount]
            : null;
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

    private static function credentials(): ?array
    {
        $values = Settings::values();
        $gateway = rtrim(trim((string) ($values['Downloads_Gateway'] ?? '')), '/');
        $parts = parse_url($gateway);
        $id = trim((string) ($values['Downloads_Merchant_ID'] ?? ''));
        $variable = trim((string) ($values['Downloads_Merchant_Key_Env'] ?? 'SUNKEN_PAY_KEY'));
        if (
            !is_array($parts)
            || ($parts['scheme'] ?? '') !== 'https'
            || empty($parts['host'])
            || isset($parts['user'], $parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || preg_match('/[\x00-\x20\x7f]/', $gateway) === 1
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
}
