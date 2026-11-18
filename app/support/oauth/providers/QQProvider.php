<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * QQ Connect uses a JSONP identity endpoint before the profile call.
 */
final class QQProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://graph.qq.com/oauth2.0/authorize';

    private const TOKEN_ENDPOINT = 'https://graph.qq.com/oauth2.0/token';

    private const OPENID_ENDPOINT = 'https://graph.qq.com/oauth2.0/me';

    private const USERINFO_ENDPOINT = 'https://graph.qq.com/user/get_user_info';

    public function id(): string
    {
        return 'qq';
    }

    public function label(): string
    {
        return 'QQ';
    }

    public function description(): string
    {
        return 'QQ 互联网站应用';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['get_user_info'];
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
            'state' => $state,
            'scope' => $this->scopeString($config),
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
            'grant_type' => 'authorization_code',
            'client_id' => $this->clientId($config),
            'client_secret' => $this->clientSecret($config),
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'fmt' => 'json',
        ]));
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        $me = $this->getJsonp(self::OPENID_ENDPOINT, [
            'access_token' => $token->accessToken,
            'fmt' => 'json',
        ]);
        $openid = $this->firstString($me, ['openid']);
        if ($openid === '') {
            return null;
        }

        $user = $this->getJson(self::USERINFO_ENDPOINT, [
            'access_token' => $token->accessToken,
            'oauth_consumer_key' => $this->clientId($config),
            'openid' => $openid,
            'fmt' => 'json',
        ]);

        return new Identity(
            $this->id(),
            $openid,
            $this->safeLabel($this->firstString($user, ['nickname'])),
            $this->avatar($this->firstString($user, ['figureurl_qq_2', 'figureurl_qq_1'])),
            '',
            $user
        );
    }
}
