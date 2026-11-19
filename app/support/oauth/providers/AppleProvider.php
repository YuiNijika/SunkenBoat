<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * Sign in with Apple.
 *
 * The configured client secret is the contents of the .p8 private key. Team
 * ID and Key ID are appended by the theme flow as `teamId` and `keyId`.
 */
final class AppleProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://appleid.apple.com/auth/authorize';

    private const TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';

    public function id(): string
    {
        return 'apple';
    }

    public function label(): string
    {
        return 'Apple';
    }

    public function description(): string
    {
        return 'Sign in with Apple（Services ID + .p8 私钥）';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['name', 'email'];
    }

    /**
     * @param array<string, mixed> $config
     */
    public function authorizeUrl(
        array $config,
        string $redirectUri,
        string $state,
        ?string $codeChallenge = null
    ): string {
        unset($codeChallenge);

        return $this->appendQuery(self::AUTHORIZE_ENDPOINT, [
            'response_type' => 'code',
            'client_id' => $this->clientId($config),
            'redirect_uri' => $redirectUri,
            'scope' => $this->scopeString($config),
            'state' => $state,
            'response_mode' => 'form_post',
        ]);
    }

    /**
     * @param array<string, mixed> $config
     */
    public function exchange(
        array $config,
        string $code,
        string $redirectUri,
        ?string $codeVerifier = null
    ): ?Token {
        unset($codeVerifier);

        $secret = $this->clientSecretJwt($config);
        if ($secret === '') {
            return null;
        }

        return $this->tokenFrom($this->postForm(self::TOKEN_ENDPOINT, [
            'grant_type' => 'authorization_code',
            'client_id' => $this->clientId($config),
            'client_secret' => $secret,
            'code' => $code,
            'redirect_uri' => $redirectUri,
        ]));
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        unset($config);

        $idToken = $this->firstString($token->raw, ['id_token']);
        $parts = explode('.', $idToken);
        if (count($parts) !== 3) {
            return null;
        }

        $payload = json_decode((string) $this->base64UrlDecode($parts[1]), true);
        if (!is_array($payload)) {
            return null;
        }

        $subject = $this->firstString($payload, ['sub']);
        if ($subject === '') {
            return null;
        }

        return new Identity(
            $this->id(),
            $subject,
            $this->safeLabel($this->firstString($payload, ['name'])),
            '',
            $this->email($this->firstString($payload, ['email'])),
            $payload
        );
    }

    /**
     * @param array<string, mixed> $config
     */
    private function clientSecretJwt(array $config): string
    {
        $teamId = trim((string) ($config['teamId'] ?? ''));
        $keyId = trim((string) ($config['keyId'] ?? ''));
        $privateKey = $this->clientSecret($config);
        if ($teamId === '' || $keyId === '' || $privateKey === '') {
            return '';
        }

        $now = time();
        $header = $this->base64Url((string) json_encode([
            'alg' => 'ES256',
            'kid' => $keyId,
            'typ' => 'JWT',
        ], JSON_UNESCAPED_SLASHES));
        $claims = $this->base64Url((string) json_encode([
            'iss' => $teamId,
            'iat' => $now,
            'exp' => $now + 86400 * 180,
            'aud' => 'https://appleid.apple.com',
            'sub' => $this->clientId($config),
        ], JSON_UNESCAPED_SLASHES));
        $unsigned = $header . '.' . $claims;

        $key = openssl_pkey_get_private($privateKey);
        if ($key === false) {
            return '';
        }

        $signature = '';
        if (!openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
            return '';
        }

        return $unsigned . '.' . $this->base64Url($signature);
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);

        return is_string($decoded) ? $decoded : '';
    }
}
