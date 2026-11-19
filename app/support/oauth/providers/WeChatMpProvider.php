<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * WeChat Official Account (公众号) web authorization.
 */
final class WeChatMpProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://open.weixin.qq.com/connect/oauth2/authorize';

    private const TOKEN_ENDPOINT = 'https://api.weixin.qq.com/sns/oauth2/access_token';

    private const USERINFO_ENDPOINT = 'https://api.weixin.qq.com/sns/userinfo';

    public function id(): string
    {
        return 'wechatmp';
    }

    public function label(): string
    {
        return '微信公众号';
    }

    public function description(): string
    {
        return '微信公众号网页授权（需要已认证服务号）';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['snsapi_userinfo'];
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
            'scope' => $this->scopeString($config, ','),
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

        $openId = $this->firstString($token->raw, ['openid']);
        if ($openId === '') {
            return null;
        }

        $user = $this->getJson(self::USERINFO_ENDPOINT, [
            'access_token' => $token->accessToken,
            'openid' => $openId,
            'lang' => 'zh_CN',
        ]);

        return new Identity(
            $this->id(),
            $openId,
            $this->safeLabel($this->firstString($user, ['nickname'])),
            $this->avatar($this->firstString($user, ['headimgurl'])),
            '',
            $user
        );
    }
}
