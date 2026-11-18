<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

use InvalidArgumentException;

/**
 * Normalized OAuth access token.
 */
final class Token
{
    /**
     * @param array<string, mixed> $raw
     */
    public function __construct(
        public readonly string $accessToken,
        public readonly string $refreshToken = '',
        public readonly int $expiresIn = 0,
        public readonly string $scope = '',
        public readonly array $raw = [],
    ) {
        if (trim($accessToken) === '') {
            throw new InvalidArgumentException('OAuth access token cannot be empty');
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'accessToken' => $this->accessToken,
            'refreshToken' => $this->refreshToken,
            'expiresIn' => $this->expiresIn,
            'scope' => $this->scope,
        ];
    }
}
