<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

$accountBlockNames = [
    'alert',
    'notice',
    'quote',
    'feature-grid',
    'stats',
    'steps',
    'faq',
    'timeline',
    'gallery',
    'table',
    'media-grid',
    'promo-grid',
    'quick-links',
    'bento-grid',
    'link-directory',
    'product-grid',
    'logo-cloud',
    'heading',
    'button-group',
    'info-cards',
    'media-split',
    'pricing',
    'link-list',
    'divider',
    'spacer',
];

$accountBlocks = array_intersect_key($commonBlocks, array_flip($accountBlockNames));

return [
    'title' => '用户中心',
    'description' => '用户中心文案、固定侧栏、身份信息与可拖拽的内容区块。',
    'fields' => [
        [
            'type' => 'Blocks',
            'name' => 'Account_Blocks',
            'value' => [],
            'label' => '用户中心内容区块',
            'description' => '在账号功能之后追加公告、帮助说明、会员方案或推荐内容；可直接在可视化定制器中拖拽和编辑。',
            'placeholder' => '添加用户中心区块…',
            'reorder' => ['drag', 'buttons'],
            'options' => $accountBlocks,
        ],
        [
            'type' => 'Select',
            'name' => 'UserCenter_Rail_Mode',
            'value' => 'pinned',
            'label' => '桌面侧栏行为',
            'description' => '固定模式让账号信息与导航留在视口内，内容较长时仅侧栏内部滚动；跟随模式随整页滚动。',
            'options' => [
                'pinned' => '固定侧栏',
                'follow' => '跟随页面滚动',
            ],
        ],
        [
            'type' => 'Text',
            'name' => 'UserCenter_Eyebrow',
            'value' => 'Member workspace',
            'label' => '页面引导语',
            'placeholder' => 'Member workspace',
        ],
        [
            'type' => 'Text',
            'name' => 'UserCenter_Title',
            'value' => '用户中心',
            'label' => '页面标题',
            'placeholder' => '用户中心',
        ],
        [
            'type' => 'Textarea',
            'name' => 'UserCenter_Description',
            'value' => '管理公开身份、登录安全、创作内容与账号资产。',
            'label' => '页面说明',
            'rows' => 3,
            'placeholder' => '管理公开身份、登录安全、创作内容与账号资产。',
        ],
        [
            'type' => 'Switch',
            'name' => 'UserCenter_Show_Identity',
            'value' => true,
            'label' => '显示账号资料卡',
            'description' => '关闭后只保留用户中心导航，适合更简洁的控制台式布局。',
        ],
        [
            'type' => 'Switch',
            'name' => 'UserCenter_Show_Stats',
            'value' => true,
            'show_when' => ['UserCenter_Show_Identity' => true],
            'inline' => true,
            'label' => '显示文章、评论与圈子计数',
        ],
        [
            'type' => 'Switch',
            'name' => 'UserCenter_Show_Wallet',
            'value' => true,
            'show_when' => ['UserCenter_Show_Identity' => true],
            'inline' => true,
            'label' => '显示余额与等级',
        ],
        [
            'type' => 'Switch',
            'name' => 'UserCenter_Show_Checkin',
            'value' => true,
            'show_when' => ['UserCenter_Show_Identity' => true],
            'inline' => true,
            'label' => '显示签到按钮',
        ],
        [
            'type' => 'Switch',
            'name' => 'UserCenter_Show_Links',
            'value' => true,
            'show_when' => ['UserCenter_Show_Identity' => true],
            'inline' => true,
            'label' => '显示快捷入口',
        ],
    ],
];
