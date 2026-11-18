<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * Short-lived browser state used to protect the authorization callback.
 */
interface StateStore
{
    public function read(string $name): string;

    public function write(string $name, string $value, int $ttl): void;

    public function delete(string $name): void;
}
