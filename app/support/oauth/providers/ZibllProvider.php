<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use RuntimeException;
use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * Zibll open-login (agent) adapter.
 *
 * Zibll's server accepts `/oauth/{type}` with a signed `state` and
 * `agent_back_url`, then redirects back with the social profile and a second
 * signature. It does not issue an authorization code and does not echo the
 * state, so Flow accepts the signed callback when the start-state cookie is
 * still present.
 */
final class ZibllProvider extends AbstractProvider
{
    private const TYPE_LABELS = [
        'qq' => 'QQ',
        'weixin' => '微信',
        'wechat' => '微信',
        'weibo' => '微博',
        'github' => 'GitHub',
        'gitee' => 'Gitee',
        'alipay' => '支付宝',
        'douyin' => '抖音',
        'weixingzh' => '微信公众号',
        'google' => 'Google',
        'microsoft' => 'Microsoft',
        'twitter' => 'X',
        'facebook' => 'Facebook',
        'apple' => 'Apple',
    ];

    public function __construct(
        private readonly string $identifier = 'zibll',
        private readonly string $configuredType = ''
    ) {
    }

    public function id(): string
    {
        return $this->identifier;
    }

    public function callbackId(): string
    {
        return 'zibll';
    }

    public function label(): string
    {
        return $this->configuredType === ''
            ? '子比聚合登录'
            : '子比 · ' . $this->typeLabel();
    }

    public function description(): string
    {
        return $this->configuredType === ''
            ? '子比主题开放登录（聚合服务）'
            : '子比主题开放登录 · ' . $this->typeLabel();
    }

    public function requiresCode(): bool
    {
        return false;
    }

    public function requiresStateEcho(): bool
    {
        return false;
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
        $server = rtrim(trim((string) ($config['clientId'] ?? '')), '/');
        $key = trim((string) ($config['clientSecret'] ?? ''));

        if ($server === '' || $key === '') {
            throw new RuntimeException('Zibll OAuth server is not configured');
        }

        if (str_ends_with(strtolower($server), '/oauth')) {
            $server = substr($server, 0, -strlen('/oauth'));
        }

        if (preg_match('#^https?://#i', $server) !== 1) {
            throw new RuntimeException('Zibll OAuth server URL is invalid');
        }

        $type = strtolower(trim(
            $this->configuredType !== ''
                ? $this->configuredType
                : (string) ($config['type'] ?? 'qq')
        )) ?: 'qq';
        $params = [
            'state' => $state,
            'agent_back_url' => $redirectUri,
        ];
        $params['sign'] = md5($this->implodeValues($params) . $key);

        return $server . '/oauth/' . rawurlencode($type) . '?' . http_build_query($params);
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
        $query = $_GET;
        $sign = is_string($query['sign'] ?? null) ? (string) $query['sign'] : '';
        unset($query['sign']);

        $key = trim((string) ($config['clientSecret'] ?? ''));
        if ($sign === '' || $key === '') {
            return null;
        }

        $expected = md5($this->implodeValues($query) . $key);
        if (!hash_equals($expected, $sign)) {
            return null;
        }

        $openid = $this->firstString($query, ['openid']);
        if ($openid === '') {
            return null;
        }

        return new Token($openid, '', 0, '', $query);
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        $query = $token->raw;
        $openid = $this->firstString($query, ['openid']);
        if ($openid === '') {
            return null;
        }

        $type = strtolower($this->firstString($query, ['type']));
        if ($type === '') {
            $type = 'unknown';
        }

        $info = is_array($query['getUserInfo'] ?? null) ? $query['getUserInfo'] : [];
        $name = $this->firstString($query, ['name']);
        if ($name === '') {
            $name = $this->firstString($info, ['name', 'nickname', 'screen_name', 'display_name']);
        }

        $avatar = $this->firstString($query, ['avatar']);
        if ($avatar === '') {
            $avatar = $this->firstString($info, [
                'avatar',
                'avatar_url',
                'headimgurl',
                'figureurl_qq_2',
                'picture',
            ]);
        }

        $email = $this->firstString($query, ['email']);
        if ($email === '') {
            $email = $this->firstString($info, ['email', 'mail']);
        }

        return new Identity(
            $this->id(),
            $type . ':' . $openid,
            $this->safeLabel($name),
            $this->avatar($avatar),
            $this->email($email),
            ['query' => $query, 'info' => $info]
        );
    }

    /**
     * Mirrors Zibll's `implode('', $parameter)` signing rule. Nested arrays
     * become the literal string "Array", which is what PHP's implode does in
     * the upstream implementation.
     *
     * @param array<string, mixed> $params
     */
    private function implodeValues(array $params): string
    {
        $parts = [];
        foreach ($params as $value) {
            $parts[] = is_array($value) ? 'Array' : (string) $value;
        }

        return implode('', $parts);
    }

    private function typeLabel(): string
    {
        $type = strtolower(trim($this->configuredType));
        if ($type === '') {
            return '聚合登录';
        }

        return self::TYPE_LABELS[$type] ?? strtoupper($type);
    }
}
