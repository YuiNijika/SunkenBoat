<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * Persistence boundary for provider bindings.
 */
interface BindingStore
{
    /**
     * @return array{sub: string, name: string, avatar: string, email: string, boundAt: int}|null
     */
    public function get(int $uid, string $provider): ?array;

    public function save(int $uid, string $provider, Identity $identity): void;

    public function delete(int $uid, string $provider): void;

    public function owner(string $provider, string $subject): int;

    /**
     * @return array<string, array{sub: string, name: string, avatar: string, email: string, boundAt: int}>
     */
    public function all(int $uid): array;
}
