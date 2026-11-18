<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth\Providers;

use RuntimeException;
use SunkenBoat\Support\OAuth\AbstractProvider;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\Token;

/**
 * 彩虹聚合登录 adapter.
 *
 * The service exposes a small JSON API instead of a standard OAuth 2.0
 * authorization endpoint. The login URL is obtained from `act=login`, the
 * callback code is exchanged with `act=callback`, and the callback payload
 * already contains the social profile.
 */
final class CaiHongProvider extends AbstractProvider
{
    private const TYPE_LABELS = [
        'qq' => 'QQ',
        'wx' => '微信',
        'wechat' => '微信',
        'weixin' => '微信',
        'sina' => '微博',
        'weibo' => '微博',
        'alipay' => '支付宝',
        'gitee' => 'Gitee',
        'github' => 'GitHub',
        'douyin' => '抖音',
    ];

    public function __construct(
        private readonly string $identifier = 'caihong',
        private readonly string $configuredType = ''
    ) {
    }

    public function id(): string
    {
        return $this->identifier;
    }

    public function callbackId(): string
    {
        return 'caihong';
    }

    public function label(): string
    {
        return $this->configuredType === ''
            ? '彩虹聚合登录'
            : '彩虹 · ' . $this->typeLabel();
    }

    public function description(): string
    {
        return $this->configuredType === ''
            ? '彩虹聚合登录（QQ / 微信 / 微博等）'
            : '彩虹聚合登录 · ' . $this->typeLabel();
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
        $response = $this->getJson($this->endpoint($config), [
            'act' => 'login',
            'appid' => $this->clientId($config),
            'appkey' => $this->clientSecret($config),
            'type' => $this->type($config),
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ]);

        if (!$this->isOk($response)) {
            throw new RuntimeException('CaiHong login request failed');
        }

        $url = $this->firstString($response, ['url']);
        if ($url === '' || preg_match('#^https?://#i', $url) !== 1) {
            throw new RuntimeException('CaiHong login URL is invalid');
        }

        return $url;
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
        $response = $this->getJson($this->endpoint($config), [
            'act' => 'callback',
            'appid' => $this->clientId($config),
            'appkey' => $this->clientSecret($config),
            'code' => $code,
        ]);

        if (!$this->isOk($response)) {
            return null;
        }

        $subject = $this->firstString($response, ['social_uid']);
        if ($subject === '') {
            return null;
        }

        $accessToken = $this->firstString($response, ['access_token', 'token']);

        return new Token(
            $accessToken !== '' ? $accessToken : $subject,
            '',
            0,
            '',
            $response
        );
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        $data = $token->raw;
        $subject = $this->firstString($data, ['social_uid']);
        if ($subject === '') {
            return null;
        }

        $type = strtolower($this->firstString($data, ['type']));
        if ($type === '') {
            $type = 'unknown';
        }

        $name = $this->firstString($data, ['nickname', 'nick_name', 'name']);
        $avatar = $this->firstString($data, ['faceimg', 'avatar', 'headimgurl']);
        $email = $this->firstString($data, ['email']);

        if ($name === '' || $avatar === '') {
            $detail = $this->getJson($this->endpoint($config), [
                'act' => 'query',
                'appid' => $this->clientId($config),
                'appkey' => $this->clientSecret($config),
                'type' => $type,
                'social_uid' => $subject,
            ]);

            if ($this->isOk($detail)) {
                $data = array_merge($data, $detail);
                $name = $name !== ''
                    ? $name
                    : $this->firstString($detail, ['nickname', 'nick_name', 'name']);
                $avatar = $avatar !== ''
                    ? $avatar
                    : $this->firstString($detail, ['faceimg', 'avatar', 'headimgurl']);
                $email = $email !== ''
                    ? $email
                    : $this->firstString($detail, ['email']);
            }
        }

        if (str_contains(strtolower($avatar), 'no_portrait')) {
            $avatar = '';
        }

        return new Identity(
            $this->id(),
            $type . ':' . $subject,
            $this->safeLabel($name),
            $this->avatar($avatar),
            $this->email($email),
            $data
        );
    }

    /**
     * @param array<string, mixed> $config
     */
    private function endpoint(array $config): string
    {
        $url = trim((string) ($config['apiUrl'] ?? ''));
        if ($url === '') {
            throw new RuntimeException('CaiHong API URL is not configured');
        }

        $url = rtrim($url, '/');
        if (str_ends_with(strtolower($url), '/connect.php')) {
            $url = substr($url, 0, -strlen('/connect.php'));
        }

        if (preg_match('#^https?://#i', $url) !== 1) {
            throw new RuntimeException('CaiHong API URL is invalid');
        }

        return $url . '/connect.php';
    }

    /**
     * @param array<string, mixed> $config
     */
    private function type(array $config): string
    {
        $type = strtolower(trim(
            $this->configuredType !== ''
                ? $this->configuredType
                : (string) ($config['type'] ?? 'qq')
        ));

        return match ($type) {
            '', 'qq' => 'qq',
            'weixin', 'wechat' => 'wx',
            'weibo' => 'sina',
            default => $type,
        };
    }

    private function typeLabel(): string
    {
        $type = strtolower(trim($this->configuredType));
        if ($type === '') {
            return '聚合登录';
        }

        return self::TYPE_LABELS[$type] ?? strtoupper($type);
    }

    /**
     * @param array<string, mixed> $response
     */
    private function isOk(array $response): bool
    {
        $code = $response['code'] ?? 0;

        return !is_numeric($code) || (int) $code === 0;
    }
}
