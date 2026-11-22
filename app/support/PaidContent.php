<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Compat\Typecho;
use TTDF\Http\Request;
use TTDF\Http\Response;
use TTDF\Theme\Media;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Paid visibility blocks and their order lifecycle.
 *
 * The hidden body is never emitted before a matching paid order exists. Quotes
 * are signed with the site secret so a visitor cannot change the amount, the
 * payment methods or the target content from the browser console.
 */
final class PaidContent
{
    public const ORDER_TYPE = 'paid';

    private const CONTENT_TYPES = ['article', 'topic'];

    private const MODE_ORDER = ['balance', 'points', 'gateway'];

    private const INNER_PATTERN = '/\[paid\b([^\]]*)\]([\s\S]*?)\[\/paid\]/i';

    private const OPEN_PATTERN = '/\[paid\b[^\]]*\]/i';

    /** @var array<string, array<string, true>> */
    private static array $purchaseCache = [];

    public static function register(): void
    {
        foreach ([
            'paid-order' => ['handleOrder', 'POST'],
            'paid-balance-pay' => ['handleBalancePay', 'POST'],
            'paid-points-pay' => ['handlePointsPay', 'POST'],
            'paid-status' => ['handleStatus', 'GET'],
        ] as $action => [$handler, $method]) {
            Endpoint::register($action, [self::class, $handler], [
                'auth' => 'user',
                'method' => $method,
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public static function client(string $contentType, int $contentId): array
    {
        $type = in_array($contentType, self::CONTENT_TYPES, true) ? $contentType : 'article';

        return [
            'enabled' => DownloadPayment::configured(),
            'storeReady' => DownloadStore::available(),
            'contentType' => $type,
            'contentId' => max(0, $contentId),
            'loggedIn' => self::uid() > 0,
            'nonce' => Typecho::isLoggedIn() ? Typecho::securityToken() : '',
            'balanceEnabled' => DownloadPayment::balanceEnabled(),
            'pointsEnabled' => DownloadPayment::pointsEnabled(),
            'pointsRate' => DownloadPayment::pointsRate(),
            'labels' => [
                'balance' => self::balanceLabel(),
                'points' => self::pointsLabel(),
            ],
            'endpoints' => [
                'order' => Endpoint::url('paid-order'),
                'balance' => Endpoint::url('paid-balance-pay'),
                'points' => Endpoint::url('paid-points-pay'),
                'status' => Endpoint::url('paid-status'),
            ],
        ];
    }

    public static function render(string $html, string $contentType, int $contentId): string
    {
        return self::renderFor(
            $html,
            $contentType,
            $contentId,
            self::uid(),
            UserProfile::viewerIsAdmin(),
            self::currentUrl()
        );
    }

    /**
     * REST responses carry the real public URL in their payload, which is a
     * better return target than the API endpoint itself.
     */
    public static function protectMarkdown(
        string $text,
        string $contentType,
        int $contentId,
        ?int $uid = null,
        ?bool $admin = null
    ): string {
        if ($text === '' || !str_contains($text, '[')) {
            return $text;
        }

        $uid ??= self::uid();
        $admin ??= UserProfile::viewerIsAdmin();
        $purchased = $admin ? [] : self::purchasedKeys($contentType, $contentId, $uid);
        $index = 0;

        $rendered = preg_replace_callback(
            self::INNER_PATTERN,
            static function (array $match) use ($contentType, $contentId, $uid, $admin, $purchased, &$index): string {
                $attributes = self::attributes((string) ($match[1] ?? ''));
                $body = (string) ($match[2] ?? '');
                $quote = self::quote($attributes, $contentType, $contentId, $index++);
                if ($admin || ($uid > 0 && $quote['blockKey'] !== '' && isset($purchased[$quote['blockKey']]))) {
                    return $body;
                }

                return self::markdownNotice($quote);
            },
            $text
        );
        $text = is_string($rendered) ? $rendered : $text;

        if (preg_match(self::OPEN_PATTERN, $text, $match, PREG_OFFSET_CAPTURE) !== 1) {
            return $text;
        }

        $offset = (int) ($match[0][1] ?? 0);

        return substr($text, 0, $offset)
            . "\n\n> 付费内容格式不完整，已停止显示后续内容。\n\n";
    }

    /**
     * Add the rendered block to REST payload content.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function filterApiData(
        array $data,
        string $contentType,
        int $contentId,
        bool $markdown
    ): array {
        if (!isset($data['content']) || !is_string($data['content'])) {
            return $data;
        }

        $returnUrl = self::safeReturnUrl((string) ($data['url'] ?? ''));
        if ($returnUrl === '') {
            $returnUrl = self::currentUrl();
        }

        $data['content'] = $markdown
            ? self::protectMarkdown($data['content'], $contentType, $contentId)
            : self::renderFor(
                $data['content'],
                $contentType,
                $contentId,
                self::uid(),
                UserProfile::viewerIsAdmin(),
                $returnUrl
            );

        return $data;
    }

    /**
     * Remove the whole block, including its hidden body, before the text is
     * used for excerpts, feeds, search snippets or SEO metadata.
     */
    public static function redact(string $text): string
    {
        if ($text === '' || !str_contains($text, '[')) {
            return $text;
        }

        $redacted = preg_replace('/\[paid\b[^\]]*\][\s\S]*?(?:\[\/paid\]|$)/i', ' ', $text);
        if (!is_string($redacted)) {
            return $text;
        }

        return (string) preg_replace('/\[\/?paid\b[^\]]*\]/i', ' ', $redacted);
    }

    /**
     * @param array<string, mixed> $order
     */
    public static function orderReturnUrl(array $order): string
    {
        if ((string) ($order['content_type'] ?? '') !== self::ORDER_TYPE) {
            return '';
        }

        $marker = self::decodeMarker($order);

        return self::safeReturnUrl((string) ($marker['return'] ?? ''));
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleOrder(array $data): array
    {
        $uid = self::requireUser();
        if (!DownloadPayment::configured()) {
            Response::error('付费内容暂不可用，请联系管理员', 403);
        }
        if (!DownloadStore::available()) {
            Response::error('交易数据表尚未初始化，请管理员保存一次主题设置', 503);
        }
        WriteThrottle::guard('paid-order', $uid, 30, 60);

        $quote = self::verifiedQuote($data);
        $amount = (int) $quote['amount'];
        $minimum = DownloadPayment::minimumCents();
        if ($amount < $minimum) {
            Response::error(
                '售价不能低于最低支付金额 ¥' . DownloadPayment::minimumAmount(),
                422,
                ['price' => '当前付费区块售价低于站点配置的最低支付金额']
            );
        }

        $available = self::availableModes($quote['modes']);
        if ($available === []) {
            Response::error('该付费区块没有可用的付款方式', 403);
        }

        $contentType = $quote['contentType'];
        $contentId = $quote['contentId'];
        $marker = self::marker($quote);
        $orders = DownloadStore::blockOrders($uid, self::ORDER_TYPE, $contentId);
        foreach ($orders as $order) {
            $stored = self::decodeMarker($order);
            if (
                (string) ($stored['blockKey'] ?? '') !== $quote['blockKey']
                || (string) ($stored['contentType'] ?? '') !== $contentType
            ) {
                continue;
            }

            if ((string) ($order['status'] ?? '') === 'paid') {
                return ['order' => self::orderPayload($order)];
            }
            if (
                (string) ($order['status'] ?? '') === 'pending'
                && (int) ($order['amount_cents'] ?? 0) === $amount
                && (string) ($order['content_url'] ?? '') === $marker
            ) {
                return ['order' => self::orderPayload($order)];
            }
        }

        $order = [
            'number' => self::newOrderNumber(),
            'user_id' => $uid,
            'content_type' => self::ORDER_TYPE,
            'content_id' => $contentId,
            'title' => self::clipTitle((string) $quote['title']),
            'content_url' => $marker,
            'amount_cents' => $amount,
            'status' => 'pending',
            'gateway_trade' => null,
            'download_count' => 0,
            'created' => time(),
            'paid_at' => 0,
        ];
        DownloadStore::createOrder($order);

        return ['order' => self::orderPayload($order)];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleBalancePay(array $data): array
    {
        return self::settle($data, 'balance');
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handlePointsPay(array $data): array
    {
        return self::settle($data, 'points');
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleStatus(array $data): array
    {
        $uid = self::requireUser();
        if (!DownloadStore::available()) {
            Response::error('交易数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $order = self::ownedOrder((string) ($data['orderNumber'] ?? ''), $uid);

        return ['order' => self::orderPayload($order)];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private static function settle(array $data, string $mode): array
    {
        $uid = self::requireUser();
        if (!DownloadStore::available() || !UserEconomy::available()) {
            Response::error('交易数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $order = self::ownedOrder((string) ($data['orderNumber'] ?? ''), $uid);
        $marker = self::decodeMarker($order);
        $modes = self::normalizeModes($marker['modes'] ?? [], false);
        if (!in_array($mode, $modes, true)) {
            Response::error('该订单未开放这种付款方式', 403);
        }
        if ((string) ($order['status'] ?? '') === 'paid') {
            return ['order' => self::orderPayload($order)];
        }

        WriteThrottle::guard('paid-' . $mode . '-pay', $uid, 20, 60);
        $paid = $mode === 'balance'
            ? UserEconomy::markOrderPaidWithBalance($order, $uid)
            : UserEconomy::markOrderPaidWithPoints($order, $uid);

        return ['order' => self::orderPayload($paid)];
    }

    /**
     * @return array<string, mixed>
     */
    private static function renderFor(
        string $html,
        string $contentType,
        int $contentId,
        int $uid,
        bool $admin,
        string $returnUrl
    ): string {
        if ($html === '' || !str_contains($html, '[')) {
            return $html;
        }

        // Markdown may wrap a shortcode that sits on its own line in a
        // paragraph. Strip those wrappers so the rendered BODY does not start
        // with a stray </p> or end with an unclosed <p>.
        $html = self::unwrapShortcodeParagraphs($html, 'paid');

        $purchased = $admin ? [] : self::purchasedKeys($contentType, $contentId, $uid);
        $index = 0;
        $rendered = preg_replace_callback(
            self::INNER_PATTERN,
            static function (array $match) use ($contentType, $contentId, $uid, $admin, $purchased, $returnUrl, &$index): string {
                $attributes = self::attributes((string) ($match[1] ?? ''));
                $body = (string) ($match[2] ?? '');
                $quote = self::quote($attributes, $contentType, $contentId, $index++);
                $quote['returnUrl'] = $returnUrl;

                if ($admin || ($uid > 0 && $quote['blockKey'] !== '' && isset($purchased[$quote['blockKey']]))) {
                    return self::unlocked($body, $quote);
                }

                return self::locked(
                    $quote,
                    $attributes,
                    $uid > 0,
                    self::availableModes($quote['modes']),
                    $returnUrl
                );
            },
            $html
        );
        $html = is_string($rendered) ? $rendered : $html;

        if (preg_match(self::OPEN_PATTERN, $html, $match, PREG_OFFSET_CAPTURE) !== 1) {
            return $html;
        }

        $offset = (int) ($match[0][1] ?? 0);

        return substr($html, 0, $offset)
            . '<section class="content-gate-hero paid-gate-hero" data-paid-block>'
            . '<div class="content-gate-hero-inner"><span class="content-gate-icon" aria-hidden="true">'
            . self::icon('lock')
            . '</span><div class="content-gate-copy"><h2 class="content-gate-title">付费内容格式不完整</h2>'
            . '<span class="content-gate-divider" aria-hidden="true"></span>'
            . '<p class="content-gate-text">请作者补全结束标签后再发布，后续内容已停止显示。</p>'
            . '</div></div></section>';
    }

    /**
     * @param array{blockKey: string, amount: int, title: string, modes: list<string>, rawModes: string, contentType: string, contentId: int, returnUrl: string} $quote
     * @param array<string, string> $attributes
     * @param list<string> $availableModes
     */
    private static function locked(
        array $quote,
        array $attributes,
        bool $signedIn,
        array $availableModes,
        string $returnUrl
    ): string {
        $title = $quote['title'];
        $text = self::clipText(trim((string) ($attributes['text'] ?? '')), 240);
        if ($text === '') {
            $text = '购买后即可查看这一区块的完整内容，订单会记录在你的账户中。';
        }
        $badge = self::clipText(trim((string) ($attributes['badge'] ?? '')), 20);
        if ($badge === '') {
            $badge = '付费阅读';
        }
        $style = strtolower(trim((string) ($attributes['style'] ?? 'hero')));
        $style = $style === 'card' ? 'card' : 'hero';
        $normalizedImage = Media::normalizeUrl($attributes['image'] ?? '');
        $image = $normalizedImage === '' ? '' : Media::url($normalizedImage);
        $amount = $quote['amount'];
        $pointsCost = self::pointsCost($amount);
        $hasMoney = in_array('balance', $quote['modes'], true)
            || in_array('gateway', $quote['modes'], true);
        $hasPoints = in_array('points', $quote['modes'], true);
        $minimum = DownloadPayment::minimumCents();
        $configured = $amount >= $minimum && $availableModes !== [];

        $price = '';
        if ($hasMoney && $amount > 0) {
            $price = '<span class="paid-gate-price-main"><small>¥</small>'
                . htmlspecialchars(Downloads::formatAmount($amount), ENT_QUOTES, 'UTF-8')
                . '</span>';
        }
        if ($hasPoints && $pointsCost > 0) {
            $price .= '<span class="paid-gate-price-points">'
                . ($price === '' ? '' : '或 ')
                . htmlspecialchars((string) $pointsCost, ENT_QUOTES, 'UTF-8')
                . ' ' . htmlspecialchars(self::pointsLabel(), ENT_QUOTES, 'UTF-8')
                . '</span>';
        }
        if ($price === '') {
            $price = '<span class="paid-gate-price-main"><small>¥</small>0.00</span>';
        }

        $chips = [];
        foreach ($availableModes as $mode) {
            $chips[] = '<span class="paid-gate-mode">'
                . htmlspecialchars(self::modeLabel($mode), ENT_QUOTES, 'UTF-8')
                . '</span>';
        }

        $button = '';
        $hint = '';
        if (!$configured) {
            $hint = $amount < $minimum
                ? '售价低于站点最低支付金额，暂时无法购买。'
                : '作者尚未配置可用的付款方式，请联系管理员。';
        } else {
            $button = '<button type="button" class="content-gate-btn paid-gate-buy"'
                . ' data-paid-buy'
                . ' data-paid-key="' . self::escape($quote['blockKey']) . '"'
                . ' data-paid-sign="' . self::escape(self::signature($quote)) . '"'
                . ' data-paid-price="' . self::escape(Downloads::formatAmount($amount)) . '"'
                . ' data-paid-title="' . self::escape($title) . '"'
                . ' data-paid-modes="' . self::escape($quote['rawModes']) . '"'
                . ' data-paid-return="' . self::escape($returnUrl) . '"'
                . ' data-paid-content-type="' . self::escape($quote['contentType']) . '"'
                . ' data-paid-content-id="' . $quote['contentId'] . '"'
                . '>'
                . '<span class="paid-gate-buy-label">立即购买</span>'
                . self::icon('arrow')
                . '</button>';
            $hint = $signedIn
                ? '支付成功后刷新本页即可查看完整内容。'
                : '登录后购买，订单会保存到你的账户。';
        }

        $imageBlock = $style === 'card' && $image !== ''
            ? '<div class="paid-gate-media"><img src="' . self::escape($image)
                . '" alt="" loading="lazy" decoding="async"></div>'
            : '';

        return '<section class="content-gate-hero paid-gate paid-gate-' . $style . '" data-paid-block>'
            . '<div class="paid-gate-inner">'
            . $imageBlock
            . '<div class="paid-gate-body">'
            . '<span class="paid-gate-badge">' . self::escape($badge) . '</span>'
            . '<h2 class="content-gate-title paid-gate-title">' . self::escape($title) . '</h2>'
            . '<p class="content-gate-text paid-gate-text">' . self::escape($text) . '</p>'
            . '<div class="paid-gate-price">' . $price . '</div>'
            . ($chips === [] ? '' : '<div class="paid-gate-modes">' . implode('', $chips) . '</div>')
            . $button
            . ($hint === '' ? '' : '<p class="paid-gate-hint">' . self::escape($hint) . '</p>')
            . '</div></div></section>';
    }

    /**
     * @param array{title: string, rawModes: string} $quote
     */
    private static function unlocked(string $body, array $quote): string
    {
        return '<section class="content-gate-hero content-gate-hero-open paid-gate-open" data-paid-block>'
            . '<div class="content-gate-open-head">'
            . '<span class="content-gate-open-icon" aria-hidden="true">' . self::icon('unlock') . '</span>'
            . '<span class="content-gate-open-label">内容已解锁</span>'
            . '<span class="content-gate-open-hint">' . self::escape($quote['title']) . '</span>'
            . '</div>'
            . '<div class="content-gate-open-body">' . $body . '</div>'
            . '</section>';
    }

    /**
     * @return array{blockKey: string, amount: int, title: string, modes: list<string>, rawModes: string, contentType: string, contentId: int, returnUrl: string}
     */
    private static function quote(
        array $attributes,
        string $contentType,
        int $contentId,
        int $index
    ): array {
        $type = in_array($contentType, self::CONTENT_TYPES, true) ? $contentType : 'article';
        $id = max(0, $contentId);
        $amount = Downloads::amountCents($attributes['price'] ?? '') ?? 0;
        $rawModes = trim((string) ($attributes['modes'] ?? 'all'));
        $modes = self::normalizeModes($rawModes);
        $title = self::clipTitle(trim((string) ($attributes['title'] ?? '')));
        if ($title === '') {
            $title = '付费内容';
        }
        $blockKey = substr(hash('sha256', $type . ':' . $id . ':' . $index), 0, 40);

        return [
            'blockKey' => $blockKey,
            'amount' => $amount,
            'title' => $title,
            'modes' => $modes,
            'rawModes' => implode(',', $modes),
            'contentType' => $type,
            'contentId' => $id,
            'returnUrl' => '',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array{blockKey: string, amount: int, title: string, modes: list<string>, rawModes: string, contentType: string, contentId: int, returnUrl: string}
     */
    private static function verifiedQuote(array $data): array
    {
        $blockKey = is_string($data['blockKey'] ?? null) ? trim($data['blockKey']) : '';
        $signature = is_string($data['sign'] ?? null) ? trim($data['sign']) : '';
        $contentType = is_string($data['contentType'] ?? null)
            ? strtolower(trim($data['contentType']))
            : '';
        $contentId = max(0, (int) ($data['contentId'] ?? 0));
        $price = is_string($data['price'] ?? null) ? trim($data['price']) : '';
        $title = is_string($data['title'] ?? null) ? trim($data['title']) : '';
        $rawModes = is_string($data['modes'] ?? null) ? trim($data['modes']) : '';
        $returnUrl = self::safeReturnUrl($data['returnUrl'] ?? '');

        if (
            preg_match('/^[a-f0-9]{40}$/D', $blockKey) !== 1
            || preg_match('/^[a-f0-9]{64}$/D', $signature) !== 1
            || !in_array($contentType, self::CONTENT_TYPES, true)
            || $contentId <= 0
            || $title === ''
            || $returnUrl === ''
        ) {
            Response::error('购买信息无效，请刷新页面后重试', 422);
        }

        $amount = Downloads::amountCents($price);
        $modes = self::normalizeModes($rawModes);
        if ($amount === null || $amount <= 0 || $modes === []) {
            Response::error('购买信息无效，请刷新页面后重试', 422);
        }

        $quote = [
            'blockKey' => $blockKey,
            'amount' => $amount,
            'title' => self::clipTitle($title),
            'modes' => $modes,
            'rawModes' => implode(',', $modes),
            'contentType' => $contentType,
            'contentId' => $contentId,
            'returnUrl' => $returnUrl,
        ];

        if (!hash_equals(self::signature($quote), strtolower($signature))) {
            Response::error('购买信息已失效，请刷新页面后重试', 422);
        }

        return $quote;
    }

    /**
     * @param array{blockKey: string, amount: int, title: string, modes: list<string>, contentType: string, contentId: int, returnUrl: string} $quote
     */
    private static function signature(array $quote): string
    {
        $payload = implode("\n", [
            $quote['blockKey'],
            $quote['contentType'],
            (string) $quote['contentId'],
            Downloads::formatAmount((int) $quote['amount']),
            $quote['title'],
            implode(',', $quote['modes']),
            $quote['returnUrl'],
        ]);

        return hash_hmac('sha256', $payload, self::secret());
    }

    private static function secret(): string
    {
        try {
            $options = Typecho::options();
            $secret = is_scalar($options?->secret ?? null) ? (string) $options->secret : '';
        } catch (\Throwable) {
            $secret = '';
        }

        return hash('sha256', $secret . '|' . Typecho::siteUrl() . '|ttdf-paid-content');
    }

    /**
     * @param array{blockKey: string, amount: int, title: string, modes: list<string>, contentType: string, contentId: int, returnUrl: string} $quote
     */
    private static function marker(array $quote): string
    {
        $encoded = json_encode([
            'blockKey' => $quote['blockKey'],
            'contentType' => $quote['contentType'],
            'modes' => $quote['modes'],
            'return' => $quote['returnUrl'],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return is_string($encoded) ? $encoded : '';
    }

    /**
     * @param array<string, mixed> $order
     * @return array<string, mixed>
     */
    private static function decodeMarker(array $order): array
    {
        if ((string) ($order['content_type'] ?? '') !== self::ORDER_TYPE) {
            return [];
        }

        $raw = (string) ($order['content_url'] ?? '');
        if ($raw === '' || !str_starts_with($raw, '{')) {
            return [];
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @return array<string, true>
     */
    private static function purchasedKeys(string $contentType, int $contentId, int $uid): array
    {
        if ($uid <= 0 || $contentId <= 0) {
            return [];
        }

        $cacheKey = $contentType . ':' . $contentId . ':' . $uid;
        if (isset(self::$purchaseCache[$cacheKey])) {
            return self::$purchaseCache[$cacheKey];
        }
        if (!DownloadStore::available()) {
            return self::$purchaseCache[$cacheKey] = [];
        }

        $keys = [];
        foreach (DownloadStore::blockOrders($uid, self::ORDER_TYPE, $contentId, 'paid') as $order) {
            $marker = self::decodeMarker($order);
            $blockKey = (string) ($marker['blockKey'] ?? '');
            if (
                preg_match('/^[a-f0-9]{40}$/D', $blockKey) === 1
                && (string) ($marker['contentType'] ?? '') === $contentType
            ) {
                $keys[$blockKey] = true;
            }
        }

        return self::$purchaseCache[$cacheKey] = $keys;
    }

    /**
     * @param list<string> $requested
     * @return list<string>
     */
    private static function availableModes(array $requested): array
    {
        $modes = [];
        foreach (self::MODE_ORDER as $mode) {
            if (!in_array($mode, $requested, true)) {
                continue;
            }
            if ($mode === 'balance' && !DownloadPayment::balanceEnabled()) {
                continue;
            }
            if ($mode === 'points' && !DownloadPayment::pointsEnabled()) {
                continue;
            }
            if ($mode === 'gateway' && DownloadPayment::gatewayChannels() === []) {
                continue;
            }
            $modes[] = $mode;
        }

        return $modes;
    }

    /**
     * @return list<string>
     */
    private static function normalizeModes(mixed $value, bool $fallbackAll = true): array
    {
        $items = [];
        if (is_array($value)) {
            $items = $value;
        } elseif (is_scalar($value)) {
            $items = preg_split('/[\s,|]+/', strtolower(trim((string) $value))) ?: [];
        }

        $modes = [];
        foreach ($items as $item) {
            if (!is_scalar($item)) {
                continue;
            }
            $mode = strtolower(trim((string) $item));
            $mode = match ($mode) {
                'all', 'any', '全部', 'all-modes' => 'all',
                'balance', 'wallet', '余额', 'r币', 'r-b' => 'balance',
                'points', 'point', '积分' => 'points',
                'gateway', 'third', 'thirdparty', 'third-party', 'online', '第三方', '在线支付' => 'gateway',
                default => '',
            };
            if ($mode === 'all') {
                return self::MODE_ORDER;
            }
            if ($mode !== '' && !in_array($mode, $modes, true)) {
                $modes[] = $mode;
            }
        }

        if ($modes === []) {
            return $fallbackAll ? self::MODE_ORDER : [];
        }

        return array_values(array_filter(
            self::MODE_ORDER,
            static fn (string $mode): bool => in_array($mode, $modes, true)
        ));
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private static function orderPayload(array $data): array
    {
        $status = (string) ($data['status'] ?? 'pending');
        $marker = self::decodeMarker($data);
        $modes = self::normalizeModes($marker['modes'] ?? [], false);
        $paymentOptions = [];
        if ($status === 'pending' && in_array('gateway', $modes, true)) {
            try {
                $paymentOptions = DownloadPayment::options($data);
            } catch (\Throwable $exception) {
                error_log('SunkenBoat paid content checkout failed: ' . $exception->getMessage());
            }
        }

        return [
            'number' => (string) ($data['number'] ?? ''),
            'status' => $status,
            'amount' => Downloads::formatAmount((int) ($data['amount_cents'] ?? 0)),
            'amountCents' => max(0, (int) ($data['amount_cents'] ?? 0)),
            'pointsCost' => self::pointsCost((int) ($data['amount_cents'] ?? 0)),
            'title' => (string) ($data['title'] ?? ''),
            'blockKey' => (string) ($marker['blockKey'] ?? ''),
            'modes' => $modes,
            'balanceEnabled' => in_array('balance', $modes, true) && DownloadPayment::balanceEnabled(),
            'pointsEnabled' => in_array('points', $modes, true) && DownloadPayment::pointsEnabled(),
            'pointsRate' => DownloadPayment::pointsRate(),
            'balanceLabel' => self::balanceLabel(),
            'pointsLabel' => self::pointsLabel(),
            'paymentOptions' => $paymentOptions,
            'createdAt' => (int) ($data['created'] ?? 0),
            'paidAt' => (int) ($data['paid_at'] ?? 0),
        ];
    }

    private static function pointsCost(int $amount): int
    {
        if ($amount <= 0) {
            return 0;
        }

        return max(1, (int) ceil($amount * DownloadPayment::pointsRate() / 100));
    }

    /**
     * @return array<string, mixed>
     */
    private static function ownedOrder(string $number, int $uid): array
    {
        if (preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $number) !== 1) {
            Response::error('订单号无效', 422, ['orderNumber' => '订单号格式不正确']);
        }

        $order = DownloadStore::orderByNumber($number);
        if (
            $order === null
            || (int) ($order['user_id'] ?? 0) !== $uid
            || (string) ($order['content_type'] ?? '') !== self::ORDER_TYPE
        ) {
            Response::error('订单不存在', 404);
        }

        return $order;
    }

    private static function requireUser(): int
    {
        $uid = self::uid();
        if ($uid <= 0) {
            Response::error('请先登录', 401);
        }

        return $uid;
    }

    private static function uid(): int
    {
        return UserProfile::viewerUid();
    }

    private static function currentUrl(): string
    {
        $base = rtrim(Typecho::indexUrl() ?: Typecho::siteUrl(), '/');
        $path = Request::path();

        return $path === '' ? $base . '/' : $base . '/' . $path;
    }

    private static function safeReturnUrl(mixed $value): string
    {
        if (!is_scalar($value)) {
            return '';
        }

        $value = trim((string) $value);
        if (
            $value === ''
            || strlen($value) > 1500
            || preg_match('/[\x00-\x20\x7f\\\\]/', $value) === 1
        ) {
            return '';
        }

        $target = parse_url($value);
        $site = parse_url(Typecho::siteUrl());
        $siteHost = is_array($site) ? strtolower((string) ($site['host'] ?? '')) : '';
        $sitePort = is_array($site) ? (int) ($site['port'] ?? 0) : 0;
        if (
            !is_array($target)
            || !in_array(strtolower((string) ($target['scheme'] ?? '')), ['http', 'https'], true)
            || strtolower((string) ($target['host'] ?? '')) !== $siteHost
            || $siteHost === ''
            || (int) ($target['port'] ?? 0) !== $sitePort
            || array_key_exists('user', $target)
            || array_key_exists('pass', $target)
        ) {
            return '';
        }

        return $value;
    }

    private static function newOrderNumber(): string
    {
        return 'SK' . date('YmdHis') . strtoupper(bin2hex(random_bytes(8)));
    }

    private static function clipTitle(string $title): string
    {
        $title = trim((string) preg_replace('/\s+/u', ' ', $title));
        if ($title === '') {
            return '';
        }

        return self::clipText($title, 180);
    }

    private static function clipText(string $value, int $limit): string
    {
        if ($value === '' || $limit <= 0) {
            return '';
        }

        return function_exists('mb_substr')
            ? mb_substr($value, 0, $limit, 'UTF-8')
            : substr($value, 0, $limit);
    }

    private static function balanceLabel(): string
    {
        $label = trim((string) (\TTDF\Theme\Settings::values()['Economy_Balance_Name'] ?? ''));

        return $label !== '' ? $label : '余额';
    }

    private static function pointsLabel(): string
    {
        $label = trim((string) (\TTDF\Theme\Settings::values()['Economy_Points_Name'] ?? ''));

        return $label !== '' ? $label : '积分';
    }

    private static function modeLabel(string $mode): string
    {
        return match ($mode) {
            'balance' => self::balanceLabel(),
            'points' => self::pointsLabel(),
            'gateway' => '第三方支付',
            default => $mode,
        };
    }

    /**
     * @param array<string, mixed> $quote
     */
    private static function markdownNotice(array $quote): string
    {
        $price = Downloads::formatAmount((int) ($quote['amount'] ?? 0));

        return "\n\n> **" . ($quote['title'] ?? '付费内容') . "**\n>\n"
            . '> 本段内容需要购买后查看（¥' . $price . "）。\n\n";
    }

    /**
     * @return array<string, string>
     */
    private static function attributes(string $source): array
    {
        $attributes = [];
        preg_match_all(
            '/([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s]+))/',
            $source,
            $matches,
            PREG_SET_ORDER
        );

        foreach ($matches as $match) {
            $name = strtolower((string) ($match[1] ?? ''));
            if ($name === '') {
                continue;
            }

            $value = $match[2] ?? '';
            if ($value === '' && isset($match[3]) && $match[3] !== '') {
                $value = $match[3];
            }
            if ($value === '' && isset($match[4]) && $match[4] !== '') {
                $value = $match[4];
            }

            $attributes[$name] = (string) $value;
        }

        return $attributes;
    }

    private static function icon(string $name): string
    {
        $paths = match ($name) {
            'arrow' => '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
            'unlock' => '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>'
                . '<path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
            default => '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>'
                . '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        };

        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
            . ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            . $paths
            . '</svg>';
    }

    private static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function unwrapShortcodeParagraphs(string $html, string $name): string
    {
        $open = '#<p>\s*(\[' . preg_quote($name, '#') . '\b[^\]]*\])\s*</p>#i';
        $close = '#<p>\s*(\[/' . preg_quote($name, '#') . '\])\s*</p>#i';
        $cleaned = preg_replace($open, '$1', $html);
        $html = is_string($cleaned) ? $cleaned : $html;
        $cleaned = preg_replace($close, '$1', $html);

        return is_string($cleaned) ? $cleaned : $html;
    }
}
