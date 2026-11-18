<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

use InvalidArgumentException;

/**
 * Provider-neutral identity returned after a successful OAuth callback.
 */
final class Identity
{
    /**
     * @param array<string, mixed> $raw
     */
    public function __construct(
        public readonly string $provider,
        public readonly string $subject,
        public readonly string $name = '',
        public readonly string $avatar = '',
        public readonly string $email = '',
        public readonly array $raw = [],
    ) {
        if (trim($provider) === '' || trim($subject) === '') {
            throw new InvalidArgumentException('OAuth identity requires a provider and subject');
        }
    }

    /**
     * @return array<string, string>
     */
    public function toArray(): array
    {
        return [
            'provider' => $this->provider,
            'sub' => $this->subject,
            'name' => $this->name,
            'avatar' => $this->avatar,
            'email' => $this->email,
        ];
    }
}
