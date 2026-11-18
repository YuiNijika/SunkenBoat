<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * WeChat Open Platform website login.
 */
final class WeChatProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://open.weixin.qq.com/connect/qrconnect';

    private const TOKEN_ENDPOINT = 'https://api.weixin.qq.com/sns/oauth2/access_token';

    private const USERINFO_ENDPOINT = 'https://api.weixin.qq.com/sns/userinfo';

    public function id(): string
    {
        return 'wechat';
    }

    public function label(): string
    {
        return '微信';
    }

    public function description(): string
    {
        return '微信开放平台网站应用';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['snsapi_login'];
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
            'appid' => $this->clientId($config),
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $this->scopeString($config),
            'state' => $state,
        ]) . '#wechat_redirect';
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
        unset($redirectUri, $codeVerifier);

        return $this->tokenFrom($this->getJson(self::TOKEN_ENDPOINT, [
            'appid' => $this->clientId($config),
            'secret' => $this->clientSecret($config),
            'code' => $code,
            'grant_type' => 'authorization_code',
        ]));
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        unset($config);

        $openid = $this->firstString($token->raw, ['openid']);
        if ($openid === '') {
            return null;
        }

        $user = $this->getJson(self::USERINFO_ENDPOINT, [
            'access_token' => $token->accessToken,
            'openid' => $openid,
            'lang' => 'zh_CN',
        ]);

        return new Identity(
            $this->id(),
            $openid,
            $this->safeLabel($this->firstString($user, ['nickname'])),
            $this->avatar($this->firstString($user, ['headimgurl'])),
            '',
            $user
        );
    }
}
