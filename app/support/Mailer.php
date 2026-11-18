<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use PHPMailer\PHPMailer\PHPMailer;
use RuntimeException;
use TTDF\Compat\Typecho;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * SMTP delivery for verification and password-reset mail.
 *
 * PHPMailer is vendored with the theme so a production install does not need
 * Composer. Credentials stay in the theme settings row and are only read
 * inside the send path.
 */
final class Mailer
{
    private static bool $loaded = false;

    public static function configured(): bool
    {
        $values = Settings::values();
        if (($values['Mail_Enabled'] ?? false) !== true) {
            return false;
        }

        $host = trim((string) ($values['Mail_Host'] ?? ''));
        $from = trim((string) ($values['Mail_From'] ?? ''));
        $port = (int) ($values['Mail_Port'] ?? 0);

        return $host !== ''
            && $port > 0
            && $port <= 65535
            && filter_var($from, FILTER_VALIDATE_EMAIL) !== false
            && is_file(self::sourceDir() . '/PHPMailer.php');
    }

    public static function sendVerificationCode(
        string $mail,
        string $purpose,
        string $code,
        int $expiresAt
    ): void {
        $labels = [
            'register' => '注册验证码',
            'reset' => '重置密码验证码',
            'email' => '邮箱变更验证码',
        ];
        $label = $labels[$purpose] ?? '验证码';
        $minutes = max(1, (int) ceil(max(0, $expiresAt - time()) / 60));
        $siteTitle = trim((string) (Typecho::options()?->title ?? ''));
        $siteTitle = $siteTitle !== '' ? $siteTitle : '站点';

        $subject = $siteTitle . ' - ' . $label;
        $safeTitle = htmlspecialchars($siteTitle, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeLabel = htmlspecialchars($label, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $html = '<div style="max-width:520px;margin:0 auto;padding:28px;border:1px solid #e5e7eb;'
            . 'border-radius:12px;background:#ffffff;color:#333333;font-family:system-ui,-apple-system,'
            . 'Segoe UI,Microsoft YaHei,sans-serif;line-height:1.7">'
            . '<p style="margin:0 0 8px;color:#6b7280;font-size:13px">' . $safeTitle . '</p>'
            . '<h1 style="margin:0 0 18px;font-size:22px;line-height:1.35">' . $safeLabel . '</h1>'
            . '<p style="margin:0 0 14px">你的验证码是：</p>'
            . '<p style="margin:0 0 18px;padding:14px 18px;border-radius:8px;background:#f3f4f6;'
            . 'font-size:30px;font-weight:600;letter-spacing:0.28em;text-align:center">' . $safeCode . '</p>'
            . '<p style="margin:0 0 10px;color:#4b5563">验证码 ' . $minutes . ' 分钟内有效，请勿转发给他人。</p>'
            . '<p style="margin:0;color:#9ca3af;font-size:12px">如果不是你本人操作，请忽略这封邮件。</p>'
            . '</div>';

        $text = $siteTitle . PHP_EOL
            . $label . ': ' . $code . PHP_EOL
            . '验证码 ' . $minutes . ' 分钟内有效，请勿转发给他人。';

        self::send($mail, $subject, $html, $text);
    }

    public static function send(string $to, string $subject, string $html, string $text = ''): void
    {
        if (!self::configured()) {
            throw new RuntimeException('Mail delivery is not configured');
        }

        self::load();
        $values = Settings::values();
        $mail = new PHPMailer(true);

        try {
            $mail->isSMTP();
            $mail->Host = trim((string) ($values['Mail_Host'] ?? ''));
            $mail->Port = (int) ($values['Mail_Port'] ?? 465);
            $mail->Timeout = 15;
            $mail->SMTPKeepAlive = false;

            $username = trim((string) ($values['Mail_Username'] ?? ''));
            if ($username !== '') {
                $mail->SMTPAuth = true;
                $mail->Username = $username;
                $mail->Password = (string) ($values['Mail_Password'] ?? '');
            }

            $mail->SMTPSecure = match ((string) ($values['Mail_Encryption'] ?? 'ssl')) {
                'tls' => PHPMailer::ENCRYPTION_STARTTLS,
                'none' => '',
                default => PHPMailer::ENCRYPTION_SMTPS,
            };

            $mail->CharSet = 'UTF-8';
            $mail->Encoding = 'base64';
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $html;
            $mail->AltBody = $text !== '' ? $text : strip_tags($html);

            $fromName = trim((string) ($values['Mail_From_Name'] ?? ''));
            if ($fromName === '') {
                $fromName = trim((string) (Typecho::options()?->title ?? ''));
            }

            $mail->setFrom(
                trim((string) ($values['Mail_From'] ?? '')),
                $fromName !== '' ? $fromName : 'Site'
            );
            $mail->addAddress(trim($to));
            $mail->send();
        } catch (\Throwable $exception) {
            throw new RuntimeException('Unable to deliver mail: ' . $exception->getMessage(), 0, $exception);
        }
    }

    private static function load(): void
    {
        if (self::$loaded) {
            return;
        }

        $dir = self::sourceDir();
        foreach (['Exception.php', 'PHPMailer.php', 'SMTP.php'] as $file) {
            $path = $dir . '/' . $file;
            if (!is_file($path)) {
                throw new RuntimeException('PHPMailer is missing: ' . $file);
            }

            require_once $path;
        }

        self::$loaded = true;
    }

    private static function sourceDir(): string
    {
        return dirname(__DIR__, 2) . '/vendor/phpmailer/phpmailer/src';
    }
}
