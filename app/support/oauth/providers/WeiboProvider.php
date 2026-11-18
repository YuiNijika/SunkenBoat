<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * Sina Weibo OAuth 2.0 website login.
 */
final class WeiboProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://api.weibo.com/oauth2/authorize';

    private const TOKEN_ENDPOINT = 'https://api.weibo.com/oauth2/access_token';

    private const USERINFO_ENDPOINT = 'https://api.weibo.com/2/users/show.json';

    public function id(): string
    {
        return 'weibo';
    }

    public function label(): string
    {
        return '微博';
    }

    public function description(): string
    {
        return '微博开放平台网站应用';
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

        $params = [
            'client_id' => $this->clientId($config),
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'state' => $state,
        ];

        $scope = $this->scopeString($config);
        if ($scope !== '') {
            $params['scope'] = $scope;
        }

        return $this->appendQuery(self::AUTHORIZE_ENDPOINT, $params);
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

        return $this->tokenFrom($this->postForm(self::TOKEN_ENDPOINT, [
            'client_id' => $this->clientId($config),
            'client_secret' => $this->clientSecret($config),
            'grant_type' => 'authorization_code',
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

        $uid = $this->firstString($token->raw, ['uid']);
        if ($uid === '') {
            return null;
        }

        $user = $this->getJson(self::USERINFO_ENDPOINT, [
            'access_token' => $token->accessToken,
            'uid' => $uid,
        ]);

        return new Identity(
            $this->id(),
            $uid,
            $this->safeLabel($this->firstString($user, ['screen_name', 'name'])),
            $this->avatar($this->firstString($user, ['profile_image_url', 'avatar_large'])),
            '',
            $user
        );
    }
}
