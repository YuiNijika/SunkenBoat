<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * Facebook Login for web.
 */
final class FacebookProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://www.facebook.com/v19.0/dialog/oauth';

    private const TOKEN_ENDPOINT = 'https://graph.facebook.com/v19.0/oauth/access_token';

    private const USERINFO_ENDPOINT = 'https://graph.facebook.com/v19.0/me';

    public function id(): string
    {
        return 'facebook';
    }

    public function label(): string
    {
        return 'Facebook';
    }

    public function description(): string
    {
        return 'Facebook 开发者应用';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['public_profile', 'email'];
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
            'client_id' => $this->clientId($config),
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'state' => $state,
            'scope' => $this->scopeString($config, ','),
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

        return $this->tokenFrom($this->getJson(self::TOKEN_ENDPOINT, [
            'client_id' => $this->clientId($config),
            'client_secret' => $this->clientSecret($config),
            'redirect_uri' => $redirectUri,
            'code' => $code,
        ]));
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        unset($config);

        $user = $this->getJson(self::USERINFO_ENDPOINT, [
            'fields' => 'id,name,email,picture.type(large)',
            'access_token' => $token->accessToken,
        ]);
        $id = $this->firstString($user, ['id']);
        if ($id === '') {
            return null;
        }

        $picture = is_array($user['picture'] ?? null) && is_array($user['picture']['data'] ?? null)
            ? $user['picture']['data']
            : [];

        return new Identity(
            $this->id(),
            $id,
            $this->safeLabel($this->firstString($user, ['name'])),
            $this->avatar($this->firstString($picture, ['url'])),
            $this->email($this->firstString($user, ['email'])),
            $user
        );
    }
}
