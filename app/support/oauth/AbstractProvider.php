<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * Shared protocol helpers for OAuth 2.0 providers.
 */
abstract class AbstractProvider implements ProviderInterface
{
    public function callbackId(): string
    {
        return $this->id();
    }

    public function description(): string
    {
        return '';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return [];
    }

    public function usesPkce(): bool
    {
        return false;
    }

    public function requiresCode(): bool
    {
        return true;
    }

    public function requiresStateEcho(): bool
    {
        return true;
    }

    /**
     * @param array<string, mixed> $config
     */
    protected function clientId(array $config): string
    {
        return trim((string) ($config['clientId'] ?? ''));
    }

    /**
     * @param array<string, mixed> $config
     */
    protected function clientSecret(array $config): string
    {
        return trim((string) ($config['clientSecret'] ?? ''));
    }

    /**
     * @param array<string, mixed> $config
     */
    protected function scopeString(array $config, string $separator = ' '): string
    {
        $scope = trim((string) ($config['scope'] ?? ''));
        if ($scope !== '') {
            return $scope;
        }

        return implode($separator, $this->defaultScopes());
    }

    /**
     * @param array<string, mixed> $query
     */
    protected function appendQuery(string $url, array $query): string
    {
        if ($query === []) {
            return $url;
        }

        return $url . (str_contains($url, '?') ? '&' : '?') . http_build_query($query);
    }

    /**
     * @return array<string, mixed>
     */
    protected function decode(string $body): array
    {
        $decoded = json_decode($body, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        parse_str($body, $query);

        return is_array($query) ? $query : [];
    }

    /**
     * QQ's legacy endpoints wrap JSON in a JSONP callback.
     *
     * @return array<string, mixed>
     */
    protected function decodeJsonp(string $body): array
    {
        if (preg_match('/\{.*\}/s', $body, $matches) === 1) {
            $decoded = json_decode($matches[0], true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return $this->decode($body);
    }

    /**
     * @param array<string, mixed> $data
     */
    protected function tokenFrom(array $data, ?string $envelope = null): ?Token
    {
        $payload = $this->unwrap($data, $envelope);
        $accessToken = $this->firstString($payload, ['access_token', 'accessToken', 'token']);
        if ($accessToken === '') {
            return null;
        }

        return new Token(
            $accessToken,
            $this->firstString($payload, ['refresh_token', 'refreshToken']),
            (int) ($payload['expires_in'] ?? $payload['expiresIn'] ?? 0),
            $this->firstString($payload, ['scope']),
            $data
        );
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, list<string>> $keys
     */
    protected function identityFrom(array $data, array $keys = [], ?string $envelope = null): ?Identity
    {
        $payload = $this->unwrap($data, $envelope);
        $keys = array_merge([
            'subject' => ['sub', 'openid', 'openId', 'id', 'uid', 'userId', 'user_id', 'account_id'],
            'name' => ['name', 'display_name', 'displayName', 'nickname', 'screen_name', 'login', 'username'],
            'avatar' => ['avatar', 'avatar_url', 'picture', 'headimgurl', 'figureurl_qq_2', 'profile_image_url'],
            'email' => ['email', 'mail', 'userPrincipalName'],
        ], $keys);

        $subject = $this->firstString($payload, $keys['subject']);
        if ($subject === '') {
            return null;
        }

        return new Identity(
            $this->id(),
            $subject,
            $this->safeLabel($this->firstString($payload, $keys['name'])),
            $this->avatar($this->firstString($payload, $keys['avatar'])),
            $this->email($this->firstString($payload, $keys['email'])),
            $data
        );
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    protected function unwrap(array $data, ?string $envelope): array
    {
        if ($envelope !== null && $envelope !== '' && is_array($data[$envelope] ?? null)) {
            return $data[$envelope];
        }

        return $data;
    }

    /**
     * @param array<string, mixed> $data
     * @param list<string> $keys
     */
    protected function firstString(array $data, array $keys): string
    {
        foreach ($keys as $key) {
            $value = $data[$key] ?? null;
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
            if (is_int($value) || is_float($value)) {
                return (string) $value;
            }
        }

        return '';
    }

    /**
     * @param array<string, mixed> $query
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    protected function getJson(string $url, array $query = [], array $headers = []): array
    {
        $headers = array_merge([
            'Accept: application/json',
            'User-Agent: TTDF-OAuth',
        ], $headers);
        $response = HttpClient::request('GET', $this->appendQuery($url, $query), $headers);

        return $this->decode($response['body']);
    }

    /**
     * @param array<string, mixed> $query
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    protected function getJsonp(string $url, array $query = [], array $headers = []): array
    {
        $headers = array_merge([
            'Accept: application/json',
            'User-Agent: TTDF-OAuth',
        ], $headers);
        $response = HttpClient::request('GET', $this->appendQuery($url, $query), $headers);

        return $this->decodeJsonp($response['body']);
    }

    /**
     * @param array<string, mixed> $params
     * @param list<string> $headers
     * @return array<string, mixed>
     */
    protected function postForm(string $url, array $params, array $headers = []): array
    {
        $headers = array_merge([
            'Accept: application/json',
            'Content-Type: application/x-www-form-urlencoded',
            'User-Agent: TTDF-OAuth',
        ], $headers);
        $response = HttpClient::request('POST', $url, $headers, http_build_query($params));

        return $this->decode($response['body']);
    }

    protected function safeLabel(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim(strip_tags($value));
        if ($value === '') {
            return '';
        }

        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, 32, 'UTF-8');
        }

        return substr($value, 0, 32);
    }

    protected function avatar(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        if ($value === '' || preg_match('#^https?://#i', $value) !== 1) {
            return '';
        }

        return filter_var($value, FILTER_VALIDATE_URL) === false ? '' : $value;
    }

    protected function email(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        return filter_var($value, FILTER_VALIDATE_EMAIL) === false ? '' : $value;
    }
}
