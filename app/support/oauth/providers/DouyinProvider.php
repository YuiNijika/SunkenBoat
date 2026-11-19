<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * Douyin open-platform website authorization.
 */
final class DouyinProvider extends AbstractProvider
{
    private const AUTHORIZE_ENDPOINT = 'https://open.douyin.com/platform/oauth/connect/';

    private const TOKEN_ENDPOINT = 'https://open.douyin.com/oauth/access_token/';

    private const USERINFO_ENDPOINT = 'https://open.douyin.com/oauth/userinfo/';

    public function id(): string
    {
        return 'douyin';
    }

    public function label(): string
    {
        return '抖音';
    }

    public function description(): string
    {
        return '抖音开放平台网站应用';
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return ['user_info'];
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
            'client_key' => $this->clientId($config),
            'response_type' => 'code',
            'scope' => $this->scopeString($config, ','),
            'redirect_uri' => $redirectUri,
            'state' => $state,
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
        unset($redirectUri, $codeVerifier);

        return $this->tokenFrom($this->getJson(self::TOKEN_ENDPOINT, [
            'client_key' => $this->clientId($config),
            'client_secret' => $this->clientSecret($config),
            'code' => $code,
            'grant_type' => 'authorization_code',
        ]), 'data');
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        unset($config);

        $openId = $this->firstString($token->raw['data'] ?? $token->raw, ['open_id']);
        if ($openId === '') {
            return null;
        }

        $response = $this->getJson(self::USERINFO_ENDPOINT, [
            'access_token' => $token->accessToken,
            'open_id' => $openId,
        ]);

        return $this->identityFrom($response, [
            'subject' => ['open_id', 'union_id'],
            'name' => ['nickname', 'name'],
            'avatar' => ['avatar', 'avatar_larger'],
            'email' => ['email'],
        ], 'data');
    }
}
