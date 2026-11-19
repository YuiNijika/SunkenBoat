<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Ajax\Endpoint;
use TTDF\Http\Response;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Administrator batch updates for article metadata that Typecho does not
 * expose in its native contents table. Values are stored in the fields table,
 * which keeps the core schema untouched.
 */
final class ArticleBatch
{
    private const MAX_IDS = 100;

    private const MAX_VALUE = 1000000000;

    public static function register(): void
    {
        Endpoint::register('article-batch', [self::class, 'handle'], [
            'auth' => 'admin',
            'method' => 'POST',
        ]);
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function handle(array $data): array
    {
        $ids = [];
        foreach ((array) ($data['ids'] ?? []) as $value) {
            $cid = is_numeric($value) ? (int) $value : 0;
            if ($cid > 0) {
                $ids[$cid] = $cid;
            }
            if (count($ids) >= self::MAX_IDS) {
                break;
            }
        }

        if ($ids === []) {
            Response::error('请选择要处理的文章', 422, ['ids' => '至少选择一篇文章']);
        }

        $views = array_key_exists('views', $data) ? self::number($data['views']) : null;
        $likes = array_key_exists('likes', $data) ? self::number($data['likes']) : null;
        $layout = array_key_exists('layout', $data) ? trim((string) $data['layout']) : null;

        if ($views === null && $likes === null && $layout === null) {
            Response::error('没有需要更新的内容', 422);
        }
        if ($layout !== null && !in_array($layout, ['default', 'wide', 'narrow'], true)) {
            Response::error('文章布局无效', 422, ['layout' => '请选择有效布局']);
        }

        $db = Db::get();
        $updated = 0;

        foreach ($ids as $cid) {
            $row = $db->fetchRow(
                $db->select('cid', 'type')
                    ->from('table.contents')
                    ->where('cid = ?', $cid)
                    ->limit(1)
            );
            if (!is_array($row) || !in_array((string) ($row['type'] ?? ''), ['post', 'post_draft'], true)) {
                continue;
            }

            if ($views !== null) {
                self::writeInt($db, $cid, 'viewsNum', $views);
            }
            if ($likes !== null) {
                self::writeInt($db, $cid, 'likesNum', $likes);
            }
            if ($layout !== null) {
                self::writeString($db, $cid, 'Display_Layout', $layout);
            }
            $updated++;
        }

        return [
            'updated' => $updated,
            'views' => $views,
            'likes' => $likes,
            'layout' => $layout,
        ];
    }

    private static function number(mixed $value): int
    {
        if (!is_numeric($value)) {
            Response::error('数值格式无效', 422);
        }

        return max(0, min(self::MAX_VALUE, (int) $value));
    }

    private static function writeInt(Db $db, int $cid, string $name, int $value): void
    {
        $exists = self::exists($db, $cid, $name);
        $rows = [
            'type' => 'int',
            'str_value' => null,
            'int_value' => $value,
            'float_value' => 0,
        ];

        if ($exists) {
            $db->query(
                $db->update('table.fields')
                    ->rows($rows)
                    ->where('cid = ?', $cid)
                    ->where('name = ?', $name)
            );
            return;
        }

        $db->query($db->insert('table.fields')->rows([
            'cid' => $cid,
            'name' => $name,
            ...$rows,
        ]));
    }

    private static function writeString(Db $db, int $cid, string $name, string $value): void
    {
        $exists = self::exists($db, $cid, $name);
        $rows = [
            'type' => 'str',
            'str_value' => $value,
            'int_value' => 0,
            'float_value' => 0,
        ];

        if ($exists) {
            $db->query(
                $db->update('table.fields')
                    ->rows($rows)
                    ->where('cid = ?', $cid)
                    ->where('name = ?', $name)
            );
            return;
        }

        $db->query($db->insert('table.fields')->rows([
            'cid' => $cid,
            'name' => $name,
            ...$rows,
        ]));
    }

    private static function exists(Db $db, int $cid, string $name): bool
    {
        $row = $db->fetchRow(
            $db->select('cid')
                ->from('table.fields')
                ->where('cid = ?', $cid)
                ->where('name = ?', $name)
                ->limit(1)
        );

        return is_array($row);
    }
}
