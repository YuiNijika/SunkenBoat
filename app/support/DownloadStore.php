<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

final class DownloadStore
{
    private static bool $installed = false;

    public static function install(): bool
    {
        if (self::$installed) {
            return true;
        }

        try {
            $db = Db::get();
            $driver = self::driver();
            $prefix = $db->getPrefix();
            $quote = static fn (string $name): string => $driver === 'mysql'
                ? '`' . str_replace('`', '', $name) . '`'
                : '"' . str_replace('"', '', $name) . '"';
            $orders = $quote($prefix . 'sunken_download_orders');
            $records = $quote($prefix . 'sunken_download_records');
            $identity = match ($driver) {
                'mysql' => 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY',
                'pgsql' => 'BIGSERIAL PRIMARY KEY',
                default => 'INTEGER PRIMARY KEY AUTOINCREMENT',
            };
            $suffix = $driver === 'mysql' ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
            $db->query('CREATE TABLE IF NOT EXISTS ' . $orders . ' (
                id ' . $identity . ',
                number VARCHAR(40) NOT NULL UNIQUE,
                user_id INTEGER NOT NULL,
                content_type VARCHAR(12) NOT NULL,
                content_id INTEGER NOT NULL,
                title VARCHAR(200) NOT NULL,
                content_url TEXT NOT NULL,
                amount_cents INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(16) NOT NULL,
                gateway_trade VARCHAR(100) UNIQUE,
                download_count INTEGER NOT NULL DEFAULT 0,
                created INTEGER NOT NULL,
                paid_at INTEGER NOT NULL DEFAULT 0
            )' . $suffix, Db::WRITE, '');
            $db->query('CREATE TABLE IF NOT EXISTS ' . $records . ' (
                id ' . $identity . ',
                order_number VARCHAR(40) NOT NULL,
                user_id INTEGER NOT NULL,
                content_type VARCHAR(12) NOT NULL,
                content_id INTEGER NOT NULL,
                paid INTEGER NOT NULL DEFAULT 0,
                created INTEGER NOT NULL
            )' . $suffix, Db::WRITE, '');

            $indexes = [
                [$prefix . 'sunken_download_orders_user', $orders, 'user_id, created'],
                [$prefix . 'sunken_download_orders_resource', $orders, 'user_id, content_type, content_id, status'],
                [$prefix . 'sunken_download_records_quota', $records, 'user_id, paid, created'],
                [$prefix . 'sunken_download_records_order', $records, 'order_number, created'],
            ];
            foreach ($indexes as [$name, $table, $columns]) {
                if ($driver === 'mysql') {
                    $existing = $db->fetchAll($db->query('SHOW INDEX FROM ' . $table, Db::WRITE));
                    foreach ($existing as $row) {
                        if (is_array($row) && (string) ($row['Key_name'] ?? '') === $name) {
                            continue 2;
                        }
                    }
                }
                $db->query('CREATE INDEX ' . ($driver === 'mysql' ? '' : 'IF NOT EXISTS ')
                    . $quote($name) . ' ON ' . $table . ' (' . $columns . ')', Db::WRITE, '');
            }

            return self::$installed = true;
        } catch (\Throwable $exception) {
            error_log('SunkenBoat download installation failed: ' . $exception->getMessage());

            return false;
        }
    }

    /**
     * Check schema availability without running DDL. User-facing requests must
     * use this method; installation is reserved for admin save/install paths.
     */
    public static function available(): bool
    {
        if (self::$installed) {
            return true;
        }

        try {
            $db = Db::get();
            $db->fetchRow(
                $db->select('number')
                    ->from('table.sunken_download_orders')
                    ->limit(1)
            );
            $db->fetchRow(
                $db->select('id')
                    ->from('table.sunken_download_records')
                    ->limit(1)
            );
        } catch (\Throwable) {
            return false;
        }

        return self::$installed = true;
    }

    public static function driver(): string
    {
        $db = Db::get();
        $driver = strtolower($db->getAdapter()->getDriver() ?: $db->getAdapterName());

        return match ($driver) {
            'mysqli', 'pdo_mysql' => 'mysql',
            'sqlite3', 'pdo_sqlite' => 'sqlite',
            'postgres', 'postgresql', 'pdo_pgsql' => 'pgsql',
            default => $driver,
        };
    }

    public static function transaction(int $uid, callable $operation): mixed
    {
        $db = Db::get();
        $db->query(self::driver() === 'sqlite' ? 'BEGIN IMMEDIATE'
            : (self::driver() === 'mysql' ? 'START TRANSACTION' : 'BEGIN'), Db::WRITE, '');

        try {
            $db->query($db->update('table.users')->expression('uid', 'uid')->where('uid = ?', $uid));
            $result = $operation();
            if (is_array($result) && isset($result['error']) && (string) $result['error'] !== '') {
                $db->query('ROLLBACK', Db::WRITE, '');

                return $result;
            }
            $db->query('COMMIT', Db::WRITE, '');

            return $result;
        } catch (\Throwable $exception) {
            $db->query('ROLLBACK', Db::WRITE, '');
            throw $exception;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function orderByNumber(string $number): ?array
    {
        return self::fetchOne(
            Db::get()->select('*')
                ->from('table.sunken_download_orders')
                ->where('number = ?', $number)
                ->limit(1)
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function latestOrder(
        int $uid,
        string $contentType,
        int $contentId,
        ?string $status = null
    ): ?array {
        $select = Db::get()->select('*')
            ->from('table.sunken_download_orders')
            ->where('user_id = ?', $uid)
            ->where('content_type = ?', $contentType)
            ->where('content_id = ?', $contentId);
        if ($status !== null) {
            $select->where('status = ?', $status);
        }

        return self::fetchOne($select->order('id', Db::SORT_DESC)->limit(1));
    }

    /**
     * Paid content blocks share the download order table. A single article or
     * topic can contain several blocks, so callers need every order for the
     * resource instead of only the newest row.
     *
     * @return list<array<string, mixed>>
     */
    public static function blockOrders(
        int $uid,
        string $contentType,
        int $contentId,
        ?string $status = null
    ): array {
        $select = Db::get()->select('*')
            ->from('table.sunken_download_orders')
            ->where('user_id = ?', $uid)
            ->where('content_type = ?', $contentType)
            ->where('content_id = ?', $contentId);
        if ($status !== null) {
            $select->where('status = ?', $status);
        }

        $rows = Db::get()->fetchAll($select->order('id', Db::SORT_ASC));
        $orders = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                $orders[] = $row;
            }
        }

        return $orders;
    }

    /**
     * @param array<string, mixed> $order
     */
    public static function createOrder(array $order): int
    {
        return (int) Db::get()->query(
            Db::get()->insert('table.sunken_download_orders')->rows($order)
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function markPaid(
        string $number,
        string $trade,
        int $amount,
        bool $allowReplay = true
    ): ?array
    {
        $db = Db::get();
        $order = self::orderByNumber($number);
        if ($order === null || (int) ($order['amount_cents'] ?? 0) !== $amount) {
            return null;
        }

        if ((string) ($order['status'] ?? '') === 'paid') {
            // Gateway retries may arrive seconds apart, and some providers
            // reissue a different trade id on retry. The order is already
            // settled, so acknowledge it instead of triggering endless retries.
            return $allowReplay ? $order : null;
        }

        if ((string) ($order['status'] ?? '') !== 'pending') {
            return null;
        }

        $duplicate = self::fetchOne(
            $db->select('number')
                ->from('table.sunken_download_orders')
                ->where('gateway_trade = ?', $trade)
                ->limit(1)
        );
        if ($duplicate !== null && (string) ($duplicate['number'] ?? '') !== $number) {
            return null;
        }

        $paidAt = time();
        $affected = (int) $db->query(
            $db->update('table.sunken_download_orders')
                ->rows([
                    'status' => 'paid',
                    'gateway_trade' => $trade,
                    'paid_at' => $paidAt,
                ])
                ->where('number = ?', $number)
                ->where('status = ?', 'pending')
        );
        if ($affected <= 0) {
            $current = self::orderByNumber($number);

            if (
                $allowReplay
                && $current !== null
                && (string) ($current['status'] ?? '') === 'paid'
                && (int) ($current['amount_cents'] ?? 0) === $amount
            ) {
                return $current;
            }

            return null;
        }

        // Reads use Typecho's READ connection, which cannot see the uncommitted
        // UPDATE of this transaction. Return the row we just wrote instead of
        // re-selecting inside the transaction.
        return array_replace($order, [
            'status' => 'paid',
            'gateway_trade' => $trade,
            'paid_at' => $paidAt,
        ]);
    }

    public static function freeUsedToday(int $uid): int
    {
        $start = strtotime('today');
        $count = self::fetchOne(
            Db::get()->select('COUNT(*) AS total')
                ->from('table.sunken_download_records')
                ->where('user_id = ?', $uid)
                ->where('paid = ?', 0)
                ->where('created >= ?', $start === false ? 0 : $start)
        );

        return (int) ($count['total'] ?? 0);
    }

    public static function recordDownload(
        array $order,
        int $uid,
        bool $paid
    ): void {
        $db = Db::get();
        $db->query($db->insert('table.sunken_download_records')->rows([
            'order_number' => (string) $order['number'],
            'user_id' => $uid,
            'content_type' => (string) $order['content_type'],
            'content_id' => (int) $order['content_id'],
            'paid' => $paid ? 1 : 0,
            'created' => time(),
        ]));
        $db->query(
            $db->update('table.sunken_download_orders')
                ->expression('download_count', 'download_count + 1', false)
                ->where('number = ?', (string) $order['number'])
        );
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public static function history(int $uid, int $page, int $pageSize): array
    {
        $db = Db::get();
        $page = max(1, $page);
        $pageSize = max(1, min(50, $pageSize));
        $offset = ($page - 1) * $pageSize;
        $count = self::fetchOne(
            $db->select('COUNT(*) AS total')
                ->from('table.sunken_download_orders')
                ->where('user_id = ?', $uid)
                ->where('content_type <> ?', 'paid')
        );
        $rows = $db->fetchAll(
            $db->select('*')
                ->from('table.sunken_download_orders')
                ->where('user_id = ?', $uid)
                ->where('content_type <> ?', 'paid')
                ->order('id', Db::SORT_DESC)
                ->offset($offset)
                ->limit($pageSize)
        );

        return [
            'items' => array_values(array_filter($rows, 'is_array')),
            'total' => (int) ($count['total'] ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function fetchOne(\Typecho\Db\Query $query): ?array
    {
        $row = Db::get()->fetchRow($query);

        return is_array($row) ? $row : null;
    }
}
