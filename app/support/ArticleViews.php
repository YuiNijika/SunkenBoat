<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Compat\Typecho;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Counts article reads in Typecho's own fields table.
 *
 * Typecho does not ship a view counter, and adding a column to contents would
 * require a runtime schema migration. The fields table already has a unique
 * (cid, name) index, so it can store the counter without touching core tables.
 */
final class ArticleViews
{
    private const FIELD = 'viewsNum';

    private const COOKIE = 'sunken_views';

    private const COOKIE_TTL = 31536000;

    private const COOKIE_LIMIT = 60;

    /** @var array<int, int> */
    private static array $counts = [];

    public static function record(int $cid): int
    {
        if ($cid <= 0) {
            return 0;
        }

        $count = self::count($cid);
        if (self::hasViewed($cid)) {
            return $count;
        }

        self::increment($cid);
        self::remember($cid);
        self::$counts[$cid] = $count + 1;

        return self::$counts[$cid];
    }

    public static function count(int $cid): int
    {
        if ($cid <= 0) {
            return 0;
        }

        if (isset(self::$counts[$cid])) {
            return self::$counts[$cid];
        }

        $counts = self::load([$cid]);

        return self::$counts[$cid] = $counts[$cid] ?? 0;
    }

    /**
     * @param list<int> $cids
     * @return array<int, int>
     */
    public static function counts(array $cids): array
    {
        $cids = array_values(array_unique(array_filter(
            array_map('intval', $cids),
            static fn (int $cid): bool => $cid > 0
        )));

        $missing = array_values(array_filter(
            $cids,
            static fn (int $cid): bool => !isset(self::$counts[$cid])
        ));

        if ($missing !== []) {
            foreach (self::load($missing) as $cid => $count) {
                self::$counts[$cid] = $count;
            }

            foreach ($missing as $cid) {
                self::$counts[$cid] ??= 0;
            }
        }

        $result = [];
        foreach ($cids as $cid) {
            $result[$cid] = self::$counts[$cid];
        }

        return $result;
    }

    /**
     * @param list<int> $cids
     * @return array<int, int>
     */
    private static function load(array $cids): array
    {
        if ($cids === [] || !class_exists('Typecho\\Db')) {
            return [];
        }

        try {
            $db = \Typecho\Db::get();
            $rows = $db->fetchAll(
                $db->select('cid', 'int_value')
                    ->from('table.fields')
                    ->where('name = ?', self::FIELD)
                    ->where('cid IN ?', $cids)
            );
        } catch (\Throwable $exception) {
            error_log('SunkenBoat view count read failed: ' . $exception->getMessage());

            return [];
        }

        $counts = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $cid = (int) ($row['cid'] ?? 0);
            if ($cid > 0) {
                $counts[$cid] = max(0, (int) ($row['int_value'] ?? 0));
            }
        }

        return $counts;
    }

    private static function increment(int $cid): void
    {
        if (!class_exists('Typecho\\Db')) {
            return;
        }

        try {
            $db = \Typecho\Db::get();
            $affected = $db->query(
                $db->update('table.fields')
                    ->rows([
                        'type' => 'int',
                        'str_value' => null,
                        'float_value' => 0,
                    ])
                    ->expression('int_value', 'int_value + 1')
                    ->where('cid = ?', $cid)
                    ->where('name = ?', self::FIELD)
            );

            if ($affected > 0) {
                return;
            }

            try {
                $db->query(
                    $db->insert('table.fields')->rows([
                        'cid' => $cid,
                        'name' => self::FIELD,
                        'type' => 'int',
                        'str_value' => null,
                        'int_value' => 1,
                        'float_value' => 0,
                    ])
                );
            } catch (\Throwable) {
                $db->query(
                    $db->update('table.fields')
                        ->rows([
                            'type' => 'int',
                            'str_value' => null,
                            'float_value' => 0,
                        ])
                        ->expression('int_value', 'int_value + 1')
                        ->where('cid = ?', $cid)
                        ->where('name = ?', self::FIELD)
                );
            }
        } catch (\Throwable $exception) {
            error_log('SunkenBoat view count write failed: ' . $exception->getMessage());
        }
    }

    private static function hasViewed(int $cid): bool
    {
        return in_array($cid, self::viewed(), true);
    }

    /**
     * @return list<int>
     */
    private static function viewed(): array
    {
        $raw = Typecho::cookie(self::COOKIE);
        if ($raw === '') {
            return [];
        }

        $seen = [];
        foreach (explode(',', $raw) as $value) {
            if (ctype_digit($value)) {
                $seen[] = (int) $value;
            }
        }

        return array_values(array_unique($seen));
    }

    private static function remember(int $cid): void
    {
        $seen = self::viewed();
        if (in_array($cid, $seen, true)) {
            return;
        }

        $seen[] = $cid;
        $seen = array_slice($seen, -self::COOKIE_LIMIT);

        Typecho::setCookie(
            self::COOKIE,
            implode(',', array_map('strval', $seen)),
            self::COOKIE_TTL
        );
    }
}
