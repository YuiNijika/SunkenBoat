<?php

declare(strict_types=1);

namespace SunkenBoat\Support;

use TTDF\Hooks\Hooks;
use TTDF\Http\Response;
use TTDF\Http\Rest\V2\Payload;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * The v2 writer tier is editor-and-above, which is right for the Typecho
 * admin but too broad for the front-end user center. A signed-in editor must
 * only see and manage their own posts there; administrators keep full access.
 */
final class ContentGuard
{
    public static function register(): void
    {
        Hooks::addAction('rest.v2.auth', [self::class, 'guard']);
    }

    /**
     * @param array<string, mixed> $identity
     */
    public static function guard(
        array $identity,
        string $tier,
        string $path,
        string $method
    ): void {
        if ($tier !== 'writer' || (string) ($identity['group'] ?? '') === 'administrator') {
            return;
        }

        $uid = (int) ($identity['uid'] ?? 0);
        if ($uid <= 0) {
            return;
        }

        $method = strtoupper($method);

        // The framework's writer tier maps to Typecho's editor group. The
        // theme setting may narrow front-end publishing to administrators, so
        // enforce it on every content endpoint instead of relying on the UI.
        if (
            preg_match('#^admin/(?:contents|posts|pages)(?:/|$)#D', $path) === 1
            && !UserProfile::canWriteGroup((string) ($identity['group'] ?? ''))
        ) {
            Response::error('Front-end publishing is not enabled for this account', 403);
        }

        if ($path === 'admin/contents') {
            if ($method === 'GET') {
                // The listing already supports a server-side author filter;
                // pin it so an editor cannot enumerate other authors' drafts.
                $_GET['authorId'] = (string) $uid;
            }

            return;
        }

        if (
            preg_match('#^admin/(?:contents|posts|pages)/([1-9][0-9]*)$#D', $path, $matches) === 1
        ) {
            $authorId = self::authorOf((int) $matches[1]);
            if ($authorId !== null && $authorId !== $uid) {
                Response::error('You can only manage your own content', 403);
            }

            if ($method !== 'GET') {
                self::assertAuthor($identity);
            }

            return;
        }

        if ($method === 'POST' && in_array($path, ['admin/posts', 'admin/pages'], true)) {
            self::assertAuthor($identity);
        }
    }

    /**
     * Editors may keep the default author (themselves) but must not reassign
     * a post to another account from the front end.
     *
     * @param array<string, mixed> $identity
     */
    private static function assertAuthor(array $identity): void
    {
        $body = Payload::body();
        if (!array_key_exists('authorId', $body)) {
            return;
        }

        $authorId = is_scalar($body['authorId']) ? (int) $body['authorId'] : 0;
        if ($authorId > 0 && $authorId !== (int) ($identity['uid'] ?? 0)) {
            Response::error('You cannot assign this content to another author', 403);
        }
    }

    private static function authorOf(int $cid): ?int
    {
        try {
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('authorId')
                    ->from('table.contents')
                    ->where('cid = ?', $cid)
                    ->limit(1)
            );
        } catch (\Throwable) {
            Response::error('Unable to verify content ownership', 500);
        }

        return is_array($row) ? (int) ($row['authorId'] ?? 0) : null;
    }
}
