<?php

declare(strict_types=1);

/**
 * TTDF Next theme entry point.
 *
 * Typecho loads this file in the global scope. This file only bootstraps the
 * framework; app/config owns theme configuration and app/router owns routes.
 */
if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

if (PHP_VERSION_ID < 80200) {
    throw new RuntimeException('TTDF Next requires PHP 8.2 or newer.');
}

(static function (): void {
    $autoloader = __DIR__ . '/vendor/yuinijika/ttdf/core/Autoloader.php';
    if (!is_file($autoloader)) {
        throw new RuntimeException('TTDF core is missing. Restore vendor/yuinijika/ttdf/ from the release package.');
    }

    require_once $autoloader;
})();

\TTDF\Autoloader::register(__DIR__, 'SunkenBoat');

\TTDF\Hooks\Hooks::addAction('framework.boot', [\SunkenBoat\Support\Avatar::class, 'register']);
\TTDF\Hooks\Hooks::addAction('framework.boot', [\SunkenBoat\Support\API::class, 'register']);
\TTDF\Hooks\Hooks::addAction('framework.boot', [\SunkenBoat\Support\AuthHooks::class, 'register']);
\TTDF\Hooks\Hooks::addAction('framework.boot', [\SunkenBoat\Support\CommentMarkup::class, 'register']);
\TTDF\Hooks\Hooks::addAction('framework.boot', [\SunkenBoat\Support\UserProfile::class, 'register']);
\TTDF\Hooks\Hooks::addAction('framework.boot', [\SunkenBoat\Support\OAuth::class, 'register']);

\TTDF\Framework::boot(__DIR__);
