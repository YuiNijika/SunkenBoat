<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Theme\Media;
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

    private const PROVIDERS = ['math', 'slider', 'image_text', 'image_select', 'geetest', 'tencent', 'aliyun'];

    private const BUILTIN = ['math', 'slider', 'image_text', 'image_select'];

    private const SCENES = ['login', 'register', 'comment', 'checkin'];

    private const SELECT_SOURCES = ['builtin', 'custom'];

    /** @var array<string, string> */
    private const IMAGE_CHARSETS = [
        'alnum' => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
        'letters' => 'ABCDEFGHJKLMNPQRSTUVWXYZ',
        'digits' => '23456789',
    ];

    /** @var array<string, string> */
    private const SHAPES = [
        'circle' => '圆形',
        'triangle' => '三角形',
        'square' => '正方形',
        'star' => '星形',
        'diamond' => '菱形',
        'hexagon' => '六边形',
    ];

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
        $provider = self::provider();
        if (!in_array($provider, self::BUILTIN, true)) {
            return ['challenge' => null, 'provider' => $provider];
        }

        return ['challenge' => self::issue($provider)];
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
        if (in_array($provider, self::BUILTIN, true)) {
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
            $pieceWidth = random_int(48, 62);
            $pieceHeight = 48;
            $pieceX = random_int(72, 320 - $pieceWidth - 6);
            $pieceY = random_int(18, 160 - $pieceHeight - 10);
            $record['target'] = round($pieceX / 320 * 100, 2);
            $payload = [
                'id' => $id,
                'provider' => 'slider',
                'image' => self::svgDataUrl(self::sliderSvg($scene, $pieceX, $pieceY, $pieceWidth, $pieceHeight, true)),
                'piece' => self::svgDataUrl(self::sliderSvg($scene, $pieceX, $pieceY, $pieceWidth, $pieceHeight, false)),
                'pieceTop' => round($pieceY / 160 * 100, 2),
                'pieceWidth' => round($pieceWidth / 320 * 100, 2),
                'expiresIn' => self::ttl(),
            ];
        } elseif ($provider === 'image_text') {
            $charset = self::imageCharset();
            $length = self::imageLength();
            $code = '';
            $seedMax = strlen($charset) - 1;
            for ($index = 0; $index < $length; $index++) {
                $code .= $charset[random_int(0, $seedMax)];
            }
            $record['answer'] = hash('sha256', self::normalizeText($code));
            $payload = [
                'id' => $id,
                'provider' => 'image_text',
                'prompt' => '请输入图片中的字符（不区分大小写）',
                'image' => self::svgDataUrl(self::imageTextSvg($code, self::imageNoise())),
                'length' => $length,
                'expiresIn' => self::ttl(),
            ];
        } elseif ($provider === 'image_select') {
            $groups = self::selectSource() === 'custom' ? self::customSelectGroups() : [];
            $customImages = [];
            foreach ($groups as $urls) {
                foreach ($urls as $image) {
                    $customImages[] = $image;
                }
            }
            $customImages = array_values(array_unique($customImages));
            if (count($customImages) >= 2) {
                $labels = array_keys($groups);
                $semantic = count($labels) >= 2;
                $count = min(self::selectCount(), count($customImages));
                if ($semantic) {
                    $targetLabel = $labels[random_int(0, count($labels) - 1)];
                    $pool = $groups[$targetLabel];
                    $targetImage = $pool[random_int(0, count($pool) - 1)];
                    $decoys = [];
                    foreach ($groups as $label => $urls) {
                        if ($label === $targetLabel) {
                            continue;
                        }
                        foreach ($urls as $image) {
                            $decoys[] = $image;
                        }
                    }
                    $decoys = array_values(array_unique($decoys));
                    self::shuffleList($decoys);
                    $count = min($count, count($decoys) + 1);
                    $images = array_merge([$targetImage], array_slice($decoys, 0, $count - 1));
                } else {
                    $targetImage = $customImages[random_int(0, count($customImages) - 1)];
                    $decoys = array_values(array_filter(
                        $customImages,
                        static fn (string $image): bool => $image !== $targetImage
                    ));
                    self::shuffleList($decoys);
                    $images = array_merge([$targetImage], array_slice($decoys, 0, $count - 1));
                }
                self::shuffleList($images);
                $options = [];
                $used = [];
                $correctId = '';
                foreach ($images as $image) {
                    do {
                        $optionId = bin2hex(random_bytes(4));
                    } while (isset($used[$optionId]));
                    $used[$optionId] = true;
                    $options[] = [
                        'id' => $optionId,
                        'image' => $image,
                    ];
                    if ($image === $targetImage) {
                        $correctId = $optionId;
                    }
                }
                $record['answer'] = hash('sha256', $correctId);
                $payload = [
                    'id' => $id,
                    'provider' => 'image_select',
                    'source' => 'custom',
                    'prompt' => $semantic
                        ? '请选择包含「' . $targetLabel . '」的图片'
                        : '请选择与示例完全相同的图片',
                    'target' => $semantic ? null : $targetImage,
                    'options' => $options,
                    'expiresIn' => self::ttl(),
                ];
            } else {
                $count = self::selectCount();
                $shapes = array_keys(self::SHAPES);
                $target = $shapes[random_int(0, count($shapes) - 1)];
                $decoys = array_values(array_filter(
                    $shapes,
                    static fn (string $shape): bool => $shape !== $target
                ));
                $correctIndex = random_int(0, $count - 1);
                $options = [];
                $used = [];
                $correctId = '';
                for ($index = 0; $index < $count; $index++) {
                    do {
                        $optionId = bin2hex(random_bytes(4));
                    } while (isset($used[$optionId]));
                    $used[$optionId] = true;
                    $shape = $index === $correctIndex
                        ? $target
                        : $decoys[random_int(0, count($decoys) - 1)];
                    $options[] = [
                        'id' => $optionId,
                        'image' => self::svgDataUrl(self::shapeCardSvg($shape)),
                    ];
                    if ($index === $correctIndex) {
                        $correctId = $optionId;
                    }
                }
                $record['answer'] = hash('sha256', $correctId);
                $payload = [
                    'id' => $id,
                    'provider' => 'image_select',
                    'source' => 'builtin',
                    'prompt' => '请选择包含「' . self::SHAPES[$target] . '」的图片',
                    'options' => $options,
                    'expiresIn' => self::ttl(),
                ];
            }
        } else {
            [$left, $right, $symbol, $result] = self::mathQuestion();
            $record['answer'] = hash('sha256', (string) $result);
            $payload = [
                'id' => $id,
                'provider' => 'math',
                'question' => $left . ' ' . $symbol . ' ' . $right . ' = ?',
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
    private static function sliderSvg(
        array $scene,
        int $pieceX,
        int $pieceY,
        int $pieceWidth,
        int $pieceHeight,
        bool $withSlot
    ): string
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
        $bodyW = max(40, $pieceWidth - 7);
        $bodyH = $pieceHeight;
        $knobX = $maskX + $bodyW;
        $knobY = round($maskY + $bodyH / 2, 2);

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
            . '<mask id="pieceMask" maskUnits="userSpaceOnUse" x="' . $maskX . '" y="' . $maskY . '" width="' . $pieceWidth . '" height="' . $pieceHeight . '">'
            . '<rect x="' . $maskX . '" y="' . $maskY . '" width="' . $bodyW . '" height="' . $bodyH . '" rx="11" fill="#fff"/>'
            . '<circle cx="' . $knobX . '" cy="' . $knobY . '" r="7" fill="#fff"/>'
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
                . '<rect x="' . $maskX . '" y="' . $maskY . '" width="' . $pieceWidth . '" height="' . $pieceHeight . '" fill="#07111f" fill-opacity=".56"/>'
                . '</g>'
                . '<rect x="' . ($maskX + 0.75) . '" y="' . ($maskY + 0.75) . '" width="' . ($bodyW - 1.5) . '" height="' . ($bodyH - 1.5) . '" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.5"/>'
                . '<circle cx="' . $knobX . '" cy="' . $knobY . '" r="6.25" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.5"/>';
            $viewBox = '0 0 320 160';
            $size = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="' . $viewBox . '">';
        } else {
            $body = '<g mask="url(#pieceMask)">' . $body . '</g>'
                . '<rect x="' . ($maskX + 0.75) . '" y="' . ($maskY + 0.75) . '" width="' . ($bodyW - 1.5) . '" height="' . ($bodyH - 1.5) . '" rx="10.5" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>'
                . '<circle cx="' . $knobX . '" cy="' . $knobY . '" r="6.25" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>';
            $viewBox = $maskX . ' ' . $maskY . ' ' . $pieceWidth . ' ' . $pieceHeight;
            $size = '<svg xmlns="http://www.w3.org/2000/svg" width="' . $pieceWidth . '" height="' . $pieceHeight . '" viewBox="' . $viewBox . '">';
        }

        return $size . $defs . $body . '</svg>';
    }

    private static function svgDataUrl(string $svg): string
    {
        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /**
     * Render a noisy character captcha. Every glyph comes from the server-side
     * charset, so no user supplied text or markup ever reaches the SVG.
     */
    private static function imageTextSvg(string $code, int $noise): string
    {
        $palettes = [
            ['#eef2ff', '#c7d2fe'],
            ['#fef2f2', '#fecaca'],
            ['#f0fdf4', '#bbf7d0'],
            ['#fff7ed', '#fed7aa'],
            ['#f8fafc', '#cbd5e1'],
            ['#faf5ff', '#e9d5ff'],
        ];
        $inks = ['#1e293b', '#334155', '#0f172a', '#1f2937', '#3f3f46', '#1e3a5f'];
        $palette = $palettes[random_int(0, count($palettes) - 1)];
        $bgTop = $palette[0];
        $bgBottom = $palette[1];
        $chars = preg_split('//u', $code, -1, PREG_SPLIT_NO_EMPTY) ?: [$code];
        $count = max(1, count($chars));
        $step = (300 - 64) / $count;
        $noise = max(0, min(10, $noise));

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100">'
            . '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
            . '<stop offset="0" stop-color="' . $bgTop . '"/>'
            . '<stop offset="1" stop-color="' . $bgBottom . '"/>'
            . '</linearGradient></defs>'
            . '<rect width="300" height="100" fill="url(#bg)"/>';

        for ($index = 0; $index < $noise * 9; $index++) {
            $svg .= '<circle cx="' . random_int(2, 298) . '" cy="' . random_int(2, 98) . '" r="'
                . round(random_int(4, 22) / 10, 1) . '" fill="' . $inks[random_int(0, count($inks) - 1)]
                . '" opacity="' . round(random_int(8, 30) / 100, 2) . '"/>';
        }

        for ($index = 0; $index < max(2, $noise); $index++) {
            $y1 = random_int(10, 90);
            $y2 = random_int(10, 90);
            $svg .= '<path d="M' . random_int(0, 40) . ' ' . $y1
                . ' Q' . random_int(100, 200) . ' ' . random_int(0, 100) . ' ' . random_int(260, 300) . ' ' . $y2
                . '" fill="none" stroke="' . $inks[random_int(0, count($inks) - 1)] . '" stroke-width="'
                . round(random_int(8, 16) / 10, 1) . '" opacity=".22" stroke-linecap="round"/>';
        }

        foreach ($chars as $index => $char) {
            $x = (int) round(34 + $index * $step + random_int(-3, 3));
            $y = 64 + random_int(-8, 8);
            $rotate = random_int(-20, 20);
            $size = random_int(38, 46);
            $svg .= '<text x="' . $x . '" y="' . $y . '" font-family="ui-monospace, SFMono-Regular, Menlo, monospace"'
                . ' font-size="' . $size . '" font-weight="700" fill="' . $inks[random_int(0, count($inks) - 1)] . '"'
                . ' transform="rotate(' . $rotate . ' ' . $x . ' ' . $y . ')" opacity=".94">'
                . htmlspecialchars($char, ENT_QUOTES | ENT_XML1, 'UTF-8')
                . '</text>';
        }

        for ($index = 0; $index < $noise * 3; $index++) {
            $svg .= '<circle cx="' . random_int(2, 298) . '" cy="' . random_int(2, 98) . '" r="'
                . round(random_int(5, 16) / 10, 1) . '" fill="#0f172a" opacity=".12"/>';
        }

        return $svg . '<rect x="1" y="1" width="298" height="98" rx="8" fill="none" stroke="#0f172a" stroke-opacity=".08"/></svg>';
    }

    /**
     * Render one selectable card for the image-selection captcha.
     */
    private static function shapeCardSvg(string $shape): string
    {
        $palettes = [
            ['#fef3c7', '#f59e0b'],
            ['#dbeafe', '#3b82f6'],
            ['#dcfce7', '#22c55e'],
            ['#fae8ff', '#a855f7'],
            ['#ffe4e6', '#f43f5e'],
            ['#ccfbf1', '#14b8a6'],
            ['#ffedd5', '#fb923c'],
        ];
        $palette = $palettes[random_int(0, count($palettes) - 1)];
        $background = $palette[0];
        $foreground = $palette[1];
        $rotate = random_int(-16, 16);
        $figure = match ($shape) {
            'circle' => '<circle cx="48" cy="48" r="26" fill="' . $foreground . '"/>',
            'triangle' => '<path d="M48 20 L74 72 L22 72 Z" fill="' . $foreground . '"/>',
            'square' => '<rect x="24" y="24" width="48" height="48" rx="7" fill="' . $foreground . '"/>',
            'diamond' => '<path d="M48 18 L78 48 L48 78 L18 48 Z" fill="' . $foreground . '"/>',
            'hexagon' => '<path d="M48 18 L72 32 L72 64 L48 78 L24 64 L24 32 Z" fill="' . $foreground . '"/>',
            default => '<path d="M48 16 L58.6 38.2 L83 41.2 L64.5 58.1 L69.6 82 L48 70.2 L26.4 82 L31.5 58.1 L13 41.2 L37.4 38.2 Z" fill="' . $foreground . '"/>',
        };

        return '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">'
            . '<rect width="96" height="96" rx="14" fill="' . $background . '"/>'
            . '<circle cx="48" cy="48" r="38" fill="#fff" fill-opacity=".55"/>'
            . '<g transform="rotate(' . $rotate . ' 48 48)">' . $figure . '</g>'
            . '</svg>';
    }

    /**
     * Pick a random operator from the configured whitelist and build a
     * question whose result is always an integer.
     *
     * @return array{0: int, 1: int, 2: string, 3: int}
     */
    private static function mathQuestion(): array
    {
        $operations = self::mathOperations();
        $operation = $operations[random_int(0, count($operations) - 1)];
        if ($operation === 'mul') {
            $left = random_int(2, 12);
            $right = random_int(2, 12);

            return [$left, $right, '×', $left * $right];
        }
        if ($operation === 'sub') {
            $left = random_int(6, 20);
            $right = random_int(1, $left);

            return [$left, $right, '-', $left - $right];
        }
        $left = random_int(2, 19);
        $right = random_int(2, 19);

        return [$left, $right, '+', $left + $right];
    }

    /**
     * @return list<string>
     */
    private static function mathOperations(): array
    {
        $configured = Settings::values()['Captcha_Math_Operations'] ?? [];
        $allowed = ['add', 'sub', 'mul'];
        $operations = is_array($configured)
            ? array_values(array_filter(
                array_map('strval', $configured),
                static fn (string $item): bool => in_array($item, $allowed, true)
            ))
            : [];

        return $operations === [] ? ['add', 'sub'] : $operations;
    }

    private static function imageCharset(): string
    {
        $key = (string) (Settings::values()['Captcha_Image_Charset'] ?? 'alnum');

        return self::IMAGE_CHARSETS[$key] ?? self::IMAGE_CHARSETS['alnum'];
    }

    private static function imageLength(): int
    {
        return max(4, min(6, (int) (Settings::values()['Captcha_Image_Length'] ?? 5)));
    }

    private static function imageNoise(): int
    {
        return max(0, min(10, (int) (Settings::values()['Captcha_Image_Noise'] ?? 5)));
    }

    private static function selectCount(): int
    {
        return max(4, min(8, (int) (Settings::values()['Captcha_Select_Count'] ?? 6)));
    }

    private static function selectSource(): string
    {
        $source = (string) (Settings::values()['Captcha_Select_Source'] ?? 'builtin');

        return in_array($source, self::SELECT_SOURCES, true) ? $source : 'builtin';
    }

    /**
     * Pair the custom image pool with its label list line by line.
     *
     * Images without a label are ignored once labels are supplied so a
     * generated question never targets an unnamed group. When no labels are
     * configured every image shares one group and the challenge falls back to
     * the "pick the matching sample" mode.
     *
     * @return array<string, list<string>>
     */
    private static function customSelectGroups(): array
    {
        $values = Settings::values();
        $labels = self::settingLines($values['Captcha_Select_Labels'] ?? '');
        $hasLabels = false;
        foreach ($labels as $label) {
            if ($label !== '') {
                $hasLabels = true;
                break;
            }
        }

        $lines = self::settingLines($values['Captcha_Select_Images'] ?? '');
        $groups = [];
        $total = 0;
        foreach ($lines as $index => $line) {
            if ($line === '') {
                continue;
            }
            $label = $labels[$index] ?? '';
            if (str_contains($line, '|')) {
                [$inlineLabel, $line] = explode('|', $line, 2);
                $line = trim($line);
                if ($label === '') {
                    $label = trim($inlineLabel);
                }
            }
            if (!$hasLabels) {
                $label = '图片';
            } elseif ($label === '') {
                continue;
            }
            $url = Media::normalizeUrl($line);
            if ($url === '') {
                continue;
            }
            if (ctype_digit($url)) {
                $url = Media::url((int) $url);
            }
            if ($url === '') {
                continue;
            }
            $label = preg_replace('/[\x00-\x1F\x7F]/u', '', $label) ?? '';
            $label = trim(mb_substr($label, 0, 24, 'UTF-8'));
            if ($label === '') {
                continue;
            }
            if (!isset($groups[$label])) {
                $groups[$label] = [];
            }
            if (in_array($url, $groups[$label], true)) {
                continue;
            }
            $groups[$label][] = $url;
            $total++;
            if ($total >= 30) {
                break;
            }
        }

        return $groups;
    }

    /**
     * Split a textarea setting into trimmed lines while keeping empty rows so
     * label/image indexes stay aligned.
     *
     * @return list<string>
     */
    private static function settingLines(mixed $value): array
    {
        if (!is_string($value)) {
            $value = is_array($value) ? implode("\n", array_map('strval', $value)) : '';
        }
        $lines = preg_split('/\r\n|\r|\n/', $value);
        if (!is_array($lines)) {
            return [];
        }

        return array_map(
            static fn (string $line): string => trim($line),
            $lines
        );
    }

    /**
     * @param list<string> $items
     */
    private static function shuffleList(array &$items): void
    {
        for ($index = count($items) - 1; $index > 0; $index--) {
            $swap = random_int(0, $index);
            [$items[$index], $items[$swap]] = [$items[$swap], $items[$index]];
        }
    }

    private static function sliderTolerance(): float
    {
        return (float) max(2, min(10, (int) (Settings::values()['Captcha_Slider_Tolerance'] ?? 4)));
    }

    private static function normalizeText(string $value): string
    {
        $upper = mb_strtoupper(trim($value), 'UTF-8');

        return preg_replace('/\s+/u', '', $upper) ?? '';
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
            $valid = preg_match('/^-?\d{1,4}$/D', $answer) === 1
                && hash_equals(
                    (string) ($record['answer'] ?? ''),
                    hash('sha256', (string) (int) $answer)
                );
        } elseif ($provider === 'slider') {
            $position = is_numeric($answer) ? (float) $answer : -1.0;
            $target = (float) ($record['target'] ?? -1.0);
            $tolerance = self::sliderTolerance();
            $valid = $position >= 0.0
                && $position <= 100.0
                && $target >= 0.0
                && abs($position - $target) <= $tolerance;
        } elseif ($provider === 'image_text') {
            $text = is_scalar($answer) ? self::normalizeText((string) $answer) : '';
            $valid = $text !== ''
                && mb_strlen($text, 'UTF-8') <= 8
                && hash_equals(
                    (string) ($record['answer'] ?? ''),
                    hash('sha256', $text)
                );
        } elseif ($provider === 'image_select') {
            $optionId = is_scalar($answer) ? trim((string) $answer) : '';
            $valid = preg_match('/^[a-f0-9]{8}$/D', $optionId) === 1
                && hash_equals(
                    (string) ($record['answer'] ?? ''),
                    hash('sha256', $optionId)
                );
        }

        if ($valid) {
            return self::deleteRecord($id);
        }

        // A selection captcha has only one correct card, so a wrong pick burns
        // the challenge instead of granting extra brute-force attempts.
        if ($provider === 'image_select') {
            self::deleteRecord($id);

            return false;
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

    private static function deleteRecord(string $id): bool
    {
        try {
            $db = Db::get();
            $deleted = (int) $db->query(
                $db->delete('table.options')
                    ->where('name = ?', self::STORE_PREFIX . $id)
                    ->where('user = ?', 0)
            );

            return $deleted > 0;
        } catch (\Throwable) {
            // Ignore cleanup failures.
            return false;
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
