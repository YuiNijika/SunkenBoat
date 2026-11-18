<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * A provider only describes one OAuth service's protocol differences.
 *
 * State, PKCE generation, binding and callback decisions belong to Flow.
 */
interface ProviderInterface
{
    public function id(): string;

    /**
     * Stable callback path segment. Aggregate providers keep one callback
     * address even when the same service exposes several login types.
     */
    public function callbackId(): string;

    public function label(): string;

    public function description(): string;

    /**
     * @return list<string>
     */
    public function defaultScopes(): array;

    public function usesPkce(): bool;

    /**
     * Some aggregate login services sign the callback query instead of
     * returning an authorization code.
     */
    public function requiresCode(): bool;

    /**
     * Zibll's agent callback signs its payload but does not echo the state
     * parameter. The state cookie is still required and verified by Flow.
     */
    public function requiresStateEcho(): bool;

    /**
     * @param array<string, mixed> $config
     */
    public function authorizeUrl(
        array $config,
        string $redirectUri,
        string $state,
        ?string $codeChallenge = null
    ): string;

    /**
     * @param array<string, mixed> $config
     */
    public function exchange(
        array $config,
        string $code,
        string $redirectUri,
        ?string $codeVerifier = null
    ): ?Token;

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity;
}
