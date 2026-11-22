<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

use InvalidArgumentException;

/**
 * Authorization-code flow shared by every provider.
 *
 * The Flow owns state, PKCE, token exchange, identity lookup and the
 * decision between binding, login and first-time registration. Providers only
 * implement their endpoint and payload differences.
 */
final class Flow
{
    public const STATE_COOKIE = 'ttdf_oauth_state';

    public const STATE_TTL = 600;

    private readonly \Closure $clock;

    /**
     * @param array<string, mixed> $config
     */
    public function __construct(
        private readonly ProviderRegistry $registry,
        private readonly BindingStore $bindings,
        private readonly array $config,
        private readonly string $callbackBase,
        private readonly string $stateSecret,
        private readonly StateStore $states,
        ?callable $clock = null,
    ) {
        $this->clock = $clock === null
            ? static fn (): int => time()
            : \Closure::fromCallable($clock);
    }

    public function isEnabled(): bool
    {
        return ($this->config['enabled'] ?? false) === true && $this->providers() !== [];
    }

    /**
     * @return list<ProviderInterface>
     */
    public function providers(): array
    {
        $providers = [];
        foreach ($this->registry->all() as $id => $provider) {
            if ($this->providerConfig($id) !== null) {
                $providers[] = $provider;
            }
        }

        return $providers;
    }

    public function provider(string $id): ?ProviderInterface
    {
        $id = strtolower(trim($id));
        if ($this->providerConfig($id) === null) {
            return null;
        }

        return $this->registry->get($id);
    }

    /**
     * @return array{sub: string, name: string, avatar: string, email: string, boundAt: int}|null
     */
    public function binding(int $uid, string $provider): ?array
    {
        return $this->bindings->get($uid, $provider);
    }

    /**
     * @return array<string, array{sub: string, name: string, avatar: string, email: string, boundAt: int}>
     */
    public function bindings(int $uid): array
    {
        return $this->bindings->all($uid);
    }

    public function bind(int $uid, string $provider, Identity $identity): void
    {
        $this->assertProvider($provider);
        $this->bindings->save($uid, $provider, $identity);
    }

    public function owner(string $provider, string $subject): int
    {
        $this->assertProvider($provider);

        return $this->bindings->owner($provider, $subject);
    }

    public function unbind(int $uid, string $provider): void
    {
        $this->assertProvider($provider);
        $this->bindings->delete($uid, $provider);
    }

    /**
     * Build the provider authorization URL and persist the matching state.
     */
    public function authorizationUrl(string $providerId, int $uid): ?string
    {
        if (!$this->isEnabled()) {
            return null;
        }

        $provider = $this->registry->get($providerId);
        $config = $this->providerConfig($providerId);
        if ($provider === null || $config === null) {
            return null;
        }

        $verifier = $provider->usesPkce() ? $this->random(64) : '';
        $challenge = $verifier === ''
            ? null
            : $this->base64Url(hash('sha256', $verifier, true));
        try {
            $state = $this->issueState($providerId, $uid, $verifier);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth state creation failed: ' . $exception->getMessage());

            return null;
        }

        return $provider->authorizeUrl(
            $config,
            $this->callbackUrl(
                $providerId,
                $provider->requiresStateEcho() ? null : $state
            ),
            $state,
            $challenge
        );
    }

    /**
     * Consume a provider callback. The caller decides what to do with an
     * UNBOUND result (normally: create a Typecho subscriber when allowed).
     */
    public function callback(string $providerId, string $code, string $state): CallbackResult
    {
        $routeId = strtolower(trim($providerId));

        $stateData = $this->consumeState(
            $routeId,
            $state,
            false
        );
        if ($stateData === null) {
            return CallbackResult::error($routeId, 'oauth_state');
        }

        $providerId = $stateData['provider'];
        $provider = $this->registry->get($providerId);
        $config = $this->providerConfig($providerId);
        if ($provider === null || $config === null) {
            return CallbackResult::error($routeId, 'oauth_disabled');
        }

        if (
            ($provider->requiresStateEcho() && trim($state) === '')
            || ($provider->requiresCode() && trim($code) === '')
        ) {
            return CallbackResult::error($routeId, 'oauth_state');
        }

        try {
            $token = $provider->exchange(
                $config,
                $code,
                $this->callbackUrl($providerId),
                $stateData['verifier']
            );
            if ($token === null) {
                return CallbackResult::error($providerId, 'oauth_failed');
            }

            $identity = $provider->userInfo($config, $token);
            if ($identity === null) {
                return CallbackResult::error($providerId, 'oauth_failed');
            }

            $uid = $stateData['uid'];
            if ($uid > 0) {
                $owner = $this->bindings->owner($providerId, $identity->subject);
                if ($owner > 0 && $owner !== $uid) {
                    return CallbackResult::error($providerId, 'oauth_bound');
                }

                $this->bindings->save($uid, $providerId, $identity);

                return new CallbackResult(CallbackResult::BOUND, $providerId, $identity, $uid);
            }

            $owner = $this->bindings->owner($providerId, $identity->subject);
            if ($owner > 0) {
                return new CallbackResult(
                    CallbackResult::LOGIN,
                    $providerId,
                    $identity,
                    0,
                    $owner
                );
            }

            return new CallbackResult(CallbackResult::UNBOUND, $providerId, $identity);
        } catch (\Throwable $exception) {
            error_log('SunkenBoat OAuth callback failed for ' . $providerId . ': ' . $exception->getMessage());

            return CallbackResult::error($providerId, 'oauth_failed');
        }
    }

    public function callbackUrl(string $providerId, ?string $nonce = null): string
    {
        $base = rtrim($this->callbackBase, '/');
        $provider = $this->registry->get($providerId);
        $callbackId = $provider?->callbackId() ?? $providerId;

        $url = $base . '/ttdf/oauth/' . rawurlencode($callbackId) . '/callback';
        if ($nonce !== null && preg_match('/^[a-f0-9]{32}$/', $nonce) === 1) {
            $url .= '/' . $nonce;
        }

        return $url;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function providerConfig(string $providerId): ?array
    {
        $providers = $this->config['providers'] ?? [];
        $config = is_array($providers) && is_array($providers[$providerId] ?? null)
            ? $providers[$providerId]
            : [];

        if (($config['enabled'] ?? false) !== true) {
            return null;
        }

        $clientId = trim((string) (
            $config['clientId']
            ?? $config['client_id']
            ?? $config['appId']
            ?? $config['app_id']
            ?? ''
        ));
        $clientSecret = trim((string) (
            $config['clientSecret']
            ?? $config['client_secret']
            ?? $config['appSecret']
            ?? $config['app_secret']
            ?? ''
        ));

        if ($clientId === '' || $clientSecret === '') {
            return null;
        }

        return array_merge($config, [
            'clientId' => $clientId,
            'clientSecret' => $clientSecret,
            'scope' => trim((string) ($config['scope'] ?? '')),
        ]);
    }

    private function issueState(string $providerId, int $uid, string $verifier): string
    {
        $nonce = $this->random(32);
        $payload = json_encode([
            'provider' => $providerId,
            'uid' => max(0, $uid),
            'nonce' => $nonce,
            'expires' => $this->now() + self::STATE_TTL,
            'verifier' => $verifier,
        ], JSON_UNESCAPED_SLASHES);

        if (!is_string($payload)) {
            throw new \RuntimeException('Unable to encode OAuth state');
        }

        $encoded = $this->base64Url($payload);
        $signature = hash_hmac('sha256', $encoded, $this->stateSecret);
        $this->states->write(self::STATE_COOKIE, $encoded . '.' . $signature, self::STATE_TTL);

        return $nonce;
    }

    /**
     * @return array{provider: string, uid: int, verifier: string}|null
     */
    private function consumeState(
        string $routeId,
        string $state,
        bool $allowMissingState = false
    ): ?array
    {
        $cookie = $this->states->read(self::STATE_COOKIE);
        $this->states->delete(self::STATE_COOKIE);

        if ($cookie === '' || !str_contains($cookie, '.')) {
            return null;
        }

        [$encoded, $signature] = explode('.', $cookie, 2);
        $expected = hash_hmac('sha256', $encoded, $this->stateSecret);
        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $json = base64_decode(strtr($encoded, '-_', '+/'), true);
        if (!is_string($json)) {
            return null;
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            return null;
        }

        $storedProvider = is_string($data['provider'] ?? null) ? $data['provider'] : '';
        $nonce = is_string($data['nonce'] ?? null) ? $data['nonce'] : '';
        $expires = is_numeric($data['expires'] ?? null) ? (int) $data['expires'] : 0;
        $verifier = is_string($data['verifier'] ?? null) ? $data['verifier'] : '';
        $uid = is_numeric($data['uid'] ?? null) ? (int) $data['uid'] : 0;

        $provider = $this->registry->get($storedProvider);
        if (
            $provider === null
            || ($storedProvider !== $routeId && $provider->callbackId() !== $routeId)
            || $nonce === ''
            || $expires < $this->now()
        ) {
            return null;
        }

        if ($state === '') {
            if (!$allowMissingState) {
                return null;
            }
        } elseif (!hash_equals($nonce, $state)) {
            return null;
        }

        return [
            'provider' => $storedProvider,
            'uid' => max(0, $uid),
            'verifier' => $verifier,
        ];
    }

    private function assertProvider(string $providerId): void
    {
        if ($this->registry->get($providerId) === null) {
            throw new InvalidArgumentException('Unknown OAuth provider');
        }
    }

    private function random(int $length): string
    {
        try {
            $bytes = random_bytes(max(1, (int) ceil($length / 2)));
            return substr(bin2hex($bytes), 0, $length);
        } catch (\Throwable) {
            return substr(hash('sha256', uniqid('', true)), 0, $length);
        }
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function now(): int
    {
        return (int) ($this->clock)();
    }
}
