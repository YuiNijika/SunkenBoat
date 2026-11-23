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
        if (class_exists('Typecho\\Cookie') && !headers_sent()) {
            $cookie = \Typecho\Cookie::getPrefix() . $name;
            $stored = setcookie($cookie, $value, [
                'expires' => time() + max(1, $ttl),
                'path' => \Typecho\Cookie::getPath(),
                'domain' => \Typecho\Cookie::getDomain(),
                'secure' => \Typecho\Cookie::getSecure(),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            if ($stored) {
                $_COOKIE[$cookie] = $value;
                return;
            }
        }

        Typecho::setCookie($name, $value, max(1, $ttl));
    }

    public function delete(string $name): void
    {
        if (class_exists('Typecho\\Cookie') && !headers_sent()) {
            $cookie = \Typecho\Cookie::getPrefix() . $name;
            setcookie($cookie, '', [
                'expires' => time() - 3600,
                'path' => \Typecho\Cookie::getPath(),
                'domain' => \Typecho\Cookie::getDomain(),
                'secure' => \Typecho\Cookie::getSecure(),
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
            unset($_COOKIE[$cookie]);
            return;
        }

        Typecho::deleteCookie($name);
    }
}
