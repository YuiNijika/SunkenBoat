<?php

declare(strict_types=1);

namespace SunkenBoat\Support\OAuth;

/**
 * Config-driven OAuth 2.0 provider for standard authorization-code services.
 *
 * Provider-specific differences are limited to endpoints, scopes, token
 * placement and the response envelope. Services with multi-step profile
 * lookups (QQ, WeChat, Weibo) use their own subclasses instead.
 */
final class GenericProvider extends AbstractProvider
{
    /**
     * @param list<string> $scopes
     * @param array<string, string> $authorizeParams
     * @param array<string, string> $tokenParams
     * @param array<string, string> $userInfoQuery
     * @param list<string> $userInfoHeaders
     * @param array<string, list<string>> $identityKeys
     */
    public function __construct(
        private readonly string $identifier,
        private readonly string $displayName,
        private readonly string $authorizeEndpoint,
        private readonly string $tokenEndpoint,
        private readonly string $userInfoEndpoint,
        private readonly array $scopes = [],
        private readonly bool $pkce = false,
        private readonly string $scopeSeparator = ' ',
        private readonly string $description = '',
        private readonly array $authorizeParams = [],
        private readonly array $tokenParams = [],
        private readonly array $userInfoQuery = [],
        private readonly ?string $userInfoTokenParam = null,
        private readonly ?string $userInfoEnvelope = null,
        private readonly ?string $successKey = null,
        private readonly mixed $successValue = true,
        private readonly array $identityKeys = [],
        private readonly array $userInfoHeaders = [],
        private readonly ?string $tokenEnvelope = null,
    ) {
    }

    public function id(): string
    {
        return $this->identifier;
    }

    public function label(): string
    {
        return $this->displayName;
    }

    public function description(): string
    {
        return $this->description;
    }

    /**
     * @return list<string>
     */
    public function defaultScopes(): array
    {
        return $this->scopes;
    }

    public function usesPkce(): bool
    {
        return $this->pkce;
    }

    /**
     * @param array<string, mixed> $config
     */
    public function authorizeUrl(
        array $config,
        string $redirectUri,
        string $state,
        ?string $codeChallenge = null
    ): string {
        $params = array_merge([
            'response_type' => 'code',
            'client_id' => $this->clientId($config),
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ], $this->authorizeParams);

        $scope = $this->scopeString($config, $this->scopeSeparator);
        if ($scope !== '') {
            $params['scope'] = $scope;
        }

        if ($this->pkce) {
            $params['code_challenge'] = (string) $codeChallenge;
            $params['code_challenge_method'] = 'S256';
        }

        return $this->appendQuery($this->authorizeEndpoint, $params);
    }

    /**
     * @param array<string, mixed> $config
     */
    public function exchange(
        array $config,
        string $code,
        string $redirectUri,
        ?string $codeVerifier = null
    ): ?Token {
        $params = array_merge([
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'client_id' => $this->clientId($config),
            'client_secret' => $this->clientSecret($config),
        ], $this->tokenParams);

        if ($this->pkce) {
            $params['code_verifier'] = (string) $codeVerifier;
        }

        return $this->tokenFrom(
            $this->postForm($this->tokenEndpoint, $params),
            $this->tokenEnvelope
        );
    }

    /**
     * @param array<string, mixed> $config
     */
    public function userInfo(array $config, Token $token): ?Identity
    {
        $query = [];
        foreach ($this->userInfoQuery as $key => $value) {
            $query[$key] = strtr($value, [
                '{access_token}' => $token->accessToken,
                '{client_id}' => $this->clientId($config),
            ]);
        }

        $headers = $this->userInfoHeaders;
        if ($this->userInfoTokenParam !== null && $this->userInfoTokenParam !== '') {
            $query[$this->userInfoTokenParam] = $token->accessToken;
        } else {
            $headers[] = 'Authorization: Bearer ' . $token->accessToken;
        }

        $response = $this->getJson($this->userInfoEndpoint, $query, $headers);
        if (!$this->isSuccess($response)) {
            return null;
        }

        return $this->identityFrom($response, $this->identityKeys, $this->userInfoEnvelope);
    }

    /**
     * @param array<string, mixed> $response
     */
    private function isSuccess(array $response): bool
    {
        if ($this->successKey !== null && $this->successKey !== '') {
            $actual = $response[$this->successKey] ?? null;
            if ($actual !== $this->successValue) {
                return false;
            }
        }

        if (array_key_exists('success', $response) && $response['success'] !== true) {
            return false;
        }

        if (array_key_exists('status', $response) && is_numeric($response['status'])) {
            return (int) $response['status'] === 200;
        }

        return true;
    }
}
