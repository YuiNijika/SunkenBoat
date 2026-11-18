<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use InvalidArgumentException;
use SunkenBoat\Support\OAuth\CallbackResult;
use SunkenBoat\Support\OAuth\CookieStateStore;
use SunkenBoat\Support\OAuth\Flow;
use SunkenBoat\Support\OAuth\Identity;
use SunkenBoat\Support\OAuth\ProviderInterface;
use SunkenBoat\Support\OAuth\ProviderRegistry;
use SunkenBoat\Support\OAuth\TypechoBindingStore;
use TTDF\Ajax\Endpoint;
use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Http\Rest\V2\Auth as RestAuth;
use TTDF\Http\Rest\V2\Users;
use TTDF\Theme\Assets;
use TTDF\Theme\Options;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Theme-owned OAuth 2.0 login and binding.
 *
 * Protocol adapters and the authorization-code flow live under
 * `app/support/oauth/`; this class is the thin Typecho integration layer. It
 * owns routes, auto-registration, login and the payload consumed by the
 * account panel. Bindings remain per-user Typecho options so the core users
 * table keeps its original shape.
 */
final class OAuth
{
    public const STATE_COOKIE = Flow::STATE_COOKIE;

    public const PENDING_COOKIE = 'ttdf_oauth_pending';

    public const PENDING_TTL = 900;

    /** @var array<string, string> */
    private const SETTING_PREFIXES = [
        'qq' => 'OAuth_QQ',
        'wechat' => 'OAuth_WeChat',
        'weibo' => 'OAuth_Weibo',
        'github' => 'OAuth_GitHub',
        'gitee' => 'OAuth_Gitee',
        'gitlab' => 'OAuth_GitLab',
        'google' => 'OAuth_Google',
        'microsoft' => 'OAuth_Microsoft',
        'huawei' => 'OAuth_Huawei',
        'xiaomi' => 'OAuth_Xiaomi',
        'blogsclub' => 'OAuth_BlogsClub',
        'moe' => 'OAuth_Moe',
        'caihong' => 'OAuth_CaiHong',
        'zibll' => 'OAuth_Zibll',
    ];

    private static ?Flow $flow = null;

    public static function register(): void
    {
        Hooks::addFilter('router.match', [self::class, 'match']);
        Endpoint::register('oauth-unbind', [self::class, 'unbind'], [
            'auth' => 'user',
            'method' => 'POST',
        ]);
    }

    /**
     * @param array<string, string> $params
     */
    public static function handle(array $params): void
    {
        if (strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
            http_response_code(405);
            header('Allow: GET');
            exit;
        }

        $provider = (string) ($params['provider'] ?? '');
        $step = (string) ($params['step'] ?? '');

        if ($step === 'start') {
            self::start($provider);
        }

        if ($step === 'callback') {
            self::callback($provider);
        }

        self::fail('oauth_failed');
    }

    public static function match(mixed $value, string $path): mixed
    {
        if ($value !== null) {
            return $value;
        }

        if ($path === 'ttdf/oauth/complete') {
            return [
                'handler' => [self::class, 'complete'],
                'params' => [],
            ];
        }

        if (preg_match('#^ttdf/oauth/([a-z0-9][a-z0-9_-]{0,31})/(start|callback)$#', $path, $matches) !== 1) {
            return $value;
        }

        return [
            'handler' => [self::class, 'handle'],
            'params' => [
                'provider' => $matches[1],
                'step' => $matches[2],
            ],
        ];
    }

    public static function enabled(): bool
    {
        try {
            return self::flow()->isEnabled();
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth configuration failed: ' . $exception->getMessage());

            return false;
        }
    }

    /**
     * Payload consumed by the React account panel and login dialog.
     *
     * @return array<string, mixed>
     */
    public static function client(): array
    {
        $empty = [
            'enabled' => false,
            'providers' => [],
            'startBase' => '',
            'unbind' => '',
            'nonce' => '',
            'nullImage' => '',
        ];

        try {
            $flow = self::flow();
            if (!$flow->isEnabled()) {
                return $empty;
            }

            $uid = self::currentUid();
            $providers = [];
            foreach ($flow->providers() as $provider) {
                $id = $provider->id();
                $binding = $uid > 0 ? $flow->binding($uid, $id) : null;
                $providers[] = [
                    'id' => $id,
                    'label' => $provider->label(),
                    'description' => $provider->description(),
                    'bound' => $binding !== null,
                    'name' => (string) ($binding['name'] ?? ''),
                    'avatar' => (string) ($binding['avatar'] ?? ''),
                    'boundAt' => (int) ($binding['boundAt'] ?? 0),
                ];
            }

            $index = rtrim(Typecho::indexUrl(), '/');
            if ($index === '') {
                $index = rtrim(Typecho::siteUrl(), '/');
            }

            return [
                'enabled' => true,
                'providers' => $providers,
                'startBase' => $index === '' ? '' : $index . '/ttdf/oauth',
                'unbind' => Endpoint::url('oauth-unbind'),
                'nonce' => Typecho::securityToken(),
                'nullImage' => Assets::url('img/null.svg'),
            ];
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth client payload failed: ' . $exception->getMessage());

            return $empty;
        }
    }

    /**
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public static function unbind(array $input): array
    {
        $uid = self::currentUid();
        if ($uid <= 0) {
            Response::error('Authentication required', 401);
        }

        $provider = strtolower(trim((string) ($input['provider'] ?? '')));
        if (preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $provider) !== 1) {
            Response::error('Invalid request body', 422, [
                'provider' => '未知的社交账号',
            ]);
        }

        try {
            self::flow()->unbind($uid, $provider);
        } catch (InvalidArgumentException) {
            Response::error('Invalid request body', 422, [
                'provider' => '未知的社交账号',
            ]);
        }

        return ['oauth' => self::client()];
    }

    /**
     * Complete an unbound OAuth login by verifying an existing local account.
     *
     * @param array<string, string> $params
     */
    public static function complete(array $params): void
    {
        unset($params);

        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if (!in_array($method, ['GET', 'POST'], true)) {
            http_response_code(405);
            header('Allow: GET, POST');
            exit;
        }

        $pending = self::readPending();
        if ($pending === null) {
            self::renderCompleteError('绑定信息已过期，请重新发起社交账号登录。', 410);
        }

        try {
            $flow = self::flow();
            if (!$flow->isEnabled()) {
                self::clearPending();
                self::renderCompleteError('站点已关闭社交账号登录，请返回登录页重试。', 410);
            }

            $provider = $flow->provider($pending['provider']);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth pending provider failed: ' . $exception->getMessage());
            $provider = null;
        }

        if ($provider === null) {
            self::clearPending();
            self::renderCompleteError('该社交登录方式已停用，请返回登录页重试。', 410);
        }

        if ($method === 'GET') {
            self::renderPendingPage($pending, $provider);
        }

        if (!RestAuth::originMatches()) {
            self::renderPendingPage($pending, $provider, '请求来源无效，请从本站页面重新提交。', 403);
        }

        $csrf = is_string($_POST['csrf'] ?? null) ? (string) $_POST['csrf'] : '';
        if ($csrf === '' || !hash_equals($pending['csrf'], $csrf)) {
            self::renderPendingPage($pending, $provider, '页面已过期，请刷新后重试。', 419);
        }

        $name = is_string($_POST['name'] ?? null) ? trim((string) $_POST['name']) : '';
        $password = is_string($_POST['password'] ?? null) ? (string) $_POST['password'] : '';
        if ($name === '' || $password === '' || strlen($name) > 64 || strlen($password) > 128) {
            self::renderPendingPage($pending, $provider, '请输入本站账号的用户名或邮箱与密码。', 422);
        }

        try {
            $user = (new RestAuth())->attempt($name, $password);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth account verification failed: ' . $exception->getMessage());
            $user = null;
        }

        $uid = is_array($user) ? (int) ($user['uid'] ?? 0) : 0;
        if ($uid <= 0) {
            self::renderPendingPage($pending, $provider, '用户名或密码无效。', 422);
        }

        try {
            $owner = self::flow()->owner($pending['provider'], $pending['identity']->subject);
            if ($owner > 0 && $owner !== $uid) {
                self::renderPendingPage($pending, $provider, '该社交账号已绑定其他用户。', 409);
            }

            self::flow()->bind($uid, $pending['provider'], $pending['identity']);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth account binding failed: ' . $exception->getMessage());
            self::renderPendingPage($pending, $provider, '绑定失败，请稍后重试。', 500);
        }

        self::clearPending();
        self::login($uid);
        self::redirect(
            self::userUrl('social') . '?oauth=bound&provider=' . rawurlencode($pending['provider'])
        );
    }

    private static function start(string $provider): never
    {
        try {
            $url = self::flow()->authorizationUrl($provider, self::currentUid());
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth start failed: ' . $exception->getMessage());
            $url = null;
        }

        if ($url === null) {
            self::fail('oauth_disabled');
        }

        self::redirect($url);
    }

    private static function callback(string $provider): never
    {
        if (isset($_GET['error'])) {
            self::fail('oauth_denied');
        }

        $state = is_string($_GET['state'] ?? null) ? (string) $_GET['state'] : '';
        $code = is_string($_GET['code'] ?? null) ? (string) $_GET['code'] : '';
        $result = self::flow()->callback($provider, $code, $state);

        if ($result->status === CallbackResult::BOUND) {
            self::redirect(
                self::userUrl('social') . '?oauth=bound&provider=' . rawurlencode($result->provider)
            );
        }

        if ($result->status === CallbackResult::LOGIN) {
            self::login($result->boundUid);
            self::redirect(self::userUrl('profile') . '?oauth=login');
        }

        if ($result->status === CallbackResult::UNBOUND) {
            $identity = $result->identity;
            if ($identity === null) {
                self::fail('oauth_failed');
            }

            $mode = self::registerMode();
            $allowRegister = (bool) (Typecho::options()?->allowRegister ?? false);
            if ($mode !== 'auto' || !$allowRegister) {
                self::redirectToBind($identity);
            }

            $newUid = self::createUser($result->provider, $identity);
            if ($newUid <= 0) {
                self::fail('oauth_failed');
            }

            try {
                self::flow()->bind($newUid, $result->provider, $identity);
            } catch (\Throwable $exception) {
                error_log('SunkenBoat OAuth binding failed: ' . $exception->getMessage());
                self::fail('oauth_failed');
            }

            self::login($newUid);
            self::redirect(self::userUrl('profile') . '?oauth=login');
        }

        self::fail($result->error !== '' ? $result->error : 'oauth_failed');
    }

    private static function flow(): Flow
    {
        if (self::$flow !== null) {
            return self::$flow;
        }

        $values = Settings::values();
        $types = [];
        foreach (['caihong', 'zibll'] as $aggregate) {
            $prefix = self::settingPrefix($aggregate);
            $types[$aggregate] = self::aggregateTypes($values, $prefix);
        }

        $registry = ProviderRegistry::configured($types);
        $providers = [];

        foreach (array_keys($registry->all()) as $id) {
            $baseId = self::baseProviderId($id);
            $prefix = self::settingPrefix($baseId);
            $apiUrl = trim((string) ($values[$prefix . '_API_URL'] ?? ''));
            $clientId = trim((string) ($values[$prefix . '_Client_ID'] ?? ''));
            if ($baseId === 'zibll') {
                $clientId = $apiUrl;
            }

            $enabled = ($values[$prefix . '_Enabled'] ?? false) === true;
            if ($baseId === 'caihong' && $apiUrl === '') {
                $enabled = false;
            }

            $providers[$id] = [
                'enabled' => $enabled,
                'clientId' => $clientId,
                'clientSecret' => trim((string) ($values[$prefix . '_Client_Secret'] ?? '')),
                'scope' => trim((string) ($values[$prefix . '_Scope'] ?? '')),
                'apiUrl' => $apiUrl,
                'type' => $registry->variantType($id),
            ];
        }

        $index = rtrim(Typecho::indexUrl(), '/');
        if ($index === '') {
            $index = rtrim(Typecho::siteUrl(), '/');
        }

        self::$flow = new Flow(
            $registry,
            new TypechoBindingStore(),
            [
                'enabled' => ($values['OAuth_Enabled'] ?? false) === true,
                'providers' => $providers,
            ],
            $index,
            self::stateSecret(),
            new CookieStateStore()
        );

        return self::$flow;
    }

    private static function redirectToBind(Identity $identity): never
    {
        try {
            self::writePending($identity);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth pending identity failed: ' . $exception->getMessage());
            self::fail('oauth_failed');
        }

        self::redirect(self::completeUrl());
    }

    private static function writePending(Identity $identity): void
    {
        $payload = json_encode([
            'provider' => $identity->provider,
            'subject' => $identity->subject,
            'name' => $identity->name,
            'avatar' => $identity->avatar,
            'email' => $identity->email,
            'csrf' => bin2hex(random_bytes(16)),
            'expires' => time() + self::PENDING_TTL,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if (!is_string($payload)) {
            throw new \RuntimeException('Unable to encode pending OAuth identity');
        }

        $encoded = self::base64Url($payload);
        $signature = hash_hmac('sha256', $encoded, self::stateSecret());
        Typecho::setCookie(self::PENDING_COOKIE, $encoded . '.' . $signature, self::PENDING_TTL);
    }

    /**
     * @return array{provider: string, identity: Identity, csrf: string}|null
     */
    private static function readPending(): ?array
    {
        $raw = Typecho::cookie(self::PENDING_COOKIE);
        if ($raw === '' || !str_contains($raw, '.')) {
            return null;
        }

        [$encoded, $signature] = explode('.', $raw, 2);
        $expected = hash_hmac('sha256', $encoded, self::stateSecret());
        if ($signature === '' || !hash_equals($expected, $signature)) {
            return null;
        }

        $json = base64_decode(strtr($encoded, '-_', '+/'), true);
        if (!is_string($json)) {
            return null;
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }

        $provider = is_string($data['provider'] ?? null)
            ? strtolower(trim((string) $data['provider']))
            : '';
        $subject = is_string($data['subject'] ?? null) ? self::pendingSubject($data['subject']) : '';
        $csrf = is_string($data['csrf'] ?? null) ? (string) $data['csrf'] : '';
        $expires = is_numeric($data['expires'] ?? null) ? (int) $data['expires'] : 0;

        if (
            preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $provider) !== 1
            || $subject === ''
            || preg_match('/^[a-f0-9]{32}$/', $csrf) !== 1
            || $expires < time()
        ) {
            return null;
        }

        return [
            'provider' => $provider,
            'identity' => new Identity(
                $provider,
                $subject,
                self::pendingText($data['name'] ?? ''),
                self::pendingAvatar($data['avatar'] ?? ''),
                self::pendingEmail($data['email'] ?? '')
            ),
            'csrf' => $csrf,
        ];
    }

    private static function clearPending(): void
    {
        Typecho::deleteCookie(self::PENDING_COOKIE);
    }

    /**
     * @param array{provider: string, identity: Identity, csrf: string} $pending
     */
    private static function renderPendingPage(
        array $pending,
        ProviderInterface $provider,
        string $error = '',
        int $status = 200
    ): never {
        http_response_code($status);
        header('Content-Type: text/html; charset=UTF-8');
        header('Cache-Control: no-store');

        $site = Typecho::options();
        $siteTitle = is_scalar($site?->title ?? null) ? trim((string) $site->title) : '';
        $siteTitle = $siteTitle !== '' ? $siteTitle : '站点';
        $identityName = $pending['identity']->name !== ''
            ? $pending['identity']->name
            : '该社交账号';
        $action = self::completeUrl();
        $cancel = self::userUrl('social');
        $label = $provider->label();
        $errorHtml = $error !== ''
            ? '<p class="alert" role="alert">' . self::e($error) . '</p>'
            : '';

        echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>绑定账号 · ' . self::e($siteTitle) . '</title>'
            . '<style>'
            . ':root{color-scheme:light;--bg:#f5f6f7;--card:#fff;--ink:#171a21;--muted:#667085;'
            . '--line:#e4e7ec;--brand:#2563eb;--danger:#b42318}'
            . '*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;'
            . 'padding:24px;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,BlinkMacSystemFont,'
            . '"Segoe UI","Microsoft YaHei",sans-serif}.card{width:min(100%,430px);background:var(--card);'
            . 'border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 50px rgba(16,24,40,.08);padding:28px}'
            . 'h1{margin:0 0 6px;font-size:22px;line-height:1.25}.lead{margin:0 0 20px;color:var(--muted);font-size:13px}'
            . '.identity{display:flex;gap:10px;align-items:center;padding:12px;border:1px solid var(--line);'
            . 'border-radius:9px;background:#fafafa;margin-bottom:18px}.dot{width:8px;height:8px;border-radius:50%;'
            . 'background:var(--brand);flex:none}.identity strong{display:block;font-size:13px}'
            . '.identity span{display:block;color:var(--muted);font-size:12px}'
            . 'label{display:grid;gap:6px;margin-top:14px;font-size:12px;font-weight:600}'
            . 'input{width:100%;height:40px;padding:0 12px;border:1px solid var(--line);border-radius:7px;'
            . 'background:#fff;color:var(--ink);font:inherit;font-weight:400;outline:none}'
            . 'input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(37,99,235,.12)}'
            . '.alert{margin:0 0 16px;padding:10px 12px;border-radius:7px;background:#fef3f2;'
            . 'color:var(--danger);font-size:12px}.actions{display:flex;gap:10px;align-items:center;margin-top:20px}'
            . 'button,.cancel{display:inline-flex;height:40px;align-items:center;justify-content:center;'
            . 'border-radius:7px;padding:0 16px;font:inherit;font-weight:600;text-decoration:none}'
            . 'button{border:0;background:var(--brand);color:#fff;cursor:pointer;flex:1}'
            . '.cancel{color:var(--muted);border:1px solid var(--line);background:#fff}'
            . '</style></head><body><main class="card">'
            . '<h1>绑定本站账号</h1>'
            . '<p class="lead">首次使用 ' . self::e($label) . ' 登录，请验证已有账号。绑定后即可直接使用社交账号登录。</p>'
            . '<div class="identity"><span class="dot" aria-hidden="true"></span><div>'
            . '<strong>' . self::e($identityName) . '</strong>'
            . '<span>' . self::e($label) . ' · 尚未绑定</span></div></div>'
            . $errorHtml
            . '<form method="post" action="' . self::e($action) . '" autocomplete="on">'
            . '<input type="hidden" name="csrf" value="' . self::e($pending['csrf']) . '">'
            . '<label>用户名或邮箱<input name="name" type="text" maxlength="64" '
            . 'autocomplete="username" required autofocus></label>'
            . '<label>账号密码<input name="password" type="password" maxlength="128" '
            . 'autocomplete="current-password" required></label>'
            . '<div class="actions"><button type="submit">验证并绑定</button>'
            . '<a class="cancel" href="' . self::e($cancel) . '">取消</a></div>'
            . '</form></main></body></html>';

        exit;
    }

    private static function renderCompleteError(string $message, int $status): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=UTF-8');
        header('Cache-Control: no-store');

        $login = self::userUrl('social');
        echo '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>绑定失败</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;'
            . 'padding:24px;background:#f5f6f7;color:#171a21;font:14px/1.6 system-ui,-apple-system,BlinkMacSystemFont,'
            . '"Segoe UI","Microsoft YaHei",sans-serif}.card{width:min(100%,420px);padding:28px;background:#fff;'
            . 'border:1px solid #e4e7ec;border-radius:12px;box-shadow:0 18px 50px rgba(16,24,40,.08)}'
            . 'h1{margin:0 0 8px;font-size:21px}p{margin:0 0 20px;color:#667085}'
            . 'a{display:inline-flex;height:40px;align-items:center;padding:0 16px;border-radius:7px;'
            . 'background:#2563eb;color:#fff;text-decoration:none;font-weight:600}</style></head><body>'
            . '<main class="card"><h1>无法完成绑定</h1><p>' . self::e($message) . '</p>'
            . '<a href="' . self::e($login) . '">返回用户中心</a></main></body></html>';

        exit;
    }

    private static function completeUrl(): string
    {
        $index = rtrim(Typecho::indexUrl(), '/');

        return $index === '' ? '/ttdf/oauth/complete' : $index . '/ttdf/oauth/complete';
    }

    private static function pendingSubject(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim((string) preg_replace('/[\x00-\x1F\x7F]/u', '', $value));

        return substr($value, 0, 255);
    }

    private static function pendingText(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim(strip_tags($value));
        if ($value === '') {
            return '';
        }

        return function_exists('mb_substr')
            ? mb_substr($value, 0, 32, 'UTF-8')
            : substr($value, 0, 32);
    }

    private static function pendingAvatar(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        if ($value === '' || preg_match('#^https?://#i', $value) !== 1) {
            return '';
        }

        return filter_var($value, FILTER_VALIDATE_URL) === false ? '' : $value;
    }

    private static function pendingEmail(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);

        return filter_var($value, FILTER_VALIDATE_EMAIL) === false ? '' : $value;
    }

    private static function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function registerMode(): string
    {
        $values = Settings::values();
        $mode = strtolower(trim((string) ($values['OAuth_Register_Mode'] ?? '')));
        if (in_array($mode, ['bind', 'auto'], true)) {
            return $mode;
        }

        $legacy = Options::instance()->get('OAuth_Auto_Register', false);

        return ($legacy === true
            || $legacy === 1
            || $legacy === '1'
            || $legacy === 'true')
            ? 'auto'
            : 'bind';
    }

    /**
     * @param array<string, mixed> $values
     * @return list<string>
     */
    private static function aggregateTypes(array $values, string $prefix): array
    {
        $value = $values[$prefix . '_Type'] ?? [];
        if (is_string($value)) {
            $value = explode(',', $value);
        }

        if (!is_array($value)) {
            return [];
        }

        $types = [];
        foreach ($value as $type) {
            if (!is_scalar($type)) {
                continue;
            }

            $type = strtolower(trim((string) $type));
            if ($type === '' || preg_match('/^[a-z0-9_-]{1,32}$/', $type) !== 1) {
                continue;
            }

            $types[$type] = true;
        }

        return array_keys($types);
    }

    private static function baseProviderId(string $provider): string
    {
        foreach (['caihong', 'zibll'] as $base) {
            if ($provider === $base || str_starts_with($provider, $base . '-')) {
                return $base;
            }
        }

        return $provider;
    }

    private static function settingPrefix(string $provider): string
    {
        return self::SETTING_PREFIXES[$provider] ?? 'OAuth_' . ucfirst($provider);
    }

    /**
     * @param Identity $identity
     */
    private static function createUser(string $provider, Identity $identity): int
    {
        try {
            $users = new Users();
            $name = self::uniqueName($provider, $identity->name);
            $mail = $provider . '_' . substr(hash('sha256', $provider . '|' . $identity->subject), 0, 16)
                . '@' . self::mailHost();

            $created = $users->create([
                'name' => $name,
                'mail' => $mail,
                'password' => bin2hex(random_bytes(18)),
                'group' => 'subscriber',
                'screenName' => $identity->name !== '' ? $identity->name : $name,
            ]);

            return (int) ($created['uid'] ?? 0);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth registration failed: ' . $exception->getMessage());

            return 0;
        }
    }

    private static function uniqueName(string $provider, string $label): string
    {
        $base = preg_replace('/[^A-Za-z0-9_-]/', '', $label) ?? '';
        $base = trim($base, '_-');
        $base = $base === '' ? $provider : $base;
        $base = substr($base, 0, 24);
        $name = $base;
        $db = Db::get();

        for ($i = 2; $i <= 99; $i++) {
            $rows = $db->fetchAll(
                $db->select('uid')
                    ->from('table.users')
                    ->where('name = ?', $name)
                    ->limit(1)
            );

            if ($rows === []) {
                return $name;
            }

            $name = substr($base, 0, 24) . '_' . $i;
        }

        return $provider . '_' . substr(bin2hex(random_bytes(4)), 0, 8);
    }

    private static function login(int $uid): void
    {
        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('*')
                ->from('table.users')
                ->where('uid = ?', $uid)
                ->limit(1)
        );
        $user = $rows[0] ?? null;

        if (!is_array($user) || $uid <= 0) {
            self::fail('oauth_failed');
        }

        RestAuth::startCookieSession($user, 0);
        $db->query(
            $db->update('table.users')
                ->rows(['logged' => time()])
                ->where('uid = ?', $uid)
        );
    }

    private static function userUrl(string $section = 'profile'): string
    {
        $index = rtrim(Typecho::indexUrl(), '/');

        return $index . '/user/' . $section;
    }

    private static function redirect(string $url): never
    {
        if (class_exists('Typecho\\Response')) {
            $response = \Typecho\Response::getInstance();
            $response->setStatus(302);
            $response->setHeader('Location', $url);
            $response->respond();
        }

        header('Location: ' . $url, true, 302);
        exit;
    }

    private static function fail(string $code): never
    {
        self::redirect(self::userUrl('social') . '?oauth_error=' . rawurlencode($code));
    }

    private static function stateSecret(): string
    {
        $options = Typecho::options();
        $secret = is_scalar($options?->secret ?? null) ? (string) $options->secret : '';
        $site = Typecho::siteUrl();
        $index = Typecho::indexUrl();

        return hash('sha256', $secret . '|' . $site . '|' . $index . '|ttdf-oauth');
    }

    private static function mailHost(): string
    {
        $host = (string) parse_url(Typecho::siteUrl(), PHP_URL_HOST);

        return $host !== '' ? $host : 'oauth.local';
    }

    private static function currentUid(): int
    {
        if (!class_exists('Widget\\User')) {
            return 0;
        }

        try {
            return (int) \Widget\User::alloc()->uid;
        } catch (\Throwable) {
            return 0;
        }
    }
}
