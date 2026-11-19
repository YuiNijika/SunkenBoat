<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Support\Escaper;
use TTDF\Theme\Assets;
use TTDF\Theme\Media;
use TTDF\Theme\Settings;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Server-rendered boot screen.
 *
 * It covers the SEO fallback until React has committed its first render, so a
 * slow or missing bundle never exposes the unstyled fallback markup.
 */
final class Loader
{
    private const STYLES = ['ring', 'dots', 'bars', 'pulse', 'orbit', 'logo'];

    public static function render(): string
    {
        $values = Settings::values();
        if (($values['Loader_Enabled'] ?? true) !== true) {
            return '';
        }

        $style = (string) ($values['Loader_Style'] ?? 'ring');
        if (!in_array($style, self::STYLES, true)) {
            $style = 'ring';
        }

        $timeout = (int) ($values['Loader_Timeout'] ?? 12);
        $timeout = max(3, min(60, $timeout));
        $text = trim((string) ($values['Loader_Text'] ?? '正在加载…'));
        $logo = Media::url((string) ($values['Logo'] ?? ''));
        if ($logo === '' || ctype_digit($logo)) {
            $logo = Assets::url('img/favicon.svg');
        }

        $mark = match ($style) {
            'dots' => '<span class="ttdf-loader-dots" aria-hidden="true"><i></i><i></i><i></i></span>',
            'bars' => '<span class="ttdf-loader-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>',
            'pulse' => '<span class="ttdf-loader-pulse" aria-hidden="true"><i></i><i></i></span>',
            'orbit' => '<span class="ttdf-loader-orbit" aria-hidden="true"><i></i></span>',
            'logo' => '<img class="ttdf-loader-logo" src="' . Escaper::url($logo)
                . '" alt="" width="56" height="56" decoding="async">',
            default => '<span class="ttdf-loader-ring" aria-hidden="true"></span>',
        };

        $caption = $text !== ''
            ? '<p class="ttdf-loader-text">' . Escaper::html($text) . '</p>'
            : '';

        return '<div id="ttdf-loader" class="ttdf-loader ttdf-loader--' . $style
            . '" style="--ttdf-loader-timeout:' . $timeout . 's" role="status" aria-live="polite">'
            . '<div class="ttdf-loader-inner">' . $mark . $caption . '</div>'
            . '</div>' . PHP_EOL;
    }
}
