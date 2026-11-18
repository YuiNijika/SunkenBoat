<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

use TTDF\Compat\Typecho;

/**
 * Typecho cookie-backed state storage. Typecho prefixes the cookie name and
 * handles the browser flags in production.
 */
final class CookieStateStore implements StateStore
{
    public function read(string $name): string
    {
        return Typecho::cookie($name);
    }

    public function write(string $name, string $value, int $ttl): void
    {
        Typecho::setCookie($name, $value, max(1, $ttl));
    }

    public function delete(string $name): void
    {
        Typecho::deleteCookie($name);
    }
}
