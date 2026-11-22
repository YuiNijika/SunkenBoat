<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Compat\Typecho;
use TTDF\Hooks\Hooks;
use TTDF\Http\Request;
use TTDF\Http\Response;
use TTDF\Http\Rest\V2\Payload;
use TTDF\Theme\Settings;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

final class Downloads
{
    private static bool $settingsWrite = false;
    private static bool $formDataRead = false;

    public static function register(): void
    {
        foreach ([
            'download-order' => ['handleOrder', 'POST'],
            'download-balance-pay' => ['handleBalancePay', 'POST'],
            'download-points-pay' => ['handlePointsPay', 'POST'],
            'download-status' => ['handleStatus', 'GET'],
            'download-file' => ['handleDownload', 'POST'],
            'download-history' => ['handleHistory', 'GET'],
        ] as $action => [$handler, $method]) {
            Endpoint::register($action, [self::class, $handler], ['auth' => 'user', 'method' => $method]);
        }

        Endpoint::register('download-install', static function (array $data): array {
            unset($data);

            return ['installed' => DownloadStore::install()];
        }, ['auth' => 'admin', 'method' => 'POST']);

        Hooks::addAction('rest.request', [self::class, 'settingsRequest']);
        Hooks::addFilter('rest.response', [self::class, 'settingsResponse']);
        Hooks::addFilter('rest.post.fields', [self::class, 'publicFields']);
        Hooks::addAction('rest.v2.auth', [self::class, 'validateArticle']);
    }

    public static function settingsRequest(string $method, string $path, string $scope): void
    {
        unset($scope);

        self::$settingsWrite = in_array(strtoupper($method), ['POST', 'PUT', 'PATCH'], true)
            && ($path === 'admin/options' || str_starts_with($path, 'admin/options/'));
        self::$formDataRead = strtoupper($method) === 'GET' && $path === 'admin/form-data';
    }

    public static function settingsResponse(mixed $payload, int $status, string $scope): array
    {
        unset($scope);

        if (self::$settingsWrite && $status < 400 && self::enabled()) {
            DownloadStore::install();
        }
        if (self::$formDataRead && $status < 400) {
            DownloadPayment::migrateLegacyChannels();
            if (is_array($payload) && array_key_exists('data', $payload)) {
                $payload['data'] = Settings::values();
            }
        }

        self::$settingsWrite = false;
        self::$formDataRead = false;

        return is_array($payload) ? $payload : [];
    }

    /**
     * The public v1 post resource must never expose a paid download URL.
     *
     * @param mixed $fields
     * @param array<string, mixed> $row
     * @return array<string, string>
     */
    public static function publicFields(mixed $fields, int $cid, array $row): array
    {
        unset($cid, $row);

        $safe = is_array($fields) ? $fields : [];
        unset($safe['Download_Url']);

        return $safe;
    }

    /**
     * Validate download fields before the REST v2 content controller writes
     * them. Editors cannot enable a paid resource while payment is disabled.
     */
    public static function validateArticle(
        array $identity,
        string $tier,
        string $path,
        string $method
    ): void
    {
        unset($identity, $tier);

        if (
            !in_array(strtoupper($method), ['POST', 'PATCH'], true)
            || !self::isContentWritePath($path)
        ) {
            return;
        }

        $body = self::cachedJsonBody();
        if (!is_array($body['fields'] ?? null)) {
            return;
        }

        $fields = Payload::map($body, 'fields');
        $enabled = self::flag($fields['Download_Enabled'] ?? false);
        $paid = self::flag($fields['Download_Paid'] ?? false);
        $url = trim((string) ($fields['Download_Url'] ?? ''));
        $price = $fields['Download_Price'] ?? '0.00';

        if ($url !== '' && self::safeUrl($url) === '') {
            Response::error('Invalid download URL', 422, ['fields' => '下载链接必须是完整的 HTTP 或 HTTPS 地址']);
        }

        try {
            self::normalizeConfig([
                'enabled' => $enabled,
                'url' => $url,
                'paid' => $paid,
                'price' => $price,
            ]);
        } catch (\InvalidArgumentException $exception) {
            Response::error('Invalid download settings', 422, ['fields' => $exception->getMessage()]);
        }

        if (
            $enabled
            && $paid
            && !DownloadPayment::configured()
        ) {
            Response::error('Payment is unavailable', 422, ['fields' => '付费下载尚未配置可用的付款方式']);
        }
    }

    public static function enabled(): bool
    {
        return (Settings::values()['Downloads_Enabled'] ?? false) === true;
    }

    public static function client(): array
    {
        return [
            'enabled' => self::enabled(),
            'paymentEnabled' => DownloadPayment::configured(),
            'balanceEnabled' => self::enabled() && DownloadPayment::balanceEnabled(),
            'balanceLabel' => trim((string) (Settings::values()['Economy_Balance_Name'] ?? '')) ?: '余额',
            'pointsEnabled' => self::enabled() && DownloadPayment::pointsEnabled(),
            'pointsLabel' => trim((string) (Settings::values()['Economy_Points_Name'] ?? '')) ?: '积分',
            'pointsRate' => DownloadPayment::pointsRate(),
            'nonce' => Typecho::isLoggedIn() ? Typecho::securityToken() : '',
            'endpoints' => [
                'order' => Endpoint::url('download-order'),
                'balance' => Endpoint::url('download-balance-pay'),
                'points' => Endpoint::url('download-points-pay'),
                'status' => Endpoint::url('download-status'),
                'download' => Endpoint::url('download-file'),
                'history' => Endpoint::url('download-history'),
            ],
        ];
    }

    public static function normalizeConfig(mixed $value): array
    {
        if (!is_array($value)) {
            throw new \InvalidArgumentException('下载配置格式无效');
        }

        $enabled = self::flag($value['enabled'] ?? false);
        $paid = self::flag($value['paid'] ?? false);
        $url = is_string($value['url'] ?? '') ? trim($value['url'] ?? '') : '';
        $amount = self::amountCents($value['price'] ?? '0.00');
        if ($url !== '' && self::safeUrl($url) === '') {
            throw new \InvalidArgumentException('下载链接必须是完整的 HTTP 或 HTTPS 地址');
        }
        if ($enabled && self::safeUrl($url) === '') {
            throw new \InvalidArgumentException('请填写有效的 HTTP 或 HTTPS 下载链接');
        }
        if ($enabled && $paid && ($amount === null || $amount <= 0)) {
            throw new \InvalidArgumentException('付费金额须为 0.01 至 999999.99 元，最多两位小数');
        }

        return [
            'enabled' => $enabled,
            'url' => self::safeUrl($url),
            'paid' => $paid,
            'price' => self::formatAmount($amount ?? 0),
        ];
    }

    public static function amountCents(mixed $value): ?int
    {
        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            return null;
        }
        $value = trim((string) $value);
        if (preg_match('/^(0|[1-9][0-9]{0,5})(?:\.([0-9]{1,2}))?$/D', $value, $match) !== 1) {
            return null;
        }

        return ((int) $match[1]) * 100 + (int) str_pad($match[2] ?? '', 2, '0');
    }

    public static function formatAmount(int $cents): string
    {
        return intdiv($cents, 100) . '.' . str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    public static function offer(string $contentType, int $contentId, string $title): ?array
    {
        if (!self::enabled()) {
            return null;
        }

        $uid = self::uid();
        $resource = self::resource($contentType, $contentId, $uid);
        if ($resource === null || !$resource['config']['enabled']) {
            return null;
        }

        $used = 0;
        $purchased = false;
        try {
            $used = $uid > 0 ? self::freeUsed($uid) : 0;
            $purchased = $uid > 0 && self::purchased($uid, $contentType, $contentId) !== null;
        } catch (\Throwable) {
            $used = 0;
            $purchased = false;
        }

        $config = $resource['config'];
        $limit = self::freeLimit();

        return [
            ...self::client(),
            'contentType' => $contentType,
            'contentId' => $contentId,
            'title' => $title,
            'paid' => $config['paid'],
            'price' => $config['paid'] ? $config['price'] : '0.00',
            'currency' => 'CNY',
            'loggedIn' => $uid > 0,
            'available' => $purchased || !$config['paid'] || DownloadPayment::configured(),
            'limit' => $limit,
            'used' => $used,
            'remaining' => $limit === 0 ? null : max(0, $limit - $used),
            'purchased' => $purchased,
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleOrder(array $data): array
    {
        $uid = self::requireUser();
        if (!self::enabled()) {
            Response::error('下载功能尚未开启', 404);
        }
        if (!DownloadStore::available()) {
            Response::error('下载数据表尚未初始化，请管理员保存一次主题设置', 503);
        }
        WriteThrottle::guard('download-order', $uid, 30, 60);

        $contentType = self::contentType($data['contentType'] ?? '');
        $contentId = max(0, (int) ($data['contentId'] ?? 0));
        $resource = self::resource($contentType, $contentId, $uid);
        if ($resource === null || ($resource['config']['enabled'] ?? false) !== true) {
            Response::error('资源不存在或未开启下载', 404);
        }

        $config = $resource['config'];
        if (($config['paid'] ?? false) === true) {
            $paid = DownloadStore::latestOrder($uid, $contentType, $contentId, 'paid');
            if ($paid !== null) {
                return ['order' => self::orderPayload($paid)];
            }

            if (!DownloadPayment::configured()) {
                Response::error('付费下载暂不可用，请联系发布者', 403);
            }

            $amount = self::amountCents($config['price'] ?? '0.00');
            if ($amount === null || $amount <= 0) {
                Response::error('付费金额配置无效，请联系发布者', 500);
            }
            $minimum = DownloadPayment::minimumCents();
            if ($amount < $minimum) {
                Response::error(
                    '付费金额不能低于最低支付金额 ¥' . DownloadPayment::minimumAmount(),
                    422,
                    ['price' => '当前资源售价低于站点配置的最低支付金额']
                );
            }

            $pending = DownloadStore::latestOrder($uid, $contentType, $contentId, 'pending');
            if (
                $pending !== null
                && (int) ($pending['amount_cents'] ?? 0) === $amount
                && (string) ($pending['content_url'] ?? '') === (string) $config['url']
            ) {
                return ['order' => self::orderPayload($pending)];
            }

            $order = [
                'number' => self::newOrderNumber(),
                'user_id' => $uid,
                'content_type' => $contentType,
                'content_id' => $contentId,
                'title' => self::clipTitle((string) $resource['title']),
                'content_url' => (string) $config['url'],
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

        $limit = self::freeLimit();
        if ($limit > 0 && self::freeUsed($uid) >= $limit) {
            Response::error('今日免费下载次数已用完', 429, ['remaining' => 0]);
        }

        $order = [
            'number' => self::newOrderNumber(),
            'user_id' => $uid,
            'content_type' => $contentType,
            'content_id' => $contentId,
            'title' => self::clipTitle((string) $resource['title']),
            'content_url' => (string) $config['url'],
            'amount_cents' => 0,
            'status' => 'free',
            'gateway_trade' => null,
            'download_count' => 0,
            'created' => time(),
            'paid_at' => 0,
        ];
        DownloadStore::createOrder($order);

        return ['order' => self::orderPayload($order)];
    }

    /**
     * Settle a pending order with the viewer's account balance.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleBalancePay(array $data): array
    {
        $uid = self::requireUser();
        if (!self::enabled()) {
            Response::error('下载功能尚未开启', 404);
        }
        if (!DownloadStore::available() || !UserEconomy::available()) {
            Response::error('交易数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $number = self::orderNumber($data['orderNumber'] ?? '');
        $order = DownloadStore::orderByNumber($number);
        if ($order === null || (int) ($order['user_id'] ?? 0) !== $uid) {
            Response::error('订单不存在', 404);
        }
        if ((string) ($order['status'] ?? '') === 'paid') {
            return ['order' => self::orderPayload($order)];
        }
        WriteThrottle::guard('download-balance-pay', $uid, 20, 60);

        $paid = UserEconomy::markOrderPaidWithBalance($order, $uid);

        return ['order' => self::orderPayload($paid)];
    }

    /**
     * Settle a pending order with the viewer's points balance.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handlePointsPay(array $data): array
    {
        $uid = self::requireUser();
        if (!self::enabled()) {
            Response::error('下载功能尚未开启', 404);
        }
        if (!DownloadStore::available() || !UserEconomy::available()) {
            Response::error('交易数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $number = self::orderNumber($data['orderNumber'] ?? '');
        $order = DownloadStore::orderByNumber($number);
        if ($order === null || (int) ($order['user_id'] ?? 0) !== $uid) {
            Response::error('订单不存在', 404);
        }
        if ((string) ($order['status'] ?? '') === 'paid') {
            return ['order' => self::orderPayload($order)];
        }
        WriteThrottle::guard('download-points-pay', $uid, 20, 60);

        $paid = UserEconomy::markOrderPaidWithPoints($order, $uid);

        return ['order' => self::orderPayload($paid)];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleStatus(array $data): array
    {
        $uid = self::requireUser();
        if (!self::enabled()) {
            Response::error('下载功能尚未开启', 404);
        }
        if (!DownloadStore::available()) {
            Response::error('下载数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $number = self::orderNumber($data['orderNumber'] ?? '');
        $order = DownloadStore::orderByNumber($number);
        if ($order === null || (int) ($order['user_id'] ?? 0) !== $uid) {
            Response::error('订单不存在', 404);
        }

        return ['order' => self::orderPayload($order)];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleDownload(array $data): array
    {
        $uid = self::requireUser();
        if (!self::enabled()) {
            Response::error('下载功能尚未开启', 404);
        }
        if (!DownloadStore::available()) {
            Response::error('下载数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $number = self::orderNumber($data['orderNumber'] ?? '');

        $result = DownloadStore::transaction($uid, static function () use ($uid, $number): array {
            $order = DownloadStore::orderByNumber($number);
            if ($order === null || (int) ($order['user_id'] ?? 0) !== $uid) {
                return ['error' => '订单不存在', 'status' => 404];
            }

            $status = (string) ($order['status'] ?? '');
            if ($status === 'pending') {
                return ['error' => '订单尚未付款', 'status' => 409];
            }
            if ($status === 'cancelled') {
                return ['error' => '订单已取消，请重新下单', 'status' => 410];
            }
            if (!in_array($status, ['paid', 'free'], true)) {
                return ['error' => '订单状态不可下载', 'status' => 409];
            }

            $limit = self::freeLimit();
            if ($status === 'free' && $limit > 0 && self::freeUsed($uid) >= $limit) {
                return [
                    'error' => '今日免费下载次数已用完',
                    'status' => 429,
                    'errors' => ['remaining' => 0],
                ];
            }

            $url = self::safeUrl((string) ($order['content_url'] ?? ''));
            if ($url === '') {
                return ['error' => '下载链接暂不可用，请联系发布者', 'status' => 422];
            }

            DownloadStore::recordDownload($order, $uid, $status === 'paid');
            $fresh = DownloadStore::orderByNumber($number) ?? $order;
            $used = self::freeUsed($uid);

            return [
                'data' => [
                    'url' => $url,
                    'order' => self::orderPayload($fresh),
                    'remaining' => $limit === 0 ? null : max(0, $limit - $used),
                ],
            ];
        });

        if (isset($result['error'])) {
            Response::error(
                (string) $result['error'],
                (int) ($result['status'] ?? 500),
                is_array($result['errors'] ?? null) ? $result['errors'] : []
            );
        }

        return is_array($result['data'] ?? null) ? $result['data'] : [];
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handleHistory(array $data): array
    {
        $uid = self::requireUser();
        if (!self::enabled()) {
            Response::error('下载功能尚未开启', 404);
        }
        if (!DownloadStore::available()) {
            Response::error('下载数据表尚未初始化，请管理员保存一次主题设置', 503);
        }

        $page = max(1, (int) ($data['page'] ?? 1));
        $pageSize = max(1, min(50, (int) ($data['pageSize'] ?? 10)));
        $history = DownloadStore::history($uid, $page, $pageSize);
        $total = (int) $history['total'];

        return [
            'items' => array_map([self::class, 'orderPayload'], $history['items']),
            'page' => $page,
            'pageSize' => $pageSize,
            'total' => $total,
            'lastPage' => max(1, (int) ceil($total / $pageSize)),
        ];
    }

    /**
     * @param array<string, mixed> $order
     * @return array<string, mixed>
     */
    public static function orderPayload(array $order): array
    {
        $status = (string) ($order['status'] ?? 'pending');
        $paymentOptions = [];
        if ($status === 'pending') {
            try {
                $paymentOptions = DownloadPayment::options($order);
            } catch (\Throwable $exception) {
                error_log('SunkenBoat download checkout failed: ' . $exception->getMessage());
            }
        }
        $paymentUrl = (string) ($paymentOptions[0]['url'] ?? '');

        return [
            'number' => (string) ($order['number'] ?? ''),
            'status' => $status,
            'amount' => self::formatAmount((int) ($order['amount_cents'] ?? 0)),
            'paymentUrl' => $paymentUrl,
            'paymentOptions' => $paymentOptions,
            'createdAt' => (int) ($order['created'] ?? 0),
            'paidAt' => (int) ($order['paid_at'] ?? 0),
            'contentType' => (string) ($order['content_type'] ?? 'article'),
            'contentId' => (int) ($order['content_id'] ?? 0),
            'title' => (string) ($order['title'] ?? ''),
            'contentUrl' => '',
            'downloadCount' => max(0, (int) ($order['download_count'] ?? 0)),
        ];
    }

    public static function paymentNotify(): never
    {
        $input = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST'
            ? $_POST
            : $_GET;

        try {
            $result = DownloadPayment::verify($input);
            if ($result === null) {
                $claimed = (string) ($input['out_trade_no'] ?? '');
                if (preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $claimed) === 1) {
                    error_log(
                        'SunkenBoat payment notification rejected: signature or payload check failed for '
                        . $claimed
                    );
                }
                $order = null;
            } else {
                $order = DownloadStore::markPaid(
                    $result['number'],
                    $result['trade'],
                    $result['amount']
                );
            }
        } catch (\Throwable $exception) {
            // The table may not exist yet on a fresh install; create it once and retry.
            try {
                DownloadStore::install();
                $order = isset($result) && is_array($result)
                    ? DownloadStore::markPaid($result['number'], $result['trade'], $result['amount'])
                    : null;
            } catch (\Throwable $retry) {
                error_log('SunkenBoat payment notification failed: ' . $retry->getMessage());
                $order = null;
            }
        }

        if ($order === null && isset($result) && is_array($result)) {
            error_log(
                'SunkenBoat payment notification could not settle order '
                . $result['number']
                . ' (amount or trade mismatch)'
            );
        }

        if ($order === null) {
            if (!headers_sent()) {
                http_response_code(400);
                header('Content-Type: text/plain; charset=UTF-8');
                header('Cache-Control: no-store');
            }
            echo 'fail';
            exit;
        }

        if (!headers_sent()) {
            header('Content-Type: text/plain; charset=UTF-8');
            header('Cache-Control: no-store');
        }
        echo 'success';
        exit;
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function resource(string $contentType, int $contentId, int $uid): ?array
    {
        if ($contentId <= 0) {
            return null;
        }

        if ($contentType === 'topic') {
            $resource = Forum::downloadResource($contentId, $uid);
            if ($resource === null || !is_array($resource['config'] ?? null)) {
                return null;
            }

            return $resource;
        }

        if ($contentType !== 'article') {
            return null;
        }

        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('cid', 'title', 'authorId')
                    ->from('table.contents')
                    ->where('cid = ?', $contentId)
                    ->where('type = ?', 'post')
                    ->where('status = ?', 'publish')
                    ->where('(password IS NULL OR password = ?)', '')
                    ->limit(1)
            );
        } catch (\Throwable) {
            return null;
        }

        if (!is_array($row)) {
            return null;
        }

        $config = self::articleConfig($contentId);
        if ($config === null) {
            return null;
        }

        return [
            'title' => (string) ($row['title'] ?? ''),
            'url' => '',
            'authorId' => (int) ($row['authorId'] ?? 0),
            'config' => $config,
        ];
    }

    /**
     * @return array{enabled: bool, url: string, paid: bool, price: string}|null
     */
    private static function articleConfig(int $cid): ?array
    {
        try {
            $db = Db::get();
            $rows = $db->fetchAll(
                $db->select('name', 'type', 'str_value', 'int_value', 'float_value')
                    ->from('table.fields')
                    ->where('cid = ?', $cid)
            );
        } catch (\Throwable) {
            return null;
        }

        $values = [];
        foreach ($rows as $row) {
            if (!is_array($row) || !is_string($row['name'] ?? null)) {
                continue;
            }

            $values[$row['name']] = match ((string) ($row['type'] ?? 'str')) {
                'int' => (string) (int) ($row['int_value'] ?? 0),
                'float' => (string) (float) ($row['float_value'] ?? 0.0),
                default => (string) ($row['str_value'] ?? ''),
            };
        }

        try {
            return self::normalizeConfig([
                'enabled' => self::flag($values['Download_Enabled'] ?? false),
                'url' => $values['Download_Url'] ?? '',
                'paid' => self::flag($values['Download_Paid'] ?? false),
                'price' => $values['Download_Price'] ?? '0.00',
            ]);
        } catch (\Throwable) {
            return null;
        }
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

    private static function contentType(mixed $value): string
    {
        $type = is_string($value) ? strtolower(trim($value)) : '';
        if (!in_array($type, ['article', 'topic'], true)) {
            Response::error('资源类型无效', 422, ['contentType' => '仅支持 article 或 topic']);
        }

        return $type;
    }

    private static function orderNumber(mixed $value): string
    {
        $number = is_string($value) ? trim($value) : '';
        if (preg_match('/^SK[0-9]{14}[A-F0-9]{16}$/D', $number) !== 1) {
            Response::error('订单号无效', 422, ['orderNumber' => '订单号格式不正确']);
        }

        return $number;
    }

    private static function newOrderNumber(): string
    {
        return 'SK' . date('YmdHis') . strtoupper(bin2hex(random_bytes(8)));
    }

    private static function clipTitle(string $title): string
    {
        $title = trim(preg_replace('/\s+/u', ' ', $title) ?? '');
        if ($title === '') {
            return '未命名资源';
        }

        return function_exists('mb_substr')
            ? mb_substr($title, 0, 180, 'UTF-8')
            : substr($title, 0, 180);
    }

    private static function freeLimit(): int
    {
        $value = (int) (Settings::values()['Downloads_Free_Daily_Limit'] ?? 3);

        return max(0, min(10000, $value));
    }

    private static function freeUsed(int $uid): int
    {
        return DownloadStore::freeUsedToday($uid);
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function purchased(int $uid, string $contentType, int $contentId): ?array
    {
        return DownloadStore::latestOrder($uid, $contentType, $contentId, 'paid');
    }

    public static function safeUrl(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $url = trim($value);
        if (
            $url === ''
            || strlen($url) > 2048
            || preg_match('/[\x00-\x20\x7f\\\\]/', $url) === 1
            || filter_var($url, FILTER_VALIDATE_URL) === false
        ) {
            return '';
        }

        $parts = parse_url($url);
        if (
            !is_array($parts)
            || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || empty($parts['host'])
            || array_key_exists('user', $parts)
            || array_key_exists('pass', $parts)
        ) {
            return '';
        }

        return $url;
    }

    private static function isContentWritePath(string $path): bool
    {
        return in_array($path, ['admin/posts', 'admin/pages', 'admin/contents'], true)
            || preg_match('#^admin/(?:posts|pages|contents)/[0-9]+$#D', $path) === 1;
    }

    /**
     * @return array<string, mixed>
     */
    private static function cachedJsonBody(): array
    {
        $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($declared > Request::MAX_BODY_BYTES) {
            Response::error('Request body is too large', 413);
        }

        $raw = file_get_contents('php://input');
        if (!is_string($raw)) {
            Response::error('Unable to read the request body', 400);
        }
        if (strlen($raw) > Request::MAX_BODY_BYTES) {
            Response::error('Request body is too large', 413);
        }

        Request::setBody($raw);

        return Payload::body();
    }

    private static function flag(mixed $value): bool
    {
        return in_array($value, [true, 1, '1', 'true', 'on', 'yes'], true);
    }
}
