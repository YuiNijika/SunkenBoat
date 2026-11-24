<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

use TTDF\Theme\Assets;

$blockWidthField = [
    'type' => 'Select',
    'name' => 'width',
    'label' => '展示宽度',
    'value' => 'content',
    'options' => [
        'content' => '当前宽度',
        'half' => '半宽（不含侧栏）',
        'full' => '全宽',
    ],
    'description' => '半宽区块会让页面切换为无侧栏布局；在内容区中间插入全宽区块时也会自动隐藏侧栏，避免侧栏被截断。',
];

$blockLayoutFields = [
    $blockWidthField,
    [
        'type' => 'Select',
        'name' => 'space_top',
        'label' => '顶部间距',
        'value' => 'default',
        'options' => [
            'default' => '跟随主题',
            'none' => '无',
            'sm' => '小',
            'md' => '中',
            'lg' => '大',
            'xl' => '超大',
        ],
    ],
    [
        'type' => 'Select',
        'name' => 'space_bottom',
        'label' => '底部间距',
        'value' => 'default',
        'options' => [
            'default' => '跟随主题',
            'none' => '无',
            'sm' => '小',
            'md' => '中',
            'lg' => '大',
            'xl' => '超大',
        ],
    ],
    [
        'type' => 'Text',
        'name' => 'min_height',
        'label' => '最小高度',
        'placeholder' => '例如 420px、60vh；留空自适应',
        'description' => '仅对全宽区块生效，用来消除上下多余留白。',
    ],
];

$commonBlocks = [
    'breadcrumbs' => [
        'label' => '面包屑导航',
        'fields' => [
            ['type' => 'Text', 'name' => 'home_label', 'label' => '首页文案', 'placeholder' => '首页'],
        ],
    ],
    'alert' => [
        'label' => '提示框',
        'variants' => [
            'info' => '信息',
            'success' => '成功',
            'warning' => '警告',
            'danger' => '错误',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '例如：维护通知'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '内容', 'rows' => 3, 'placeholder' => '只支持纯文本。'],
            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案', 'placeholder' => '留空不显示按钮'],
            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接', 'placeholder' => 'https:// 或 /path'],
            ...$blockLayoutFields,
        ],
    ],
    'notice' => [
        'label' => '公告条',
        'variants' => ['soft' => '柔和', 'accent' => '强调', 'dark' => '深色'],
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语', 'placeholder' => '例如：公告'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '内容', 'rows' => 2],
            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案'],
            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接'],
            ...$blockLayoutFields,
        ],
    ],
    'quote' => [
        'label' => '引用',
        'variants' => ['default' => '标准', 'large' => '大字'],
        'fields' => [
            ['type' => 'Textarea', 'name' => 'text', 'label' => '引用内容', 'rows' => 4, 'placeholder' => '只支持纯文本。'],
            ['type' => 'Text', 'name' => 'cite', 'label' => '出处'],
            ['type' => 'Text', 'name' => 'source_url', 'label' => '出处链接'],
        ],
    ],
    'feature-grid' => [
        'label' => '特性卡片',
        'variants' => ['two' => '两列', 'three' => '三列', 'four' => '四列'],
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '卡片列表',
                'rows' => 6,
                'description' => '每行一条，格式：标题|说明|链接。链接可留空。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'stats' => [
        'label' => '数据统计',
        'variants' => [
            'two' => '两列',
            'three' => '三列',
            'four' => '四列',
            'strip' => '全宽数据条',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '统计项',
                'rows' => 4,
                'description' => '每行一条，格式：数值|标签。留空时显示站点文章、评论、分类与标签数量。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'steps' => [
        'label' => '步骤说明',
        'variants' => ['vertical' => '纵向', 'grid' => '网格'],
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '步骤列表',
                'rows' => 6,
                'description' => '每行一条，格式：标题|说明。',
            ],
        ],
    ],
    'faq' => [
        'label' => '常见问题',
        'variants' => ['default' => '标准', 'panel' => '卡片'],
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '问题列表',
                'rows' => 6,
                'description' => '每行一条，格式：问题|答案。',
            ],
        ],
    ],
    'timeline' => [
        'label' => '时间线',
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '时间线条目',
                'rows' => 6,
                'description' => '每行一条，格式：日期|标题|说明。',
            ],
        ],
    ],
    'gallery' => [
        'label' => '图片画廊',
        'variants' => ['two' => '两列', 'three' => '三列', 'four' => '四列'],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'images',
                'label' => '图片',
                'rows' => 5,
                'media' => true,
                'description' => '每行一张图片，可从媒体库选择。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'table' => [
        'label' => '表格',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            ['type' => 'Text', 'name' => 'head', 'label' => '表头', 'placeholder' => '名称|说明|链接'],
            [
                'type' => 'Textarea',
                'name' => 'rows',
                'label' => '表格行',
                'rows' => 6,
                'description' => '每行一条，单元格用 | 分隔。',
            ],
        ],
    ],
    'media-grid' => [
        'label' => '图片磁贴',
        'variants' => ['overlay' => '图片叠加', 'card' => '卡片'],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '磁贴列表',
                'rows' => 6,
                'media' => true,
                'description' => '每行一条，格式：标题|图片|链接|说明。图片可从媒体库选择。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '5',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                    '5' => '五列',
                    '6' => '六列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'promo-grid' => [
        'label' => '推广横幅组',
        'variants' => [
            'feature' => '一大两小',
            'duo' => '双列',
            'trio' => '三列',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '横幅列表',
                'rows' => 6,
                'description' => '每行一条：标题|说明|图片地址|链接|角标。链接与角标可留空。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'quick-links' => [
        'label' => '快捷入口',
        'variants' => [
            'cards' => '图标卡片',
            'strip' => '紧凑横条',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '入口列表',
                'rows' => 6,
                'description' => '每行一条：图标|标题|说明|链接|角标。图标支持 compass/book/search/code/download/users/message/star/shield/sparkles/layers。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'bento-grid' => [
        'label' => 'Bento 精选拼图',
        'variants' => [
            'spotlight' => '主次聚焦',
            'mosaic' => '非对称拼图',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '拼图项目',
                'rows' => 7,
                'description' => '每行一条：标题|说明|图片地址|链接|角标|尺寸(large/wide/tall/small)。建议 3–6 条，尺寸留空时自动排布。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'topic-grid' => [
        'label' => '主题合集',
        'variants' => [
            'spotlight' => '重点合集',
            'grid' => '合集网格',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '自定义合集',
                'rows' => 6,
                'description' => '每行一条：标题|说明|分类 slug|封面地址|链接|角标。留空时自动读取现有分类与文章数。',
            ],
            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 4, 'min' => 1, 'max' => 8, 'step' => 1],
            ['type' => 'Number', 'name' => 'recent_limit', 'label' => '每个合集显示文章数', 'value' => 3, 'min' => 0, 'max' => 5, 'step' => 1],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '网格列数',
                'value' => '2',
                'options' => [
                    '1' => '单列',
                    '2' => '两列',
                    '3' => '三列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'link-directory' => [
        'label' => '链接目录',
        'variants' => [
            'grid' => '目录卡片',
            'compact' => '紧凑目录',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            ['type' => 'Text', 'name' => 'search_label', 'label' => '搜索框占位', 'placeholder' => '搜索链接、分组或说明'],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '链接项目',
                'rows' => 8,
                'description' => '每行一条：分组|标题|说明|链接|图标|角标。图标支持 compass/book/search/code/download/users/message/star/shield/sparkles/layers/external。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '网格列数',
                'value' => '2',
                'options' => [
                    '1' => '单列',
                    '2' => '两列',
                    '3' => '三列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'post-tabs' => [
        'label' => '分类文章切换',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'tabs',
                'label' => '切换标签',
                'rows' => 4,
                'description' => '每行一条：标签|分类 slug|查看更多链接。分类与链接可留空，留空时自动读取站点分类。',
            ],
            ['type' => 'Number', 'name' => 'limit', 'label' => '每个标签显示数量', 'value' => 6, 'min' => 1, 'max' => 12, 'step' => 1],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '3',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'author-grid' => [
        'label' => '推荐用户',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '推荐用户'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '用户列表',
                'rows' => 5,
                'description' => '每行一条：名称|头像地址|简介|链接|标签。留空时自动读取站点用户与文章、评论数量。',
            ],
            ['type' => 'Number', 'name' => 'limit', 'label' => '自动读取数量', 'value' => 8, 'min' => 1, 'max' => 12, 'step' => 1, 'description' => '仅用户列表留空时生效。'],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '3',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'product-grid' => [
        'label' => '资源商品墙',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '商品列表',
                'rows' => 6,
                'description' => '每行一条：名称|图片地址|价格|原价|链接|角标|说明。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '4',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                    '5' => '五列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'logo-cloud' => [
        'label' => '合作方 Logo 墙',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => 'Logo 列表',
                'rows' => 6,
                'description' => '每行一条：名称|Logo 图片地址|链接。图片留空时显示名称。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '4',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                    '5' => '五列',
                    '6' => '六列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'heading' => [
        'label' => '文本标题',
        'variants' => [
            'plain' => '简洁',
            'bar' => '标题条',
            'center' => '居中',
            'boxed' => '卡片',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语', 'placeholder' => '例如：关于我们'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '简介', 'rows' => 3],
            ...$blockLayoutFields,
        ],
    ],
    'button-group' => [
        'label' => '按钮组',
        'variants' => ['inline' => '横排', 'center' => '居中', 'stack' => '纵排'],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '按钮列表',
                'rows' => 4,
                'description' => '每行一条：文案|链接|样式(primary/outline/ghost)|图标(arrow/plus/download/external)。',
            ],
            ...$blockLayoutFields,
        ],
    ],
    'info-cards' => [
        'label' => '复合信息卡片',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '卡片列表',
                'rows' => 6,
                'description' => '每行一条：图标|标题|标签|简介|链接。图标支持 sparkles/shield/zap/book/users/message/star/globe/layers。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '3',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'partner-scroll' => [
        'label' => '横向滚动合作伙伴',
        'variants' => [
            'marquee' => '自动滚动',
            'grid' => '网格',
            'plain' => '简洁横排',
        ],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => 'Logo 列表',
                'rows' => 6,
                'description' => '每行一条：名称|Logo 图片地址|链接。',
            ],
            ['type' => 'Number', 'name' => 'columns', 'label' => '网格列数', 'value' => 4, 'min' => 2, 'max' => 6, 'step' => 1],
            ['type' => 'Number', 'name' => 'speed', 'label' => '滚动速度（秒）', 'value' => 32, 'min' => 8, 'max' => 120, 'step' => 2, 'description' => '仅自动滚动样式生效。'],
            ...$blockLayoutFields,
        ],
    ],
    'media-split' => [
        'label' => '图文视频卡片',
        'variants' => ['split' => '左右分栏'],
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Select',
                'name' => 'media_kind',
                'label' => '左侧媒体类型',
                'value' => 'image',
                'options' => [
                    'image' => '图片',
                    'video' => '视频',
                    'slides' => '幻灯片',
                ],
            ],
            ['type' => 'Text', 'name' => 'media', 'label' => '左侧图片/视频地址', 'media' => true, 'description' => '媒体类型为图片或视频时使用。'],
            ['type' => 'Text', 'name' => 'poster', 'label' => '视频封面', 'media' => true, 'description' => '仅视频使用，可留空。'],
            ['type' => 'Slides', 'name' => 'slides', 'label' => '幻灯片项目', 'description' => '媒体类型为幻灯片时使用。'],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '右侧卡片',
                'rows' => 6,
                'description' => '每行一条：类型(image/video)|标题|说明|图片或视频地址|链接。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '右侧列数',
                'value' => '2',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'pricing' => [
        'label' => '会员方案',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            [
                'type' => 'Textarea',
                'name' => 'plans',
                'label' => '方案列表',
                'rows' => 6,
                'description' => '每行一条：名称|价格|周期|特性1;特性2|按钮文案|链接|推荐填1。',
            ],
            [
                'type' => 'Select',
                'name' => 'columns',
                'label' => '每行列数',
                'value' => '4',
                'options' => [
                    '2' => '两列',
                    '3' => '三列',
                    '4' => '四列',
                ],
            ],
            ...$blockLayoutFields,
        ],
    ],
    'author-card' => [
        'label' => '作者名片',
        'fields' => [
            ['type' => 'Text', 'name' => 'name', 'label' => '名称', 'placeholder' => '留空使用站点标题'],
            ['type' => 'Text', 'name' => 'role', 'label' => '身份/标签'],
            ['type' => 'Textarea', 'name' => 'bio', 'label' => '简介', 'rows' => 3, 'placeholder' => '留空使用站点描述'],
            ['type' => 'Text', 'name' => 'avatar', 'label' => '头像地址', 'media' => true, 'placeholder' => '可从媒体库选择'],
            [
                'type' => 'Textarea',
                'name' => 'links',
                'label' => '社交链接',
                'rows' => 3,
                'description' => '每行一条，格式：名称|链接。',
            ],
        ],
    ],
    'subscribe' => [
        'label' => '订阅卡片',
        'fields' => [
            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            ['type' => 'Text', 'name' => 'action_label', 'label' => '主按钮文案'],
            ['type' => 'Text', 'name' => 'action_url', 'label' => '主按钮链接', 'placeholder' => '留空使用 RSS 地址'],
            ['type' => 'Text', 'name' => 'secondary_label', 'label' => '次按钮文案'],
            ['type' => 'Text', 'name' => 'secondary_url', 'label' => '次按钮链接'],
        ],
    ],
    'link-list' => [
        'label' => '链接列表',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
            [
                'type' => 'Textarea',
                'name' => 'items',
                'label' => '链接列表',
                'rows' => 6,
                'description' => '每行一条，格式：标题|说明|链接。',
            ],
        ],
    ],
    'divider' => ['label' => '分隔线', 'variants' => ['default' => '细线', 'dashed' => '虚线']],
    'spacer' => ['label' => '留白', 'variants' => ['sm' => '小', 'md' => '中', 'lg' => '大']],
];

$heroBlockOption = [
    'label' => '首屏介绍',
    'variants' => ['default' => '标准', 'compact' => '紧凑'],
    'fields' => [
        ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语', 'placeholder' => '显示在标题上方，可留空'],
        ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用站点标题'],
        ['type' => 'Textarea', 'name' => 'lead', 'label' => '简介', 'rows' => 3, 'placeholder' => '留空使用站点副标题或描述'],
        ['type' => 'Text', 'name' => 'search_placeholder', 'label' => '搜索框占位', 'placeholder' => '输入关键词搜索站内文章…'],
        ['type' => 'Text', 'name' => 'primary_label', 'label' => '主按钮文案', 'placeholder' => '浏览文章'],
        ['type' => 'Text', 'name' => 'primary_url', 'label' => '主按钮链接', 'placeholder' => '#latest'],
        ['type' => 'Text', 'name' => 'secondary_label', 'label' => '次按钮文案', 'placeholder' => 'RSS 订阅'],
        ['type' => 'Text', 'name' => 'secondary_url', 'label' => '次按钮链接', 'placeholder' => '留空使用订阅地址'],
        [
            'type' => 'Select',
            'name' => 'background',
            'label' => '背景类型',
            'value' => 'color',
            'options' => [
                'color' => '纯色背景',
                'image' => '图片背景',
                'video' => '视频背景',
            ],
            'description' => '图片与视频背景会自动叠加遮罩，保证文字可读。',
        ],
        [
            'type' => 'ColorPicker',
            'name' => 'color',
            'label' => '纯色背景',
            'value' => '#10141c',
            'description' => '背景类型为纯色时生效，不会使用主题蓝紫色渐变。',
        ],
        ['type' => 'Media', 'name' => 'image', 'label' => '背景图片', 'description' => '背景类型为图片时使用，从媒体库选择。'],
        [
            'type' => 'Select',
            'name' => 'image_fit',
            'label' => '图片填充方式',
            'value' => 'cover',
            'show_when' => ['background' => 'image'],
            'options' => [
                'cover' => '裁剪填充（推荐）',
                'contain' => '完整显示',
                'fill' => '拉伸铺满',
            ],
            'description' => '裁剪填充不会变形；完整显示可能留下留白；拉伸铺满会按容器比例拉伸图片。',
        ],
        [
            'type' => 'Select',
            'name' => 'image_effect',
            'label' => '图片效果',
            'value' => 'none',
            'show_when' => ['background' => 'image'],
            'options' => [
                'none' => '静态',
                'fixed' => '固定视差',
                'zoom' => '缓慢缩放',
                'pan' => '横向平移',
            ],
            'description' => '固定视差会让图片相对页面固定在视口；移动端会自动降级为静态，避免滚动卡顿。',
        ],
        [
            'type' => 'Select',
            'name' => 'image_position',
            'label' => '图片焦点',
            'value' => 'center',
            'show_when' => ['background' => 'image'],
            'options' => [
                'center' => '居中',
                'top' => '顶部',
                'bottom' => '底部',
                'left' => '左侧',
                'right' => '右侧',
            ],
            'description' => '裁剪或完整显示时，决定优先保留图片的哪个区域。',
        ],
        ['type' => 'Text', 'name' => 'video', 'label' => '背景视频', 'placeholder' => 'https://example.com/hero.mp4', 'description' => '背景类型为视频时使用，支持 MP4 / WebM 直链。'],
        ['type' => 'Media', 'name' => 'video_poster', 'label' => '视频封面', 'description' => '视频加载前显示的封面图，可从媒体库选择。'],
        [
            'type' => 'Select',
            'name' => 'height',
            'label' => '首屏高度',
            'value' => '',
            'options' => [
                '' => '自适应',
                'sm' => '紧凑',
                'md' => '标准',
                'lg' => '高',
                'screen' => '满屏',
            ],
        ],
        ['type' => 'Number', 'name' => 'overlay', 'label' => '遮罩浓度', 'value' => 55, 'min' => 0, 'max' => 90, 'step' => 5, 'description' => '仅图片与视频背景生效，数值越大文字越清晰。'],
        [
            'type' => 'Select',
            'name' => 'align',
            'label' => '内容对齐',
            'value' => 'center',
            'options' => [
                'center' => '居中',
                'left' => '左对齐',
            ],
        ],
        ['type' => 'Textarea', 'name' => 'hot', 'label' => '热门搜索词', 'rows' => 2, 'description' => '每行一个关键词，显示在搜索框下方。'],
        [
            'type' => 'Textarea',
            'name' => 'cards',
            'label' => '追加卡片',
            'rows' => 4,
            'description' => '每行一张卡片，格式：标题|说明|链接|角标。最多 4 张，留空不显示。',
        ],
        [
            'type' => 'Select',
            'name' => 'card_style',
            'label' => '卡片风格',
            'value' => 'glass',
            'options' => [
                'glass' => '玻璃质感',
                'solid' => '白色实色',
            ],
        ],
        ...$blockLayoutFields,
    ],
];

$carouselBlockOption = [
    'label' => '轮播图',
    'fields' => [
        ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空不显示标题'],
        ['type' => 'Slides', 'name' => 'slides', 'label' => '轮播项目'],
        [
            'type' => 'Select',
            'name' => 'height',
            'label' => '轮播高度',
            'value' => '',
            'options' => [
                '' => '自适应',
                'sm' => '紧凑',
                'md' => '标准',
                'lg' => '高',
                'screen' => '满屏',
            ],
            'description' => '选择“满屏”并配合“全宽”可得到截图中的顶部全屏轮播。',
        ],
        ['type' => 'Number', 'name' => 'overlay', 'label' => '遮罩浓度', 'value' => 45, 'min' => 0, 'max' => 90, 'step' => 5],
        [
            'type' => 'Select',
            'name' => 'align',
            'label' => '文案对齐',
            'value' => 'center',
            'options' => [
                'center' => '居中',
                'left' => '左对齐',
            ],
        ],
        ...$blockLayoutFields,
    ],
];

$forumTopicListOption = [
    'label' => '帖子列表',
    'variants' => ['default' => '标准', 'compact' => '紧凑'],
    'fields' => [
        ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用默认标题'],
        ['type' => 'Text', 'name' => 'empty_title', 'label' => '空状态标题'],
        ['type' => 'Textarea', 'name' => 'empty_text', 'label' => '空状态说明', 'rows' => 2],
        [
            'type' => 'Select',
            'name' => 'sort',
            'label' => '帖子排序',
            'value' => 'inherit',
            'options' => [
                'inherit' => '跟随论坛设置',
                'latest' => '最新回复',
                'recommended' => '推荐指数',
                'random' => '随机帖子',
            ],
            'description' => '随机排序每次打开页面都会重新抽取，并自动保留置顶帖子。',
        ],
        ['type' => 'Switch', 'name' => 'show_filters', 'label' => '显示类型筛选', 'value' => true],
        ['type' => 'Switch', 'name' => 'show_search', 'label' => '显示帖子搜索', 'value' => true],
        ['type' => 'Number', 'name' => 'limit', 'label' => '当前页显示数量', 'value' => 0, 'min' => 0, 'max' => 30, 'step' => 1, 'description' => '0 表示显示当前页全部帖子；分页由论坛每页数量控制。'],
        ...$blockLayoutFields,
    ],
];

$forumHomeMainOptions = [
    'forum-home-header' => [
        'label' => '圈子广场标题',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用论坛标题'],
            ['type' => 'Switch', 'name' => 'show_stats', 'label' => '显示圈子与帖子数量', 'value' => true],
            ['type' => 'Switch', 'name' => 'show_create', 'label' => '显示创建圈子按钮', 'value' => true],
            ...$blockLayoutFields,
        ],
    ],
    'forum-circle-grid' => [
        'label' => '圈子导航',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空不显示'],
            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 6, 'min' => 1, 'max' => 12, 'step' => 1],
            ...$blockLayoutFields,
        ],
    ],
    'forum-topic-list' => $forumTopicListOption,
];

$forumCircleMainOptions = [
    'forum-circle-hero' => [
        'label' => '圈子横幅',
        'fields' => $blockLayoutFields,
    ],
    'forum-topic-list' => $forumTopicListOption,
];

$forumLeftOptions = [
    'forum-create' => [
        'label' => '创建圈子卡片',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '创建自己的圈子'],
            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 2],
            ...$blockLayoutFields,
        ],
    ],
    'forum-circle-list' => [
        'label' => '圈子列表',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '推荐圈子'],
            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 8, 'min' => 1, 'max' => 12, 'step' => 1],
            ...$blockLayoutFields,
        ],
    ],
    'forum-circle-info' => [
        'label' => '关于当前圈子',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '关于圈子'],
            ...$blockLayoutFields,
        ],
    ],
    'forum-notice' => [
        'label' => '圈子公告',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '社区公告'],
            ...$blockLayoutFields,
        ],
    ],
    'forum-authors' => [
        'label' => '活跃排行',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '活跃排行'],
            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 5, 'min' => 1, 'max' => 10, 'step' => 1],
            ...$blockLayoutFields,
        ],
    ],
];

$forumRightOptions = [
    'forum-stats' => [
        'label' => '圈子数据',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '圈子数据'],
            ['type' => 'Switch', 'name' => 'show_circle', 'label' => '显示当前圈子数据', 'value' => true],
            ...$blockLayoutFields,
        ],
    ],
    'forum-hot-circles' => [
        'label' => '热门圈子',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '热门圈子'],
            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 6, 'min' => 1, 'max' => 10, 'step' => 1],
            ...$blockLayoutFields,
        ],
    ],
    'forum-hot-topics' => [
        'label' => '热门帖子',
        'fields' => [
            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '热门帖子'],
            ['type' => 'Number', 'name' => 'limit', 'label' => '显示数量', 'value' => 6, 'min' => 1, 'max' => 10, 'step' => 1],
            ...$blockLayoutFields,
        ],
    ],
];

$economyLevelDefaults = [
    1 => ['min' => 0, 'title' => 'LV0', 'color' => '#c0c0c0', 'icon' => Assets::url('img/LV0.svg')],
    2 => ['min' => 200, 'title' => 'LV1', 'color' => '#c0c0c0', 'icon' => Assets::url('img/LV1.svg')],
    3 => ['min' => 1500, 'title' => 'LV2', 'color' => '#8bd29b', 'icon' => Assets::url('img/LV2.svg')],
    4 => ['min' => 4500, 'title' => 'LV3', 'color' => '#7bcdef', 'icon' => Assets::url('img/LV3.svg')],
    5 => ['min' => 10800, 'title' => 'LV4', 'color' => '#febb8b', 'icon' => Assets::url('img/LV4.svg')],
    6 => ['min' => 28800, 'title' => 'LV5', 'color' => '#ee672a', 'icon' => Assets::url('img/LV5.svg')],
    7 => ['min' => 86400, 'title' => 'LV6', 'color' => '#ff0000', 'icon' => Assets::url('img/LV6.svg')],
    8 => ['min' => 288000, 'title' => 'LV6 闪电', 'color' => '#ff0000', 'icon' => Assets::url('img/LV6_Lightning.svg')],
];
$economyLevelOptions = [];
$economyLevels = [];
for ($level = 1; $level <= count($economyLevelDefaults); $level++) {
    $default = $economyLevelDefaults[$level];
    $economyLevelOptions['level-' . $level] = [
        'label' => $default['title'] . ($level === 1 ? ' · 注册成功' : ' · ' . number_format($default['min']) . ' 经验'),
        'fields' => [
            [
                'type' => 'Number',
                'name' => 'min_experience',
                'label' => '所需经验',
                'value' => $default['min'],
                'min' => 0,
                'max' => 100000000,
                'step' => 10,
            ],
            [
                'type' => 'Text',
                'name' => 'title',
                'label' => '等级名称',
                'value' => $default['title'],
                'placeholder' => '例如：核心成员',
            ],
            [
                'type' => 'Text',
                'name' => 'icon',
                'label' => '等级图标',
                'value' => $default['icon'],
                'media' => true,
                'description' => '图片链接，可从媒体库选择；留空时按等级顺序使用主题内置 B 站图标。',
            ],
            [
                'type' => 'ColorPicker',
                'name' => 'color',
                'label' => '徽章颜色',
                'value' => $default['color'],
                'predefine' => ['#c0c0c0', '#8bd29b', '#7bcdef', '#febb8b', '#ee672a', '#ff0000'],
            ],
        ],
    ];
}
foreach ($economyLevelDefaults as $level => $default) {
    $economyLevels[] = [
        'name' => 'level-' . $level,
        'data' => [
            'min_experience' => $default['min'],
            'title' => $default['title'],
            'icon' => $default['icon'],
            'color' => $default['color'],
        ],
    ];
}

return [
    'blockWidthField' => $blockWidthField,
    'blockLayoutFields' => $blockLayoutFields,
    'commonBlocks' => $commonBlocks,
    'heroBlockOption' => $heroBlockOption,
    'carouselBlockOption' => $carouselBlockOption,
    'forumTopicListOption' => $forumTopicListOption,
    'forumHomeMainOptions' => $forumHomeMainOptions,
    'forumCircleMainOptions' => $forumCircleMainOptions,
    'forumLeftOptions' => $forumLeftOptions,
    'forumRightOptions' => $forumRightOptions,
    'economyLevelDefaults' => $economyLevelDefaults,
    'economyLevelOptions' => $economyLevelOptions,
    'economyLevels' => $economyLevels,
];
