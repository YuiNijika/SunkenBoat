<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * X / Twitter OAuth 2.0 with PKCE and confidential-client Basic auth.
 */
final class TwitterProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://twitter.com/i/oauth2/authorize';

    private const TOKEN_ENDPOINT = 'https://api.twitter.com/2/oauth2/token';

    private const USERINFO_ENDPOINT = 'https://api.twitter.com/2/users/me';

    public function id(): string
    {
        return 'twitter';
    }

    public function label(): string
    {
        return 'X / Twitter';
    }

    public function description(): string
    {
        return 'X / Twitter OAuth 2.0 应用';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['users.read', 'tweet.read', 'offline.access'];
    }

    public function usesPkce(): bool
    {
        return true;
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
        return $this->appendQuery(self::AUTHORIZE_ENDPOINT, [
            'response_type' => 'code',
            'client_id' => $this->clientId($config),
            'redirect_uri' => $redirectUri,
            'scope' => $this->scopeString($config),
            'state' => $state,
            'code_challenge' => (string) $codeChallenge,
            'code_challenge_method' => 'S256',
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
        $credentials = base64_encode($this->clientId($config) . ':' . $this->clientSecret($config));

        return $this->tokenFrom($this->postForm(self::TOKEN_ENDPOINT, [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'code_verifier' => (string) $codeVerifier,
        ], [
            'Authorization: Basic ' . $credentials,
        ]));
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        unset($config);

        $response = $this->getJson(self::USERINFO_ENDPOINT, [
            'user.fields' => 'profile_image_url,name,username',
        ], [
            'Authorization: Bearer ' . $token->accessToken,
        ]);

        return $this->identityFrom($response, [
            'subject' => ['id'],
            'name' => ['name', 'username'],
            'avatar' => ['profile_image_url'],
            'email' => ['email'],
        ], 'data');
    }
}
