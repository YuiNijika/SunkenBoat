<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Compat\Typecho;
use TTDF\Http\Response;
use TTDF\Http\Rest\V2\Auth;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Optional SMS verification for account registration.
 *
 * Delivery supports Aliyun SMS, Tencent Cloud SMS and a generic HTTPS webhook
 * that receives `phone`, `code`, `purpose`, `expiresAt` and `site`. Codes are
 * hashed in Typecho options, so the plain code never persists.
 */
final class Sms
{
    private const CODE_PREFIX = 'smsc_';

    private const IP_PREFIX = 'smsi_';

    private const IP_WINDOW = 600;

    private const IP_LIMIT = 10;

    public static function register(): void
    {
        Endpoint::register('sms-code', [self::class, 'sendEndpoint'], [
            'auth' => 'public',
            'method' => 'POST',
        ]);
    }

    public static function configured(): bool
    {
        $values = Settings::values();

        return ($values['Sms_Enabled'] ?? false) === true
            && function_exists('curl_init')
            && match (self::provider($values)) {
                'aliyun' => self::aliyunConfigured($values),
                'tencent' => self::tencentConfigured($values),
                default => self::endpoint($values) !== '',
            };
    }

    public static function registerEnabled(): bool
    {
        return UserProfile::enabled()
            && (Settings::values()['Sms_Verify_Register'] ?? false) === true
            && self::configured();
    }

    /**
     * Public endpoint used by the registration dialog.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function sendEndpoint(array $data): array
    {
        if (!self::configured() || !self::registerEnabled()) {
            Response::error('短信验证码暂不可用', 503);
        }
        if (!Auth::originMatches()) {
            Response::error('Invalid request origin', 403);
        }

        $phone = self::normalizePhone($data['phone'] ?? '');
        if ($phone === '') {
            Response::error('手机号格式无效', 422, ['phone' => '请输入有效的手机号']);
        }

        $retry = self::ipRetryAfter();
        if ($retry > 0) {
            Response::error('发送过于频繁', 429, [
                'phone' => '请 ' . $retry . ' 秒后再试',
                'retryAfter' => $retry,
            ]);
        }

        $values = Settings::values();
        $ttl = max(60, min(1800, (int) ($values['Sms_Code_TTL'] ?? 600)));
        $interval = max(10, min(600, (int) ($values['Sms_Send_Interval'] ?? 60)));
        $record = self::readCode($phone, 'register');
        $sentAt = (int) ($record['sentAt'] ?? 0);
        if ($sentAt > 0 && $sentAt + $interval > time()) {
            $wait = $sentAt + $interval - time();
            Response::error('发送过于频繁', 429, [
                'phone' => '请 ' . $wait . ' 秒后再试',
                'retryAfter' => $wait,
            ]);
        }

        $code = (string) random_int(100000, 999999);
        $expiresAt = time() + $ttl;
        self::writeCode($phone, 'register', $code, $expiresAt);
        self::trackIp();

        try {
            self::send($phone, 'register', $code, $expiresAt);
        } catch (\Throwable $exception) {
            self::clearCode($phone, 'register');
            error_log('SunkenBoat SMS delivery failed: ' . $exception->getMessage());
            Response::error('短信发送失败，请检查发信服务', 502);
        }

        return [
            'expiresIn' => $ttl,
            'cooldown' => $interval,
        ];
    }

    public static function verify(string $phone, string $purpose, string $code): bool
    {
        $phone = self::normalizePhone($phone);
        $code = trim($code);
        if ($phone === '' || preg_match('/^[0-9]{6}$/', $code) !== 1) {
            return false;
        }

        $record = self::readCode($phone, $purpose);
        if ($record === null) {
            return false;
        }

        $expiresAt = (int) ($record['expiresAt'] ?? 0);
        $hash = (string) ($record['hash'] ?? '');
        if ($expiresAt < time() || $hash === '') {
            self::clearCode($phone, $purpose);
            return false;
        }

        $expected = self::codeHash($phone, $purpose, $code);
        if (!hash_equals($hash, $expected)) {
            return false;
        }

        self::clearCode($phone, $purpose);

        return true;
    }

    public static function normalizePhone(mixed $value): string
    {
        if (!is_scalar($value)) {
            return '';
        }

        $phone = preg_replace('/[\s\-().]/', '', trim((string) $value)) ?? '';

        return preg_match('/^\+?[0-9]{6,20}$/', $phone) === 1 ? $phone : '';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function endpoint(array $values): string
    {
        $endpoint = trim((string) ($values['Sms_Endpoint'] ?? ''));
        if ($endpoint === '' || filter_var($endpoint, FILTER_VALIDATE_URL) === false) {
            return '';
        }

        $scheme = strtolower((string) parse_url($endpoint, PHP_URL_SCHEME));
        $host = (string) parse_url($endpoint, PHP_URL_HOST);

        return $scheme === 'https' && $host !== '' ? $endpoint : '';
    }

    private static function send(string $phone, string $purpose, string $code, int $expiresAt): void
    {
        $values = Settings::values();

        if (self::provider($values) === 'aliyun') {
            self::sendAliyun($values, $phone, $code);
            return;
        }

        if (self::provider($values) === 'tencent') {
            self::sendTencent($values, $phone, $code);
            return;
        }

        self::sendGeneric($values, $phone, $purpose, $code, $expiresAt);
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function sendGeneric(
        array $values,
        string $phone,
        string $purpose,
        string $code,
        int $expiresAt
    ): void {
        $endpoint = self::endpoint($values);
        if ($endpoint === '') {
            throw new \RuntimeException('SMS endpoint is not configured');
        }

        $payload = json_encode([
            'phone' => $phone,
            'code' => $code,
            'purpose' => $purpose,
            'expiresAt' => $expiresAt,
            'site' => Typecho::siteUrl(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($payload)) {
            throw new \RuntimeException('Unable to encode SMS payload');
        }

        $headers = [
            'Content-Type: application/json',
            'Accept: application/json',
            'User-Agent: TTDF-SMS/1.0',
        ];
        $token = trim((string) ($values['Sms_Token'] ?? ''));
        if ($token !== '') {
            $headers[] = 'Authorization: Bearer ' . $token;
        }

        self::request('POST', $endpoint, $payload, $headers);
    }

    /**
     * Aliyun Dysmsapi RPC signature (HMAC-SHA1).
     *
     * @param array<string, mixed> $values
     */
    private static function sendAliyun(array $values, string $phone, string $code): void
    {
        $accessKeyId = self::value($values, 'Sms_Aliyun_AccessKey_ID');
        $accessKeySecret = self::value($values, 'Sms_Aliyun_AccessKey_Secret');
        $signName = self::value($values, 'Sms_Aliyun_Sign_Name');
        $templateCode = self::value($values, 'Sms_Aliyun_Template_Code');
        $region = self::value($values, 'Sms_Aliyun_Region');
        if ($accessKeyId === '' || $accessKeySecret === '' || $signName === '' || $templateCode === '') {
            throw new \RuntimeException('Aliyun SMS credentials are incomplete');
        }

        $templateParam = json_encode(['code' => $code], JSON_UNESCAPED_SLASHES);
        if (!is_string($templateParam)) {
            throw new \RuntimeException('Unable to encode Aliyun SMS template data');
        }

        $params = [
            'AccessKeyId' => $accessKeyId,
            'Action' => 'SendSms',
            'Format' => 'JSON',
            'PhoneNumbers' => ltrim($phone, '+'),
            'RegionId' => $region !== '' ? $region : 'cn-hangzhou',
            'SignName' => $signName,
            'SignatureMethod' => 'HMAC-SHA1',
            'SignatureNonce' => bin2hex(random_bytes(16)),
            'SignatureVersion' => '1.0',
            'TemplateCode' => $templateCode,
            'TemplateParam' => $templateParam,
            'Timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'Version' => '2017-05-25',
        ];

        ksort($params);
        $canonical = [];
        foreach ($params as $key => $value) {
            $canonical[] = self::percentEncode((string) $key) . '=' . self::percentEncode((string) $value);
        }

        $stringToSign = 'GET&%2F&' . self::percentEncode(implode('&', $canonical));
        $signature = base64_encode(
            hash_hmac('sha1', $stringToSign, $accessKeySecret . '&', true)
        );
        $params['Signature'] = $signature;

        $query = [];
        foreach ($params as $key => $value) {
            $query[] = self::percentEncode((string) $key) . '=' . self::percentEncode((string) $value);
        }

        $body = self::request(
            'GET',
            'https://dysmsapi.aliyuncs.com/?' . implode('&', $query),
            null,
            ['Accept: application/json']
        );
        $payload = self::jsonPayload($body);
        if ((string) ($payload['Code'] ?? '') !== 'OK') {
            $message = trim((string) ($payload['Message'] ?? ''));
            throw new \RuntimeException($message !== '' ? $message : 'Aliyun SMS rejected the request');
        }
    }

    /**
     * Tencent Cloud SMS API v2021-01-11 with TC3-HMAC-SHA256 signing.
     *
     * @param array<string, mixed> $values
     */
    private static function sendTencent(array $values, string $phone, string $code): void
    {
        $secretId = self::value($values, 'Sms_Tencent_Secret_ID');
        $secretKey = self::value($values, 'Sms_Tencent_Secret_Key');
        $sdkAppId = self::value($values, 'Sms_Tencent_Sdk_App_ID');
        $signName = self::value($values, 'Sms_Tencent_Sign_Name');
        $templateId = self::value($values, 'Sms_Tencent_Template_ID');
        $region = self::value($values, 'Sms_Tencent_Region');
        if ($secretId === '' || $secretKey === '' || $sdkAppId === '' || $signName === '' || $templateId === '') {
            throw new \RuntimeException('Tencent Cloud SMS credentials are incomplete');
        }

        $host = 'sms.tencentcloudapi.com';
        $timestamp = time();
        $date = gmdate('Y-m-d', $timestamp);
        $payload = json_encode([
            'PhoneNumberSet' => [self::e164Phone($phone)],
            'SmsSdkAppId' => $sdkAppId,
            'SignName' => $signName,
            'TemplateId' => $templateId,
            'TemplateParamSet' => [$code],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (!is_string($payload)) {
            throw new \RuntimeException('Unable to encode Tencent Cloud SMS payload');
        }

        $contentType = 'application/json; charset=utf-8';
        $canonicalHeaders = "content-type:{$contentType}\nhost:{$host}\n";
        $signedHeaders = 'content-type;host';
        $canonicalRequest = "POST\n/\n\n"
            . $canonicalHeaders
            . "\n"
            . $signedHeaders
            . "\n"
            . hash('sha256', $payload);
        $credentialScope = $date . '/sms/tc3_request';
        $stringToSign = "TC3-HMAC-SHA256\n{$timestamp}\n{$credentialScope}\n"
            . hash('sha256', $canonicalRequest);
        $secretDate = hash_hmac('sha256', $date, 'TC3' . $secretKey, true);
        $secretService = hash_hmac('sha256', 'sms', $secretDate, true);
        $secretSigning = hash_hmac('sha256', 'tc3_request', $secretService, true);
        $signature = hash_hmac('sha256', $stringToSign, $secretSigning);
        $authorization = 'TC3-HMAC-SHA256 Credential=' . $secretId . '/' . $credentialScope
            . ', SignedHeaders=' . $signedHeaders
            . ', Signature=' . $signature;

        $headers = [
            'Authorization: ' . $authorization,
            'Content-Type: ' . $contentType,
            'Host: ' . $host,
            'X-TC-Action: SendSms',
            'X-TC-Version: 2021-01-11',
            'X-TC-Timestamp: ' . $timestamp,
        ];
        if ($region !== '') {
            $headers[] = 'X-TC-Region: ' . $region;
        }

        $body = self::request(
            'POST',
            'https://' . $host . '/',
            $payload,
            $headers
        );
        $payload = self::jsonPayload($body);
        $response = is_array($payload['Response'] ?? null) ? $payload['Response'] : [];
        if (isset($response['Error'])) {
            $message = is_array($response['Error'])
                ? (string) ($response['Error']['Message'] ?? '')
                : '';
            throw new \RuntimeException($message !== '' ? $message : 'Tencent Cloud SMS rejected the request');
        }

        $statuses = (array) ($response['SendStatusSet'] ?? []);
        if ($statuses === []) {
            throw new \RuntimeException('Tencent Cloud SMS returned no delivery status');
        }

        foreach ($statuses as $status) {
            if (is_array($status) && (string) ($status['Code'] ?? '') !== 'Ok') {
                $message = trim((string) ($status['Message'] ?? ''));
                throw new \RuntimeException($message !== '' ? $message : 'Tencent Cloud SMS rejected the request');
            }
        }
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function provider(array $values): string
    {
        $provider = strtolower(trim((string) ($values['Sms_Provider'] ?? 'generic')));

        return in_array($provider, ['generic', 'aliyun', 'tencent'], true)
            ? $provider
            : 'generic';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function aliyunConfigured(array $values): bool
    {
        return self::value($values, 'Sms_Aliyun_AccessKey_ID') !== ''
            && self::value($values, 'Sms_Aliyun_AccessKey_Secret') !== ''
            && self::value($values, 'Sms_Aliyun_Sign_Name') !== ''
            && self::value($values, 'Sms_Aliyun_Template_Code') !== '';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function tencentConfigured(array $values): bool
    {
        return self::value($values, 'Sms_Tencent_Secret_ID') !== ''
            && self::value($values, 'Sms_Tencent_Secret_Key') !== ''
            && self::value($values, 'Sms_Tencent_Sdk_App_ID') !== ''
            && self::value($values, 'Sms_Tencent_Sign_Name') !== ''
            && self::value($values, 'Sms_Tencent_Template_ID') !== '';
    }

    /**
     * @param array<string, mixed> $values
     */
    private static function value(array $values, string $key): string
    {
        $value = $values[$key] ?? '';

        return is_scalar($value) ? trim((string) $value) : '';
    }

    /**
     * Send an HTTP request with a fixed timeout and no redirects.
     *
     * @param list<string> $headers
     */
    private static function request(string $method, string $url, ?string $body, array $headers): string
    {
        $curl = curl_init($url);
        if ($curl === false) {
            throw new \RuntimeException('Unable to initialize SMS request');
        }

        $options = [
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];
        if (strtoupper($method) === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = $body ?? '';
        } elseif (strtoupper($method) !== 'GET') {
            $options[CURLOPT_CUSTOMREQUEST] = strtoupper($method);
            if ($body !== null) {
                $options[CURLOPT_POSTFIELDS] = $body;
            }
        }

        curl_setopt_array($curl, $options);
        $result = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($result === false || $status < 200 || $status >= 300) {
            throw new \RuntimeException($error !== '' ? $error : 'SMS provider returned HTTP ' . $status);
        }

        return (string) $result;
    }

    /**
     * @return array<string, mixed>
     */
    private static function jsonPayload(string $body): array
    {
        $payload = json_decode($body, true);
        if (!is_array($payload)) {
            throw new \RuntimeException('SMS provider returned an invalid response');
        }

        return $payload;
    }

    private static function percentEncode(string $value): string
    {
        return str_replace(['+', '*', '%7E'], ['%20', '%2A', '~'], rawurlencode($value));
    }

    private static function e164Phone(string $phone): string
    {
        if (str_starts_with($phone, '+')) {
            return $phone;
        }

        $digits = preg_replace('/\D+/', '', $phone) ?? '';
        if (strlen($digits) === 11) {
            return '+86' . $digits;
        }

        return $digits !== '' ? '+' . $digits : '';
    }

    private static function writeCode(string $phone, string $purpose, string $code, int $expiresAt): void
    {
        $record = [
            'hash' => self::codeHash($phone, $purpose, $code),
            'expiresAt' => $expiresAt,
            'sentAt' => time(),
        ];
        $name = self::codeKey($phone, $purpose);
        $exists = self::readOption($name) !== null;
        self::writeOption($name, $record, $exists);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readCode(string $phone, string $purpose): ?array
    {
        return self::readOption(self::codeKey($phone, $purpose));
    }

    private static function clearCode(string $phone, string $purpose): void
    {
        try {
            $db = Db::get();
            $db->query(
                $db->delete('table.options')
                    ->where('name = ?', self::codeKey($phone, $purpose))
                    ->where('user = ?', 0)
            );
        } catch (\Throwable) {
            // Expired codes are harmless; failing to delete must not break verification.
        }
    }

    private static function codeHash(string $phone, string $purpose, string $code): string
    {
        return hash_hmac('sha256', $phone . '|' . $purpose . '|' . $code, self::secret());
    }

    private static function codeKey(string $phone, string $purpose): string
    {
        return self::CODE_PREFIX . substr(hash('sha256', $phone . '|' . $purpose), 0, 20);
    }

    private static function ipRetryAfter(): int
    {
        $name = self::IP_PREFIX . substr(hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 20);
        $record = self::readOption($name);
        $now = time();
        $started = (int) ($record['started'] ?? 0);
        $count = (int) ($record['count'] ?? 0);
        if ($started <= 0 || $started + self::IP_WINDOW <= $now) {
            return 0;
        }

        return $count >= self::IP_LIMIT ? max(1, $started + self::IP_WINDOW - $now) : 0;
    }

    private static function trackIp(): void
    {
        $name = self::IP_PREFIX . substr(hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '')), 0, 20);
        $record = self::readOption($name);
        $now = time();
        $started = (int) ($record['started'] ?? 0);
        $count = (int) ($record['count'] ?? 0);
        if ($started <= 0 || $started + self::IP_WINDOW <= $now) {
            $started = $now;
            $count = 0;
        }

        self::writeOption($name, [
            'started' => $started,
            'count' => $count + 1,
        ], $record !== null);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readOption(string $name): ?array
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('value')
                    ->from('table.options')
                    ->where('name = ?', $name)
                    ->where('user = ?', 0)
                    ->limit(1)
            );
            if (!is_array($row)) {
                return null;
            }

            $decoded = json_decode((string) ($row['value'] ?? ''), true);

            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param array<string, mixed> $record
     */
    private static function writeOption(string $name, array $record, bool $exists): void
    {
        try {
            $db = Db::get();
            $value = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (!is_string($value)) {
                return;
            }

            if ($exists) {
                $db->query(
                    $db->update('table.options')
                        ->rows(['value' => $value])
                        ->where('name = ?', $name)
                        ->where('user = ?', 0)
                );
                return;
            }

            $db->query($db->insert('table.options')->rows([
                'name' => $name,
                'user' => 0,
                'value' => $value,
            ]));
        } catch (\Throwable) {
            throw new \RuntimeException('Unable to store SMS verification state');
        }
    }

    private static function secret(): string
    {
        $options = Typecho::options();
        $secret = is_scalar($options?->secret ?? null) ? (string) $options->secret : '';

        return hash('sha256', $secret . '|' . Typecho::siteUrl() . '|ttdf-sms');
    }
}
