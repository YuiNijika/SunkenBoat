<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * Result of consuming an OAuth callback.
 */
final class CallbackResult
{
    public const BOUND = 'bound';

    public const LOGIN = 'login';

    public const UNBOUND = 'unbound';

    public const ERROR = 'error';

    public function __construct(
        public readonly string $status,
        public readonly string $provider,
        public readonly ?Identity $identity = null,
        public readonly int $uid = 0,
        public readonly int $boundUid = 0,
        public readonly string $error = '',
    ) {
    }

    public static function error(string $provider, string $error): self
    {
        return new self(self::ERROR, $provider, null, 0, 0, $error);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'status' => $this->status,
            'provider' => $this->provider,
            'identity' => $this->identity?->toArray(),
            'uid' => $this->uid,
            'boundUid' => $this->boundUid,
            'error' => $this->error,
        ];
    }
}
