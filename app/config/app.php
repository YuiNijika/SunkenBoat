<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'debug' => false,

    'rest' => [
        'enabled' => false,
        'v1_prefix' => 'ttdf/v1',
        'prefix' => [
            // Extra mounts: prefix => v1|v2, or ['prefix' => 'api', 'api' => 'v2'].
            // 'mobile' => 'v2',
        ],
        'cors' => [
            'allowed_origins' => [],
        ],
        'token_enabled' => false,
        'token_env' => 'TTDF_REST_TOKEN',
        'v2_enabled' => false,
        'v2_prefix' => 'ttdf/v2',
        'v2_token_ttl' => 0,
    ],

    'router' => [
        'enabled' => true,
        'pages_dir' => 'router',
        'aliases' => [
            'sitemap.xml' => 'sitemap',
        ],
    ],

    'vite' => [
        'enabled' => true,
        'dev' => false,
        'origin' => 'http://localhost:5173',
        'root' => 'vite',
        'entry' => 'src/main.tsx',
        'out_dir' => 'assets/dist',
        'manifest' => '.vite/manifest.json',
        'dev_preamble' => '<script type="module">import RefreshRuntime from "{{origin}}/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$ = () => {};window.$RefreshSig$ = () => (type) => type;window.__vite_plugin_react_preamble_installed__ = true;</script>',
    ],

    'webpack' => [
        'enabled' => false,
        'dev' => false,
    ],

];
