<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

use InvalidArgumentException;
use SunkenBoat\Support\OAuth\Providers\CaiHongProvider;
use SunkenBoat\Support\OAuth\Providers\QQProvider;
use SunkenBoat\Support\OAuth\Providers\WeChatProvider;
use SunkenBoat\Support\OAuth\Providers\WeiboProvider;
use SunkenBoat\Support\OAuth\Providers\ZibllProvider;

/**
 * Provider catalog for the theme's OAuth extension.
 *
 * Themes can register an additional provider without changing Flow or the
 * callback controller. The default catalog contains the common services used
 * by this theme plus BlogsClub, 鼠子 Blog, 彩虹聚合登录 and 子比聚合登录.
 */
final class ProviderRegistry
{
    /** @var array<string, ProviderInterface> */
    private array $providers = [];

    /** @var array<string, string> */
    private array $variantTypes = [];

    public function __construct(bool $withDefaults = true)
    {
        if ($withDefaults) {
            $this->registerDefaults();
        }
    }

    public static function defaults(): self
    {
        return new self();
    }

    /**
     * Build the runtime catalog from the selected aggregate-login types.
     *
     * Each selected type becomes its own provider id so the login dialog and
     * account panel can bind and unbind every platform independently.
     *
     * @param array<string, list<string>> $typesByProvider
     */
    public static function configured(array $typesByProvider): self
    {
        $defaults = self::defaults();
        $registry = new self(false);

        foreach ($defaults->all() as $id => $provider) {
            if ($id === 'caihong' || $id === 'zibll') {
                continue;
            }

            $registry->register($provider);
        }

        foreach (['caihong', 'zibll'] as $id) {
            foreach ($typesByProvider[$id] ?? [] as $type) {
                $type = self::canonicalType($id, (string) $type);
                $slug = self::typeSlug($type);
                if ($type === '' || $slug === '') {
                    continue;
                }

                $variantId = $id . '-' . $slug;
                if (strlen($variantId) > 32 || $registry->get($variantId) !== null) {
                    continue;
                }

                $provider = $id === 'caihong'
                    ? new CaiHongProvider($variantId, $type)
                    : new ZibllProvider($variantId, $type);
                $registry->register($provider);
                $registry->variantTypes[$variantId] = $type;
            }
        }

        return $registry;
    }

    public function register(ProviderInterface $provider): void
    {
        $id = strtolower(trim($provider->id()));
        if (preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $id) !== 1) {
            throw new InvalidArgumentException('Invalid OAuth provider identifier');
        }

        if (isset($this->providers[$id])) {
            throw new InvalidArgumentException('OAuth provider is already registered: ' . $id);
        }

        $this->providers[$id] = $provider;
    }

    public function get(string $id): ?ProviderInterface
    {
        return $this->providers[strtolower(trim($id))] ?? null;
    }

    /**
     * @return array<string, ProviderInterface>
     */
    public function all(): array
    {
        return $this->providers;
    }

    public function reset(): void
    {
        $this->providers = [];
        $this->variantTypes = [];
    }

    /**
     * Return the configured aggregate type for a runtime provider id.
     */
    public function variantType(string $id): string
    {
        return $this->variantTypes[strtolower(trim($id))] ?? '';
    }

    private static function typeSlug(string $type): string
    {
        $slug = preg_replace('/[^a-z0-9_-]+/', '-', strtolower($type)) ?? '';

        return trim($slug, '-');
    }

    private static function canonicalType(string $provider, string $type): string
    {
        $type = strtolower(trim($type));

        if ($provider === 'caihong') {
            return match ($type) {
                'wechat', 'weixin' => 'wx',
                'weibo' => 'sina',
                default => $type,
            };
        }

        return match ($type) {
            'wx', 'wechat' => 'weixin',
            'sina' => 'weibo',
            default => $type,
        };
    }

    private function registerDefaults(): void
    {
        $this->register(new QQProvider());
        $this->register(new WeChatProvider());
        $this->register(new WeiboProvider());

        $this->register(new GenericProvider(
            identifier: 'github',
            displayName: 'GitHub',
            authorizeEndpoint: 'https://github.com/login/oauth/authorize',
            tokenEndpoint: 'https://github.com/login/oauth/access_token',
            userInfoEndpoint: 'https://api.github.com/user',
            scopes: ['read:user', 'user:email'],
            description: 'GitHub OAuth App',
            authorizeParams: ['allow_signup' => 'false'],
            userInfoHeaders: ['Accept: application/vnd.github+json'],
            identityKeys: [
                'subject' => ['id'],
                'name' => ['name', 'login'],
                'avatar' => ['avatar_url'],
                'email' => ['email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'gitee',
            displayName: 'Gitee',
            authorizeEndpoint: 'https://gitee.com/oauth/authorize',
            tokenEndpoint: 'https://gitee.com/oauth/token',
            userInfoEndpoint: 'https://gitee.com/api/v5/user',
            scopes: ['user_info'],
            description: 'Gitee 开放平台应用',
            userInfoTokenParam: 'access_token',
            identityKeys: [
                'subject' => ['id'],
                'name' => ['name', 'login'],
                'avatar' => ['avatar_url'],
                'email' => ['email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'gitlab',
            displayName: 'GitLab',
            authorizeEndpoint: 'https://gitlab.com/oauth/authorize',
            tokenEndpoint: 'https://gitlab.com/oauth/token',
            userInfoEndpoint: 'https://gitlab.com/api/v4/user',
            scopes: ['read_user'],
            description: 'GitLab OAuth Application',
            identityKeys: [
                'subject' => ['id'],
                'name' => ['name', 'username'],
                'avatar' => ['avatar_url'],
                'email' => ['email', 'public_email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'google',
            displayName: 'Google',
            authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
            userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
            scopes: ['openid', 'email', 'profile'],
            description: 'Google Cloud OAuth 2.0 客户端',
            authorizeParams: ['access_type' => 'online', 'prompt' => 'select_account'],
            identityKeys: [
                'subject' => ['sub'],
                'name' => ['name'],
                'avatar' => ['picture'],
                'email' => ['email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'microsoft',
            displayName: 'Microsoft',
            authorizeEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
            tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            userInfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
            scopes: ['openid', 'profile', 'email', 'User.Read'],
            description: 'Microsoft Entra ID 应用',
            identityKeys: [
                'subject' => ['id'],
                'name' => ['displayName'],
                'avatar' => ['picture'],
                'email' => ['mail', 'userPrincipalName'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'huawei',
            displayName: '华为',
            authorizeEndpoint: 'https://oauth-login.cloud.huawei.com/oauth2/v3/authorize',
            tokenEndpoint: 'https://oauth-login.cloud.huawei.com/oauth2/v3/token',
            userInfoEndpoint: 'https://oauth-login.cloud.huawei.com/oauth2/v3/userinfo',
            scopes: ['openid', 'profile', 'email'],
            description: '华为账号 OAuth 2.0',
            identityKeys: [
                'subject' => ['sub', 'openid'],
                'name' => ['name', 'nickname', 'displayName'],
                'avatar' => ['picture', 'headPictureURL', 'avatar'],
                'email' => ['email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'xiaomi',
            displayName: '小米',
            authorizeEndpoint: 'https://account.xiaomi.com/oauth2/authorize',
            tokenEndpoint: 'https://account.xiaomi.com/oauth2/token',
            userInfoEndpoint: 'https://open.account.xiaomi.com/user/profile',
            scopes: ['1'],
            description: '小米开放平台账号服务',
            userInfoQuery: ['clientId' => '{client_id}'],
            userInfoTokenParam: 'token',
            userInfoEnvelope: 'data',
            successKey: 'result',
            successValue: 'ok',
            identityKeys: [
                'subject' => ['unionId', 'userId', 'id'],
                'name' => ['miliaoNick', 'name'],
                'avatar' => ['miliaoIcon', 'avatar'],
                'email' => ['email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'blogsclub',
            displayName: 'BlogsClub',
            authorizeEndpoint: 'https://www.blogsclub.org/Oauth/Login',
            tokenEndpoint: 'https://www.blogsclub.org/Oauth/getOauthData?action=token',
            userInfoEndpoint: 'https://www.blogsclub.org/Oauth/getOauthData?action=userinfo',
            scopes: ['basic', 'email'],
            scopeSeparator: ',',
            description: 'BlogsClub 博主授权登录',
            userInfoTokenParam: 'access_token',
            userInfoEnvelope: 'data',
            successKey: 'status',
            successValue: 200,
            identityKeys: [
                'subject' => ['openid'],
                'name' => ['blog_name'],
                'avatar' => ['blogger_avatar'],
                'email' => ['email'],
            ],
        ));

        $this->register(new GenericProvider(
            identifier: 'moe',
            displayName: '鼠子 Blog',
            authorizeEndpoint: 'https://api.miomoe.cn/oauth/authorize',
            tokenEndpoint: 'https://api.miomoe.cn/oauth/token',
            userInfoEndpoint: 'https://api.miomoe.cn/oauth/userinfo',
            scopes: ['basic', 'email'],
            pkce: true,
            description: '鼠子 Blog（api.miomoe.cn）OAuth',
            userInfoEnvelope: 'data',
            successKey: 'success',
            successValue: true,
            identityKeys: [
                'subject' => ['openid'],
                'name' => ['display_name', 'name'],
                'avatar' => ['avatar'],
                'email' => ['email'],
            ],
        ));

        $this->register(new CaiHongProvider());
        $this->register(new ZibllProvider());
    }
}
