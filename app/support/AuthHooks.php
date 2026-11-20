<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Http\Rest\V2\VerificationCodes;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Applies the theme's mail-verification policy to the TTDF REST v2 hooks.
 *
 * The framework owns code generation, expiry and one-time consumption. This
 * bridge only decides whether a purpose is enabled and performs SMTP delivery.
 */
final class AuthHooks
{
    private const RATE_PREFIX = 'sunken_rl_';

    private const RATE_WINDOW = 1800;

    private static string $requestPath = '';

    public static function register(): void
    {
        Hooks::addAction('rest.v2.request', [self::class, 'rememberRequest']);
        Hooks::addFilter('rest.v2.response', [self::class, 'trackVerification']);
        Hooks::addFilter('rest.v2.register.validate', [self::class, 'validateRegister']);
        Hooks::addFilter('rest.v2.password.reset.can_reset', [self::class, 'canReset']);
        Hooks::addFilter('rest.v2.email_code.can_send', [self::class, 'canSend']);
        Hooks::addFilter('rest.v2.email_code.ttl', [self::class, 'ttl']);
        Hooks::addFilter('rest.v2.email_code.interval', [self::class, 'interval']);
        Hooks::addFilter('rest.v2.account.email.verify', [self::class, 'verifyEmailChange']);
        Hooks::addAction('rest.v2.email_code.send', [self::class, 'sendCode']);
        Hooks::addAction('rest.v2.register.created', [self::class, 'rememberPhone']);
    }

    public static function rememberRequest(string $method, string $path, string $scope): void
    {
        unset($method, $scope);
        self::$requestPath = $path;

        if (!self::isVerificationPath($path)) {
            return;
        }

        $retryAfter = self::retryAfter($path);
        if ($retryAfter > 0) {
            Response::error('Too many verification attempts', 429, [
                'code' => '验证码错误次数过多，请 ' . $retryAfter . ' 秒后再试',
            ]);
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public static function trackVerification(array $payload, int $status, string $scope): array
    {
        unset($scope);

        $path = self::$requestPath;
        if (!self::isVerificationPath($path)) {
            return $payload;
        }

        if ($status >= 200 && $status < 300) {
            self::clearFailures($path);
            return $payload;
        }

        if ($status !== 422) {
            return $payload;
        }

        $errors = is_array($payload['errors'] ?? null) ? $payload['errors'] : [];
        if (
            !array_key_exists('code', $errors)
            && !array_key_exists('emailCode', $errors)
            && !array_key_exists('phoneCode', $errors)
        ) {
            return $payload;
        }

        self::recordFailure($path);

        return $payload;
    }

    /**
     * @param array<string, mixed> $input
     */
    public static function validateRegister(mixed $allowed, array $input): bool
    {
        if ($allowed !== true) {
            return false;
        }

        if (self::enabled('Mail_Verify_Register')) {
            if (!Mailer::configured()) {
                Response::error('Email delivery is unavailable', 503);
            }

            if (
                !VerificationCodes::verify(
                    (string) ($input['mail'] ?? ''),
                    'register',
                    (string) ($input['code'] ?? '')
                )
            ) {
                Response::error('Invalid verification code', 422, ['code' => '验证码无效或已过期']);
            }
        }

        if (self::enabled('Sms_Verify_Register')) {
            if (!UserProfile::enabled()) {
                Response::error('SMS registration requires enhanced user profiles', 503, [
                    'phone' => '短信注册需要先在用户设置中启用更多资料',
                ]);
            }

            if (!Sms::configured()) {
                Response::error('SMS delivery is unavailable', 503);
            }

            $phone = Sms::normalizePhone($input['phone'] ?? '');
            if ($phone === '') {
                Response::error('Invalid phone number', 422, ['phone' => '请输入有效的手机号']);
            }
            if (!Sms::verify($phone, 'register', (string) ($input['phoneCode'] ?? ''))) {
                Response::error('Invalid SMS verification code', 422, [
                    'phoneCode' => '短信验证码无效或已过期',
                ]);
            }
        }

        return true;
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public static function rememberPhone(array $user, array $input): void
    {
        if (!UserProfile::enabled()) {
            return;
        }

        $uid = (int) ($user['uid'] ?? 0);
        $phone = Sms::normalizePhone($input['phone'] ?? '');
        if ($uid <= 0 || $phone === '') {
            return;
        }

        try {
            $db = Db::get();
            $name = 'sunken_phone_' . $uid;
            $exists = $db->fetchRow(
                $db->select('name')
                    ->from('table.options')
                    ->where('name = ?', $name)
                    ->where('user = ?', $uid)
                    ->limit(1)
            );
            if (is_array($exists)) {
                $db->query(
                    $db->update('table.options')
                        ->rows(['value' => $phone])
                        ->where('name = ?', $name)
                        ->where('user = ?', $uid)
                );
                return;
            }

            $db->query($db->insert('table.options')->rows([
                'name' => $name,
                'user' => $uid,
                'value' => $phone,
            ]));
        } catch (\Throwable $exception) {
            error_log('SunkenBoat phone storage failed: ' . $exception->getMessage());
        }
    }

    public static function canReset(mixed $allowed): bool
    {
        return $allowed === true
            && self::enabled('Mail_Verify_Reset')
            && Mailer::configured();
    }

    public static function canSend(mixed $allowed, string $mail, string $purpose): bool
    {
        unset($mail);

        if ($allowed !== true || !Mailer::configured()) {
            return false;
        }

        return match ($purpose) {
            'register' => self::enabled('Mail_Verify_Register'),
            'reset' => self::enabled('Mail_Verify_Reset'),
            'email' => self::enabled('Mail_Verify_Email'),
            default => false,
        };
    }

    public static function ttl(mixed $value): int
    {
        $configured = (int) (Settings::values()['Mail_Code_TTL'] ?? 0);
        $ttl = $configured > 0 ? $configured : (int) $value;

        return max(60, min(3600, $ttl));
    }

    public static function interval(mixed $value): int
    {
        $configured = (int) (Settings::values()['Mail_Send_Interval'] ?? 0);
        $interval = $configured > 0 ? $configured : (int) $value;

        return max(10, min(600, $interval));
    }

    public static function sendCode(
        string $mail,
        string $purpose,
        string $code,
        int $expiresAt
    ): void {
        Mailer::sendVerificationCode($mail, $purpose, $code, $expiresAt);
    }

    public static function verifyEmailChange(
        mixed $allowed,
        string $oldMail,
        string $newMail,
        string $code
    ): bool {
        unset($oldMail);

        if ($allowed !== true) {
            return false;
        }

        if (!self::enabled('Mail_Verify_Email')) {
            return true;
        }

        if (!Mailer::configured()) {
            Response::error('Email delivery is unavailable', 503);
        }

        if (!VerificationCodes::verify($newMail, 'email', $code)) {
            Response::error('Invalid verification code', 422, ['emailCode' => '验证码无效或已过期']);
        }

        return true;
    }

    private static function enabled(string $field): bool
    {
        return (Settings::values()[$field] ?? false) === true;
    }

    private static function isVerificationPath(string $path): bool
    {
        return in_array($path, ['auth/register', 'auth/reset-password', 'me'], true);
    }

    private static function retryAfter(string $path): int
    {
        $record = self::readRate($path);
        $blockedUntil = (int) ($record['blockedUntil'] ?? 0);

        return $blockedUntil > time() ? $blockedUntil - time() : 0;
    }

    private static function recordFailure(string $path): void
    {
        $now = time();
        $record = self::readRate($path);
        $lastAt = (int) ($record['lastAt'] ?? 0);
        $failures = $now > $lastAt + self::RATE_WINDOW ? 0 : (int) ($record['failures'] ?? 0);
        $failures++;

        $blockedUntil = 0;
        if ($failures >= 10) {
            $blockedUntil = $now + 180;
        } elseif ($failures >= 5) {
            $blockedUntil = $now + 30;
        }

        self::writeRate($path, [
            'failures' => $failures,
            'lastAt' => $now,
            'blockedUntil' => $blockedUntil,
        ], $record !== null);
    }

    private static function clearFailures(string $path): void
    {
        $record = self::readRate($path);
        if ($record !== null) {
            self::writeRate($path, ['failures' => 0, 'lastAt' => 0, 'blockedUntil' => 0], true);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readRate(string $path): ?array
    {
        try {
            $db = Db::get();
            $name = self::rateKey($path);
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
    private static function writeRate(string $path, array $record, bool $exists): void
    {
        try {
            $db = Db::get();
            $name = self::rateKey($path);
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
            // A rate-limit cache must never block the actual verification path.
        }
    }

    private static function rateKey(string $path): string
    {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $seed = hash('sha256', $path . '|' . $ip);

        return self::RATE_PREFIX . substr($seed, 0, 20);
    }
}
