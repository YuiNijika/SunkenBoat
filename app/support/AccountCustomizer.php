<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Registers the user-center layout as a first-class customizer target.
 */
final class AccountCustomizer
{
    public static function register(): void
    {
        Hooks::addFilter('customizer.block_fields', [self::class, 'blockFields']);
        Hooks::addFilter('customizer.preview_urls', [self::class, 'previewUrls']);
    }

    /**
     * @return array<string, array{kind: string, slot: string}>
     */
    public static function blockFields(mixed $fields): array
    {
        $map = is_array($fields) ? $fields : [];
        $map['Account_Blocks'] = [
            'kind' => 'account',
            'slot' => 'main',
        ];

        return $map;
    }

    /**
     * @return array<string, string>
     */
    public static function previewUrls(mixed $urls): array
    {
        $map = is_array($urls) ? $urls : [];
        $index = rtrim(Typecho::indexUrl(), '/');
        $map['account'] = $index . '/user/profile';

        return $map;
    }
}
