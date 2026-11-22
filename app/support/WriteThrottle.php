<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Http\Response;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Small fixed-window limiter for authenticated write actions.
 *
 * Rows live in Typecho options and contain no IP address, token or request
 * body. A database failure fails open so a cache table problem never blocks
 * normal publishing or account operations.
 */
final class WriteThrottle
{
    private const PREFIX = 'sunken_wt_';

    public static function guard(string $action, int $uid, int $limit, int $window): void
    {
        if ($uid <= 0 || $limit <= 0 || $window <= 0) {
            return;
        }

        $now = time();
        $record = null;

        try {
            $record = self::read($action, $uid);
        } catch (\Throwable) {
            return;
        }

        $started = (int) ($record['started'] ?? 0);
        $count = (int) ($record['count'] ?? 0);
        if ($started <= 0 || $started + $window <= $now) {
            $started = $now;
            $count = 0;
        }

        if ($count >= $limit) {
            Response::error('操作过于频繁，请稍后再试', 429, [
                'retryAfter' => max(1, $started + $window - $now),
            ]);
        }

        try {
            self::write($action, $uid, $started, $count + 1, $record !== null);
        } catch (\Throwable) {
            // Throttling is a safety net, not a prerequisite for the action.
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function read(string $action, int $uid): ?array
    {
        $db = Db::get();
        $row = $db->fetchRow(
            $db->select('value')
                ->from('table.options')
                ->where('name = ?', self::key($action, $uid))
                ->where('user = ?', $uid)
                ->limit(1)
        );
        if (!is_array($row)) {
            return null;
        }

        $decoded = json_decode((string) ($row['value'] ?? ''), true);

        return is_array($decoded) ? $decoded : null;
    }

    private static function write(
        string $action,
        int $uid,
        int $started,
        int $count,
        bool $exists
    ): void {
        $db = Db::get();
        $value = json_encode([
            'started' => $started,
            'count' => $count,
        ], JSON_UNESCAPED_SLASHES);
        if (!is_string($value)) {
            return;
        }

        $name = self::key($action, $uid);
        if ($exists) {
            $db->query(
                $db->update('table.options')
                    ->rows(['value' => $value])
                    ->where('name = ?', $name)
                    ->where('user = ?', $uid)
            );
            return;
        }

        $db->query($db->insert('table.options')->rows([
            'name' => $name,
            'value' => $value,
            'user' => $uid,
        ]));
    }

    private static function key(string $action, int $uid): string
    {
        $seed = hash('sha256', $action . '|' . $uid);

        return self::PREFIX . substr($seed, 0, 20);
    }
}
