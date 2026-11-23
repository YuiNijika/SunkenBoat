<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * Small HTTP client used only by OAuth provider adapters.
 *
 * Redirects are intentionally not followed: token and user-info endpoints
 * must be called exactly as configured.
 */
final class HttpClient
{
    private const MAX_BODY_BYTES = 1_048_576;

    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $target = self::target($url);
        if ($target === null) {
            return ['status' => 0, 'body' => ''];
        }

        $method = strtoupper($method);
        if (!in_array($method, ['GET', 'POST'], true)) {
            return ['status' => 0, 'body' => ''];
        }

        $headers = array_values(array_filter(
            $headers,
            static fn (mixed $header): bool => is_string($header)
                && !str_contains($header, "\r")
                && !str_contains($header, "\n")
        ));

        if (function_exists('curl_init')) {
            return self::curl($method, $url, $headers, $body, $target);
        }

        // Secure provider calls pin the validated DNS answer with cURL. PHP's
        // stream wrapper would resolve the host a second time and permit DNS
        // rebinding between validation and connection.
        return ['status' => 0, 'body' => ''];
    }

    /**
     * @param list<string> $headers
     * @param array{host: string, port: int, ip: string} $target
     * @return array{status: int, body: string}
     */
    private static function curl(
        string $method,
        string $url,
        array $headers,
        ?string $body,
        array $target
    ): array
    {
        $handle = curl_init($url);
        if ($handle === false) {
            return ['status' => 0, 'body' => ''];
        }

        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_USERAGENT => 'TTDF-OAuth',
            CURLOPT_MAXFILESIZE => self::MAX_BODY_BYTES,
            CURLOPT_RESOLVE => [
                $target['host'] . ':' . $target['port'] . ':' . $target['ip'],
            ],
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_NOSIGNAL => true,
        ];

        if (defined('CURLOPT_PROTOCOLS')) {
            $options[CURLOPT_PROTOCOLS] = CURLPROTO_HTTPS;
        }

        if ($method === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = $body ?? '';
        }

        $result = '';
        $tooLarge = false;
        $options[CURLOPT_WRITEFUNCTION] = static function ($handle, string $chunk) use (&$result, &$tooLarge): int {
            unset($handle);
            if (strlen($result) + strlen($chunk) > self::MAX_BODY_BYTES) {
                $tooLarge = true;

                return 0;
            }
            $result .= $chunk;

            return strlen($chunk);
        };

        curl_setopt_array($handle, $options);
        $completed = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);

        return [
            'status' => $completed === false || $tooLarge ? 0 : $status,
            'body' => $result,
        ];
    }

    /**
     * @return array{host: string, port: int, ip: string}|null
     */
    private static function target(string $url): ?array
    {
        if (
            $url === ''
            || preg_match('/[\x00-\x20\x7f\\\\]/', $url) === 1
            || filter_var($url, FILTER_VALIDATE_URL) === false
        ) {
            return null;
        }

        $parts = parse_url($url);
        if (
            !is_array($parts)
            || strtolower((string) ($parts['scheme'] ?? '')) !== 'https'
            || empty($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['fragment'])
        ) {
            return null;
        }

        $host = rtrim(strtolower((string) $parts['host']), '.');
        $port = isset($parts['port']) ? (int) $parts['port'] : 443;
        if ($host === '' || $port < 1 || $port > 65535) {
            return null;
        }

        $addresses = [];
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            $addresses[] = $host;
        } else {
            foreach (gethostbynamel($host) ?: [] as $address) {
                $addresses[] = $address;
            }
            foreach (dns_get_record($host, DNS_AAAA) ?: [] as $record) {
                if (is_array($record) && is_string($record['ipv6'] ?? null)) {
                    $addresses[] = $record['ipv6'];
                }
            }
        }

        foreach (array_unique($addresses) as $address) {
            if (self::isPublicAddress($address)) {
                return [
                    'host' => $host,
                    'port' => $port,
                    'ip' => $address,
                ];
            }
        }

        return null;
    }

    private static function isPublicAddress(string $address): bool
    {
        return filter_var(
            $address,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }
}
