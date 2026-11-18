<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

use InvalidArgumentException;
use Typecho\Db;

/**
 * Stores bindings as user-scoped Typecho options.
 *
 * The users table is intentionally left untouched. Social identities are
 * small, optional JSON documents and user options are a native Typecho
 * facility for this kind of per-user metadata.
 */
final class TypechoBindingStore implements BindingStore
{
    public const OPTION_PREFIX = '_ttdf_oauth_';

    public function get(int $uid, string $provider): ?array
    {
        if ($uid <= 0) {
            return null;
        }

        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('value')
                ->from('table.options')
                ->where('name = ?', $this->optionName($provider))
                ->where('user = ?', $uid)
                ->limit(1)
        );

        return $this->decode((string) ($rows[0]['value'] ?? ''));
    }

    public function save(int $uid, string $provider, Identity $identity): void
    {
        if ($uid <= 0) {
            throw new InvalidArgumentException('OAuth binding requires a user');
        }

        $db = Db::get();
        $name = $this->optionName($provider);
        $encoded = json_encode([
            'sub' => $identity->subject,
            'name' => $identity->name,
            'avatar' => $identity->avatar,
            'email' => $identity->email,
            'boundAt' => time(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        if (!is_string($encoded)) {
            throw new InvalidArgumentException('Unable to encode OAuth binding');
        }

        $exists = $db->fetchObject(
            $db->select('COUNT(*) AS num')
                ->from('table.options')
                ->where('name = ?', $name)
                ->where('user = ?', $uid)
        );

        if ((int) ($exists->num ?? 0) > 0) {
            $db->query(
                $db->update('table.options')
                    ->rows(['value' => $encoded])
                    ->where('name = ?', $name)
                    ->where('user = ?', $uid)
            );
            return;
        }

        $db->query($db->insert('table.options')->rows([
            'name' => $name,
            'value' => $encoded,
            'user' => $uid,
        ]));
    }

    public function delete(int $uid, string $provider): void
    {
        if ($uid <= 0) {
            return;
        }

        $db = Db::get();
        $db->query(
            $db->delete('table.options')
                ->where('name = ?', $this->optionName($provider))
                ->where('user = ?', $uid)
        );
    }

    public function owner(string $provider, string $subject): int
    {
        $subject = trim($subject);
        if ($subject === '') {
            return 0;
        }

        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('user', 'value')
                ->from('table.options')
                ->where('name = ?', $this->optionName($provider))
        );

        foreach ($rows as $row) {
            $binding = $this->decode((string) ($row['value'] ?? ''));
            if ($binding !== null && hash_equals($subject, $binding['sub'])) {
                return (int) ($row['user'] ?? 0);
            }
        }

        return 0;
    }

    public function all(int $uid): array
    {
        if ($uid <= 0) {
            return [];
        }

        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('name', 'value')
                ->from('table.options')
                ->where('user = ?', $uid)
        );

        $bindings = [];
        foreach ($rows as $row) {
            $name = (string) ($row['name'] ?? '');
            if (!str_starts_with($name, self::OPTION_PREFIX)) {
                continue;
            }

            $provider = substr($name, strlen(self::OPTION_PREFIX));
            if (preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $provider) !== 1) {
                continue;
            }

            $binding = $this->decode((string) ($row['value'] ?? ''));
            if ($binding !== null) {
                $bindings[$provider] = $binding;
            }
        }

        return $bindings;
    }

    /**
     * @return array{sub: string, name: string, avatar: string, email: string, boundAt: int}|null
     */
    private function decode(string $raw): ?array
    {
        $decoded = json_decode($raw, true);
        if (!is_array($decoded) || !is_string($decoded['sub'] ?? null) || trim($decoded['sub']) === '') {
            return null;
        }

        return [
            'sub' => (string) $decoded['sub'],
            'name' => $this->text($decoded['name'] ?? ''),
            'avatar' => $this->url($decoded['avatar'] ?? ''),
            'email' => $this->email($decoded['email'] ?? ''),
            'boundAt' => (int) ($decoded['boundAt'] ?? 0),
        ];
    }

    private function optionName(string $provider): string
    {
        if (preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $provider) !== 1) {
            throw new InvalidArgumentException('Invalid OAuth provider identifier');
        }

        return self::OPTION_PREFIX . $provider;
    }

    private function text(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim(strip_tags($value));
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, 32, 'UTF-8');
        }

        return substr($value, 0, 32);
    }

    private function url(mixed $value): string
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

    private function email(mixed $value): string
    {
        if (!is_string($value)) {
            return '';
        }

        $value = trim($value);
        return filter_var($value, FILTER_VALIDATE_EMAIL) === false ? '' : $value;
    }
}
