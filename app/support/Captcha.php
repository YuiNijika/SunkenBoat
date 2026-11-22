<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Human verification for login, registration, comments and check-in.
 *
 * Built-in challenges are stored in the global options table as short-lived
 * hashed records. Cloud providers are verified server-to-server over HTTPS;
 * the browser can only submit a ticket, never a "verified" boolean.
 */
final class Captcha
{
    private const STORE_PREFIX = 'sunken_cap_';

    private const RATE_PREFIX = 'sunken_caprl_';

    private const PROVIDERS = ['math', 'slider', 'geetest', 'tencent', 'aliyun'];

    private const SCENES = ['login', 'register', 'comment', 'checkin'];

    public static function register(): void
    {
        Endpoint::register('captcha-challenge', [self::class, 'handleChallenge'], [
            'auth' => 'public',
            'method' => 'GET',
            'nonce' => false,
            'same_origin' => false,
        ]);

        Hooks::addFilter('rest.v2.login.decision', [self::class, 'loginDecision'], 20);
        Hooks::addFilter('rest.v2.register.validate', [self::class, 'registerValidate'], 20);
        Hooks::addFilter('rest.v2.comment.can_create', [self::class, 'commentValidate'], 20);
    }

    public static function enabled(): bool
    {
        return (Settings::values()['Captcha_Enabled'] ?? false) === true;
    }

    public static function provider(): string
    {
        $provider = (string) (Settings::values()['Captcha_Provider'] ?? 'math');

        return in_array($provider, self::PROVIDERS, true) ? $provider : 'math';
    }

    public static function sceneEnabled(string $scene): bool
    {
        if (!self::enabled() || !in_array($scene, self::SCENES, true)) {
            return false;
        }
        $scenes = Settings::values()['Captcha_Scenes'] ?? [];
        if (!is_array($scenes)) {
            return false;
        }

        return in_array($scene, array_map('strval', $scenes), true);
    }

    /**
     * @return array<string, mixed>
     */
    public static function client(): array
    {
        $values = Settings::values();
        $provider = self::provider();

        return [
            'enabled' => self::enabled(),
            'provider' => $provider,
            'scenes' => array_values(array_filter(
                self::SCENES,
                static fn (string $scene): bool => self::sceneEnabled($scene)
            )),
            'challenge' => Endpoint::url('captcha-challenge'),
            'geetestId' => $provider === 'geetest' ? trim((string) ($values['Captcha_Geetest_Id'] ?? '')) : '',
            'tencentAppId' => $provider === 'tencent' ? trim((string) ($values['Captcha_Tencent_AppId'] ?? '')) : '',
            'aliyunAppKey' => $provider === 'aliyun' ? trim((string) ($values['Captcha_Aliyun_AppKey'] ?? '')) : '',
            'aliyunScene' => $provider === 'aliyun' ? trim((string) ($values['Captcha_Aliyun_Scene'] ?? 'nc')) : '',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function handleChallenge(array $data): array
    {
        unset($data);
        if (!self::enabled()) {
            Response::error('验证码服务未开启', 403);
        }
        if (self::provider() === 'slider') {
            return ['challenge' => self::issue('slider')];
        }
        if (self::provider() !== 'math') {
            return ['challenge' => null, 'provider' => self::provider()];
        }

        return ['challenge' => self::issue('math')];
    }

    /**
     * @param array<string, mixed> $input
     */
    public static function require(array $input, string $scene): void
    {
        if (!self::sceneEnabled($scene)) {
            return;
        }
        if (!self::verify($input, $scene)) {
            Response::error('人机验证失败，请刷新后重试', 422, [
                'code' => '验证码错误或已过期',
            ]);
        }
    }

    /**
     * @param mixed $decision
     * @param mixed $user
     * @param array<string, mixed> $body
     */
    public static function loginDecision(mixed $decision, mixed $user, array $body): mixed
    {
        if ($decision !== null || !is_array($user)) {
            return $decision;
        }
        self::require($body, 'login');

        return null;
    }

    /**
     * @param mixed $allowed
     * @param array<string, mixed> $input
     */
    public static function registerValidate(mixed $allowed, array $input): mixed
    {
        if ($allowed !== true) {
            return false;
        }
        self::require($input, 'register');

        return true;
    }

    /**
     * @param mixed $allowed
     * @param mixed $content
     * @param array<string, mixed> $input
     * @param mixed $identity
     */
    public static function commentValidate(mixed $allowed, mixed $content, array $input, mixed $identity): mixed
    {
        unset($content, $identity);
        if ($allowed !== true) {
            return false;
        }
        self::require($input, 'comment');

        return true;
    }

    /**
     * @param array<string, mixed> $input
     */
    public static function verify(array $input, string $scene): bool
    {
        if (!self::enabled() || !self::sceneEnabled($scene)) {
            return true;
        }

        $data = $input['captcha'] ?? null;
        if (!is_array($data)) {
            $data = [
                'id' => $input['captchaId'] ?? '',
                'answer' => $input['captchaAnswer'] ?? '',
                'ticket' => $input['captchaTicket'] ?? null,
            ];
        }
        $provider = self::provider();
        if ($provider === 'math' || $provider === 'slider') {
            return self::verifyBuiltin($data, $provider, $scene);
        }

        return self::verifyCloud($provider, $data['ticket'] ?? null);
    }

    /**
     * @return array<string, mixed>
     */
    private static function issue(string $provider): array
    {
        $retry = self::issuanceRetryAfter();
        if ($retry > 0) {
            Response::error('请求过于频繁，请稍后再试', 429, [
                'code' => '请 ' . $retry . ' 秒后刷新验证码',
            ]);
        }
        self::recordIssuance();

        $id = bin2hex(random_bytes(8));
        $now = time();
        $record = [
            'provider' => $provider,
            'created' => $now,
            'tries' => 0,
        ];
        if ($provider === 'slider') {
            $scene = self::sliderScene();
            $pieceX = random_int(92, 222);
            $pieceY = random_int(18, 100);
            $record['target'] = round($pieceX / 320 * 100, 2);
            $payload = [
                'id' => $id,
                'provider' => 'slider',
                'image' => self::svgDataUrl(self::sliderSvg($scene, $pieceX, $pieceY, true)),
                'piece' => self::svgDataUrl(self::sliderSvg($scene, $pieceX, $pieceY, false)),
                'pieceTop' => round($pieceY / 160 * 100, 2),
                'pieceWidth' => round(55 / 320 * 100, 2),
                'expiresIn' => self::ttl(),
            ];
        } else {
            $left = random_int(2, 19);
            $right = random_int(2, 19);
            $record['answer'] = hash('sha256', (string) ($left + $right));
            $payload = [
                'id' => $id,
                'provider' => 'math',
                'question' => $left . ' + ' . $right . ' = ?',
                'expiresIn' => self::ttl(),
            ];
        }

        self::writeRecord($id, $record);

        return $payload;
    }

    /**
     * Build one of the built-in scenic palettes. The scene is rendered as SVG
     * so the theme does not depend on GD, Imagick or remote image hosts.
     *
     * @return array<string, mixed>
     */
    private static function sliderScene(): array
    {
        $palettes = [
            [
                'sky' => ['#dff1fb', '#7eb7d8'],
                'sun' => '#ffe6a3',
                'glow' => '#fff8dc',
                'far' => '#7198b1',
                'near' => '#31576c',
                'water' => ['#a9d1df', '#3c7088'],
                'line' => '#eaf7ff',
            ],
            [
                'sky' => ['#f8d7bf', '#8ea8cd'],
                'sun' => '#ffcf7a',
                'glow' => '#fff0c8',
                'far' => '#6d7797',
                'near' => '#343f62',
                'water' => ['#b7b7d1', '#4a557e'],
                'line' => '#ffead8',
            ],
            [
                'sky' => ['#17233f', '#456283'],
                'sun' => '#f4e7b2',
                'glow' => '#d8e8ff',
                'far' => '#2f4962',
                'near' => '#162737',
                'water' => ['#35516b', '#142839'],
                'line' => '#b9d8ef',
            ],
            [
                'sky' => ['#f4e3c1', '#b6c9a8'],
                'sun' => '#ffd36a',
                'glow' => '#fff4ca',
                'far' => '#6f8c76',
                'near' => '#315445',
                'water' => ['#b4cfb5', '#4c7562'],
                'line' => '#f7f2d7',
            ],
        ];

        return [
            'palette' => $palettes[random_int(0, count($palettes) - 1)],
            'sunX' => random_int(54, 264),
            'sunY' => random_int(24, 52),
            'cloudX' => random_int(8, 160),
            'cloudY' => random_int(18, 48),
            'bird' => random_int(190, 292),
            'wave' => random_int(112, 132),
        ];
    }

    /**
     * Render the slider background (with the missing-piece slot) or a cropped
     * puzzle piece. The target position never leaves the server.
     *
     * @param array<string, mixed> $scene
     */
    private static function sliderSvg(array $scene, int $pieceX, int $pieceY, bool $withSlot): string
    {
        $palette = is_array($scene['palette'] ?? null) ? $scene['palette'] : [];
        $skyTop = (string) ($palette['sky'][0] ?? '#dff1fb');
        $skyBottom = (string) ($palette['sky'][1] ?? '#7eb7d8');
        $sun = (string) ($palette['sun'] ?? '#ffe6a3');
        $glow = (string) ($palette['glow'] ?? '#fff8dc');
        $far = (string) ($palette['far'] ?? '#7198b1');
        $near = (string) ($palette['near'] ?? '#31576c');
        $waterTop = (string) ($palette['water'][0] ?? '#a9d1df');
        $waterBottom = (string) ($palette['water'][1] ?? '#3c7088');
        $line = (string) ($palette['line'] ?? '#eaf7ff');
        $sunX = (int) ($scene['sunX'] ?? 160);
        $sunY = (int) ($scene['sunY'] ?? 40);
        $cloudX = (int) ($scene['cloudX'] ?? 40);
        $cloudY = (int) ($scene['cloudY'] ?? 30);
        $bird = (int) ($scene['bird'] ?? 230);
        $wave = (int) ($scene['wave'] ?? 120);
        $maskX = $pieceX;
        $maskY = $pieceY;

        $defs = '<defs>'
            . '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
            . '<stop offset="0" stop-color="' . $skyTop . '"/>'
            . '<stop offset="1" stop-color="' . $skyBottom . '"/>'
            . '</linearGradient>'
            . '<linearGradient id="water" x1="0" y1="0" x2="0" y2="1">'
            . '<stop offset="0" stop-color="' . $waterTop . '"/>'
            . '<stop offset="1" stop-color="' . $waterBottom . '"/>'
            . '</linearGradient>'
            . '<radialGradient id="sunGlow">'
            . '<stop offset="0" stop-color="' . $glow . '" stop-opacity=".95"/>'
            . '<stop offset="1" stop-color="' . $glow . '" stop-opacity="0"/>'
            . '</radialGradient>'
            . '<mask id="pieceMask" maskUnits="userSpaceOnUse" x="' . $maskX . '" y="' . $maskY . '" width="55" height="48">'
            . '<rect x="' . $maskX . '" y="' . $maskY . '" width="48" height="48" rx="11" fill="#fff"/>'
            . '<circle cx="' . ($maskX + 48) . '" cy="' . ($maskY + 24) . '" r="7" fill="#fff"/>'
            . '</mask>'
            . '</defs>';

        $body = '<rect width="320" height="160" fill="url(#sky)"/>'
            . '<circle cx="' . $sunX . '" cy="' . $sunY . '" r="38" fill="url(#sunGlow)"/>'
            . '<circle cx="' . $sunX . '" cy="' . $sunY . '" r="12" fill="' . $sun . '"/>'
            . '<g fill="#fff" opacity=".42">'
            . '<ellipse cx="' . $cloudX . '" cy="' . $cloudY . '" rx="34" ry="7"/>'
            . '<ellipse cx="' . ($cloudX + 24) . '" cy="' . ($cloudY + 5) . '" rx="22" ry="5"/>'
            . '<ellipse cx="' . ($cloudX + 230) . '" cy="' . ($cloudY + 17) . '" rx="28" ry="6"/>'
            . '</g>'
            . '<path d="M0 116 L38 78 L70 101 L108 68 L144 102 L182 74 L220 101 L256 71 L292 100 L320 84 L320 160 L0 160 Z" fill="' . $far . '" opacity=".86"/>'
            . '<path d="M0 139 L48 108 L84 128 L122 97 L160 125 L198 102 L236 130 L274 105 L320 125 L320 160 L0 160 Z" fill="' . $near . '"/>'
            . '<rect y="' . $wave . '" width="320" height="' . (160 - $wave) . '" fill="url(#water)"/>'
            . '<g fill="none" stroke="' . $line . '" stroke-linecap="round" opacity=".3">'
            . '<path d="M18 138 H76"/><path d="M96 146 H166"/><path d="M188 136 H250"/>'
            . '<path d="M42 151 H92"/><path d="M226 152 H292"/>'
            . '</g>'
            . '<path d="M' . $bird . ' 48 q5 -5 10 0 q-5 -2 -10 0" fill="none" stroke="' . $near . '" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>';

        if ($withSlot) {
            $body .= '<g mask="url(#pieceMask)">'
                . '<rect x="' . $maskX . '" y="' . $maskY . '" width="55" height="48" fill="#07111f" fill-opacity=".56"/>'
                . '</g>'
                . '<rect x="' . ($maskX + 0.75) . '" y="' . ($maskY + 0.75) . '" width="46.5" height="46.5" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.5"/>'
                . '<circle cx="' . ($maskX + 48) . '" cy="' . ($maskY + 24) . '" r="6.25" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.5"/>';
            $viewBox = '0 0 320 160';
            $size = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="' . $viewBox . '">';
        } else {
            $body = '<g mask="url(#pieceMask)">' . $body . '</g>'
                . '<rect x="' . ($maskX + 0.75) . '" y="' . ($maskY + 0.75) . '" width="46.5" height="46.5" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>'
                . '<circle cx="' . ($maskX + 48) . '" cy="' . ($maskY + 24) . '" r="6.25" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>';
            $viewBox = $maskX . ' ' . $maskY . ' 55 48';
            $size = '<svg xmlns="http://www.w3.org/2000/svg" width="55" height="48" viewBox="' . $viewBox . '">';
        }

        return $size . $defs . $body . '</svg>';
    }

    private static function svgDataUrl(string $svg): string
    {
        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /**
     * @param array<string, mixed> $data
     */
    private static function verifyBuiltin(array $data, string $provider, string $scene): bool
    {
        $id = (string) ($data['id'] ?? '');
        if (preg_match('/^[a-f0-9]{16}$/D', $id) !== 1) {
            return false;
        }
        $record = self::readRecord($id);
        if ($record === null || (string) ($record['provider'] ?? '') !== $provider) {
            return false;
        }
        $created = (int) ($record['created'] ?? 0);
        $tries = (int) ($record['tries'] ?? 0) + 1;
        if ($created <= 0 || $created + self::ttl() < time() || $tries > self::maxTries()) {
            self::deleteRecord($id);

            return false;
        }

        $answer = $data['answer'] ?? '';
        $valid = false;
        if ($provider === 'math') {
            $answer = is_scalar($answer) ? trim((string) $answer) : '';
            $valid = preg_match('/^\d{1,3}$/D', $answer) === 1
                && hash_equals((string) ($record['answer'] ?? ''), hash('sha256', $answer));
        } else {
            $position = is_numeric($answer) ? (float) $answer : -1.0;
            $target = (float) ($record['target'] ?? -1.0);
            $valid = $position >= 0.0
                && $position <= 100.0
                && $target >= 0.0
                && abs($position - $target) <= 4.0;
        }

        if ($valid) {
            self::deleteRecord($id);

            return true;
        }

        $record['tries'] = $tries;
        self::writeRecord($id, $record, true);
        if ($tries >= self::maxTries()) {
            self::deleteRecord($id);
        }

        return false;
    }

    private static function verifyCloud(string $provider, mixed $ticket): bool
    {
        if (!is_array($ticket)) {
            return false;
        }
        $values = Settings::values();

        return match ($provider) {
            'geetest' => self::verifyGeetest($ticket, $values),
            'tencent' => self::verifyTencent($ticket, $values),
            'aliyun' => self::verifyAliyun($ticket, $values),
            default => false,
        };
    }

    /**
     * @param array<string, mixed> $ticket
     * @param array<string, mixed> $values
     */
    private static function verifyGeetest(array $ticket, array $values): bool
    {
        $id = trim((string) ($values['Captcha_Geetest_Id'] ?? ''));
        $key = trim((string) ($values['Captcha_Geetest_Key'] ?? ''));
        $lot = self::ticketString($ticket, 'lot_number', 128);
        $output = self::ticketString($ticket, 'captcha_output', 512);
        $pass = self::ticketString($ticket, 'pass_token', 512);
        $genTime = self::ticketString($ticket, 'gen_time', 32);
        if ($id === '' || $key === '' || $lot === '' || $output === '' || $pass === '' || $genTime === '') {
            return false;
        }

        $body = http_build_query([
            'lot_number' => $lot,
            'captcha_output' => $output,
            'pass_token' => $pass,
            'gen_time' => $genTime,
            'sign_token' => hash_hmac('sha256', $lot, $key),
        ], '', '&', PHP_QUERY_RFC3986);
        $response = self::post(
            'https://gcaptcha4.geetest.com/validate?' . http_build_query(['captcha_id' => $id]),
            $body,
            ['Content-Type: application/x-www-form-urlencoded']
        );

        return is_array($response)
            && (string) ($response['result'] ?? '') === 'success';
    }

    /**
     * @param array<string, mixed> $ticket
     * @param array<string, mixed> $values
     */
    private static function verifyTencent(array $ticket, array $values): bool
    {
        $appId = trim((string) ($values['Captcha_Tencent_AppId'] ?? ''));
        $appSecret = trim((string) ($values['Captcha_Tencent_App_Secret'] ?? ''));
        $secretId = trim((string) ($values['Captcha_Tencent_Secret_Id'] ?? ''));
        $secretKey = trim((string) ($values['Captcha_Tencent_Secret_Key'] ?? ''));
        $type = max(1, min(30, (int) ($values['Captcha_Tencent_Type'] ?? 9)));
        $ticketValue = self::ticketString($ticket, 'ticket', 512);
        $randstr = self::ticketString($ticket, 'randstr', 128);
        if ($appId === '' || $appSecret === '' || $secretId === '' || $secretKey === '' || $ticketValue === '' || $randstr === '') {
            return false;
        }

        $host = 'captcha.tencentcloudapi.com';
        $service = 'captcha';
        $action = 'DescribeCaptchaResult';
        $version = '2019-07-22';
        $region = 'ap-guangzhou';
        $payload = json_encode([
            'CaptchaType' => $type,
            'CaptchaAppId' => (int) $appId,
            'AppSecretKey' => $appSecret,
            'Ticket' => $ticketValue,
            'Randstr' => $randstr,
            'UserIp' => self::ip(),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if (!is_string($payload)) {
            return false;
        }

        $timestamp = time();
        $date = gmdate('Y-m-d', $timestamp);
        $scope = $date . '/' . $service . '/tc3_request';
        $canonical = "POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:" . $host
            . "\n\ncontent-type;host\n" . hash('sha256', $payload);
        $toSign = "TC3-HMAC-SHA256\n" . $timestamp . "\n" . $scope . "\n" . hash('sha256', $canonical);
        $secretDate = hash_hmac('sha256', $date, 'TC3' . $secretKey, true);
        $secretService = hash_hmac('sha256', $service, $secretDate, true);
        $secretScope = hash_hmac('sha256', 'tc3_request', $secretService, true);
        $signature = hash_hmac('sha256', $toSign, $secretScope);
        $authorization = 'TC3-HMAC-SHA256 Credential=' . $secretId . '/' . $scope
            . ', SignedHeaders=content-type;host, Signature=' . $signature;

        $response = self::postJson('https://' . $host, $payload, [
            'Authorization: ' . $authorization,
            'Content-Type: application/json; charset=utf-8',
            'Host: ' . $host,
            'X-TC-Action: ' . $action,
            'X-TC-Timestamp: ' . $timestamp,
            'X-TC-Version: ' . $version,
            'X-TC-Region: ' . $region,
        ]);

        return is_array($response)
            && (int) ($response['Response']['CaptchaCode'] ?? 0) === 1;
    }

    /**
     * @param array<string, mixed> $ticket
     * @param array<string, mixed> $values
     */
    private static function verifyAliyun(array $ticket, array $values): bool
    {
        $appKey = trim((string) ($values['Captcha_Aliyun_AppKey'] ?? ''));
        $accessId = trim((string) ($values['Captcha_Aliyun_Access_Id'] ?? ''));
        $secret = trim((string) ($values['Captcha_Aliyun_Access_Secret'] ?? ''));
        $scene = trim((string) ($values['Captcha_Aliyun_Scene'] ?? 'nc'));
        $session = self::ticketString($ticket, 'sessionId', 128);
        $sig = self::ticketString($ticket, 'sig', 512);
        $token = self::ticketString($ticket, 'token', 512);
        if ($appKey === '' || $accessId === '' || $secret === '' || $scene === '' || $session === '' || $sig === '' || $token === '') {
            return false;
        }

        $params = [
            'Action' => 'AuthenticateSig',
            'Version' => '2018-01-12',
            'Format' => 'JSON',
            'SignatureMethod' => 'HMAC-SHA1',
            'SignatureVersion' => '1.0',
            'AccessKeyId' => $accessId,
            'Timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
            'SignatureNonce' => bin2hex(random_bytes(12)),
            'SessionId' => $session,
            'Scene' => $scene,
            'Sig' => $sig,
            'Token' => $token,
            'AppKey' => $appKey,
            'RemoteIp' => self::ip(),
        ];
        ksort($params, SORT_STRING);
        $canonical = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
        $toSign = 'POST&%2F&' . rawurlencode($canonical);
        $params['Signature'] = base64_encode(hash_hmac('sha1', $toSign, $secret . '&', true));
        $response = self::postJson(
            'https://afs.aliyuncs.com/',
            http_build_query($params, '', '&', PHP_QUERY_RFC3986),
            ['Content-Type: application/x-www-form-urlencoded']
        );

        return is_array($response)
            && in_array((string) ($response['Code'] ?? ''), ['100', '200'], true);
    }

    /**
     * @param array<string, mixed> $ticket
     */
    private static function ticketString(array $ticket, string $key, int $max): string
    {
        $value = $ticket[$key] ?? '';

        return is_scalar($value) ? mb_substr(trim((string) $value), 0, $max, 'UTF-8') : '';
    }

    /**
     * @param list<string> $headers
     * @return array<string, mixed>|null
     */
    private static function post(string $url, string $body, array $headers): ?array
    {
        return self::request($url, 'POST', $body, $headers);
    }

    /**
     * @param list<string> $headers
     * @return array<string, mixed>|null
     */
    private static function postJson(string $url, string $body, array $headers): ?array
    {
        return self::request($url, 'POST', $body, $headers);
    }

    /**
     * @param list<string> $headers
     * @return array<string, mixed>|null
     */
    private static function request(string $url, string $method, string $body, array $headers): ?array
    {
        $parts = parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            return null;
        }

        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            if ($curl === false) {
                return null;
            }
            curl_setopt_array($curl, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => $method === 'POST',
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_CONNECTTIMEOUT => 4,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_SSL_VERIFYHOST => 2,
            ]);
            $raw = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            curl_close($curl);
            if (!is_string($raw) || $status < 200 || $status >= 300) {
                return null;
            }
        } else {
            $context = stream_context_create([
                'http' => [
                    'method' => $method,
                    'header' => implode("\r\n", $headers),
                    'content' => $body,
                    'timeout' => 8,
                    'follow_location' => 0,
                    'ignore_errors' => false,
                ],
                'ssl' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                ],
            ]);
            $raw = @file_get_contents($url, false, $context);
            if (!is_string($raw)) {
                return null;
            }
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    private static function ttl(): int
    {
        return max(60, min(1800, (int) (Settings::values()['Captcha_Expire'] ?? 300)));
    }

    private static function maxTries(): int
    {
        return max(1, min(10, (int) (Settings::values()['Captcha_Max_Tries'] ?? 5)));
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readRecord(string $id): ?array
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('value')
                    ->from('table.options')
                    ->where('name = ?', self::STORE_PREFIX . $id)
                    ->where('user = ?', 0)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }
        if (!is_array($row) || !is_string($row['value'] ?? null)) {
            return null;
        }
        $decoded = json_decode((string) $row['value'], true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * @param array<string, mixed> $record
     */
    private static function writeRecord(string $id, array $record, bool $exists = false): void
    {
        try {
            $db = Db::get();
            $value = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if (!is_string($value)) {
                return;
            }
            if ($exists) {
                $db->query(
                    $db->update('table.options')
                        ->rows(['value' => $value])
                        ->where('name = ?', self::STORE_PREFIX . $id)
                        ->where('user = ?', 0)
                );

                return;
            }
            $db->query($db->insert('table.options')->rows([
                'name' => self::STORE_PREFIX . $id,
                'user' => 0,
                'value' => $value,
            ]));
        } catch (\Throwable) {
            // Captcha storage failures must not leak internals to the browser.
        }
    }

    private static function deleteRecord(string $id): void
    {
        try {
            $db = Db::get();
            $db->query(
                $db->delete('table.options')
                    ->where('name = ?', self::STORE_PREFIX . $id)
                    ->where('user = ?', 0)
            );
        } catch (\Throwable) {
            // Ignore cleanup failures.
        }
    }

    private static function issuanceRetryAfter(): int
    {
        $record = self::readIssuance();
        $started = (int) ($record['started'] ?? 0);
        $count = (int) ($record['count'] ?? 0);
        if ($started <= 0 || $started + 600 <= time()) {
            return 0;
        }

        return $count >= 40 ? max(1, $started + 600 - time()) : 0;
    }

    private static function recordIssuance(): void
    {
        $record = self::readIssuance();
        $now = time();
        $started = (int) ($record['started'] ?? 0);
        $count = $started + 600 > $now ? (int) ($record['count'] ?? 0) : 0;
        $exists = $record !== null;
        try {
            $db = Db::get();
            $value = json_encode(['started' => $count === 0 ? $now : $started, 'count' => $count + 1]);
            if (!is_string($value)) {
                return;
            }
            if ($exists) {
                $db->query(
                    $db->update('table.options')
                        ->rows(['value' => $value])
                        ->where('name = ?', self::rateKey())
                        ->where('user = ?', 0)
                );

                return;
            }
            $db->query($db->insert('table.options')->rows([
                'name' => self::rateKey(),
                'user' => 0,
                'value' => $value,
            ]));
        } catch (\Throwable) {
            // Ignore rate-limit storage failures.
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function readIssuance(): ?array
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('value')
                    ->from('table.options')
                    ->where('name = ?', self::rateKey())
                    ->where('user = ?', 0)
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }
        if (!is_array($row) || !is_string($row['value'] ?? null)) {
            return null;
        }
        $decoded = json_decode((string) $row['value'], true);

        return is_array($decoded) ? $decoded : null;
    }

    private static function rateKey(): string
    {
        return self::RATE_PREFIX . substr(hash('sha256', self::ip()), 0, 16);
    }

    private static function ip(): string
    {
        $ip = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));

        return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : '0.0.0.0';
    }
}
