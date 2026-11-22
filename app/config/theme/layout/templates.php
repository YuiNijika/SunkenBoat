<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '页面模板',
                'description' => '为文章、独立页面、归档等入口选择展示模板；留空时使用默认模板。',
                'fields' => [
            [
                'type' => 'TemplateMap',
                'name' => 'Templates',
                'value' => [
                    'post' => 'content/Post',
                    'page' => 'content/Page',
                    'index' => 'home/WelCome',
                    'archive' => 'content/Archive',
                    'category' => 'content/Archive',
                    'tag' => 'content/Archive',
                    'search' => 'content/Archive',
                    'author' => 'content/Archive',
                    'date' => 'content/Archive',
                    '404' => 'content/NotFound',
                ],
                'components' => [
                    'content/Post',
                    'content/Page',
                    'content/Archive',
                    'home/WelCome',
                    'content/NotFound',
                ],
                'label' => '页面模板',
                'description' => '为每个页面类型选择展示模板；留空时使用默认模板。',
            ],
                ],
];
