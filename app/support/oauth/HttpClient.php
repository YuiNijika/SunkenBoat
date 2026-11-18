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
    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        if (preg_match('#^https?://#i', $url) !== 1) {
            return ['status' => 0, 'body' => ''];
        }

        $method = strtoupper($method);
        if (!in_array($method, ['GET', 'POST'], true)) {
            return ['status' => 0, 'body' => ''];
        }

        if (function_exists('curl_init')) {
            return self::curl($method, $url, $headers, $body);
        }

        return self::stream($method, $url, $headers, $body);
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    private static function curl(string $method, string $url, array $headers, ?string $body): array
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
        ];

        if (defined('CURLOPT_PROTOCOLS')) {
            $options[CURLOPT_PROTOCOLS] = CURLPROTO_HTTP | CURLPROTO_HTTPS;
        }

        if ($method === 'POST') {
            $options[CURLOPT_POST] = true;
            $options[CURLOPT_POSTFIELDS] = $body ?? '';
        }

        curl_setopt_array($handle, $options);
        $result = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);

        return [
            'status' => $status,
            'body' => is_string($result) ? $result : '',
        ];
    }

    /**
     * @param list<string> $headers
     * @return array{status: int, body: string}
     */
    private static function stream(string $method, string $url, array $headers, ?string $body): array
    {
        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $headers),
                'content' => $body ?? '',
                'timeout' => 15,
                'ignore_errors' => true,
                'follow_location' => 0,
                'max_redirects' => 0,
            ],
        ]);

        $result = @file_get_contents($url, false, $context);
        $status = 0;

        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $matches) === 1) {
                $status = (int) $matches[1];
            }
        }

        return [
            'status' => $status,
            'body' => is_string($result) ? $result : '',
        ];
    }
}
