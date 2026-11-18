<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Http\Rest\V2\VerificationCodes;
use TTDF\Theme\Settings;

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
    public static function register(): void
    {
        Hooks::addFilter('rest.v2.register.validate', [self::class, 'validateRegister']);
        Hooks::addFilter('rest.v2.password.reset.can_reset', [self::class, 'canReset']);
        Hooks::addFilter('rest.v2.email_code.can_send', [self::class, 'canSend']);
        Hooks::addFilter('rest.v2.email_code.ttl', [self::class, 'ttl']);
        Hooks::addFilter('rest.v2.email_code.interval', [self::class, 'interval']);
        Hooks::addFilter('rest.v2.account.email.verify', [self::class, 'verifyEmailChange']);
        Hooks::addAction('rest.v2.email_code.send', [self::class, 'sendCode']);
    }

    /**
     * @param array<string, mixed> $input
     */
    public static function validateRegister(mixed $allowed, array $input): bool
    {
        if ($allowed !== true || !self::enabled('Mail_Verify_Register')) {
            return $allowed === true;
        }

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

        return true;
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
}
