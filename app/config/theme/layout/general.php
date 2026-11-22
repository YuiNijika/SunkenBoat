<?php

declare(strict_types=1);

use TTDF\Theme\Assets;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
                'title' => '显示&布局',
                'description' => '全局模块顺序、侧栏、目录、阅读进度与页脚。',
                'fields' => [
            [
                'type' => 'Number',
                'name' => 'Page_Width',
                'value' => 1300,
                'label' => '页面内容宽度',
                'description' => '所有页面共用同一内容宽度；首屏与轮播的全宽展示不受此限制。',
                'min' => 960,
                'max' => 1600,
                'step' => 20,
            ],
            [
                'type' => 'Blocks',
                'name' => 'Layout_Modules',
                'value' => ['reading-progress', 'header', 'main', 'footer', 'action-rail'],
                'label' => '全局模块顺序',
                'description' => '拖动排序，移除模块即可隐藏对应部分。正文主内容区不会被真正移除，缺失时会自动补回末尾。',
                'placeholder' => '选择全局模块…',
                'reorder' => ['drag', 'buttons'],
                'options' => [
                    'reading-progress' => ['label' => '阅读进度'],
                    'header' => ['label' => '页头导航'],
                    'main' => ['label' => '主内容区'],
                    'footer' => ['label' => '页脚'],
                    'action-rail' => ['label' => '右侧悬浮操作栏'],
                ],
            ],
            [
                'type' => 'Switch',
                'name' => 'Block_Animations',
                'value' => true,
                'label' => '启用模块入场动画',
                'description' => '页面滚动到模块时淡入或滑入；关闭后所有模块直接显示。',
            ],
            [
                'type' => 'Select',
                'name' => 'Block_Animation_Effect',
                'value' => 'fade-up',
                'show_when' => ['Block_Animations' => true],
                'label' => '入场动画效果',
                'options' => [
                    'fade-up' => '向上淡入',
                    'fade' => '淡入',
                    'zoom' => '缩放淡入',
                    'slide-left' => '从左侧滑入',
                    'slide-right' => '从右侧滑入',
                ],
            ],
            [
                'type' => 'Switch',
                'name' => 'Show_Sidebar',
                'value' => true,
                'label' => '启用侧栏',
                'description' => '侧栏总开关；关闭后所有页面都不显示侧栏。',
            ],
            [
                'type' => 'Checkbox',
                'name' => 'Sidebar_Pages',
                'value' => ['home', 'archive', 'post', 'page'],
                'label' => '显示侧栏的页面',
                'description' => '仅在勾选的页面类型显示侧栏；归档包含分类、标签、搜索、作者与日期页面。',
                'options' => [
                    'home' => '首页',
                    'archive' => '归档',
                    'post' => '文章',
                    'page' => '独立页面',
                ],
            ],
            [
                'type' => 'Blocks',
                'name' => 'Sidebar_Modules',
                'value' => ['toc', 'user-card', 'site-card', 'recent-posts', 'categories', 'tags'],
                'label' => '侧栏模块顺序',
                'description' => '按顺序组合侧栏模块；没有内容或关闭对应功能的模块会自动跳过。',
                'placeholder' => '选择侧栏模块…',
                'reorder' => ['drag', 'buttons'],
                'options' => [
                    'toc' => ['label' => '文章目录'],
                    'user-card' => ['label' => '用户信息'],
                    'site-card' => ['label' => '站点卡片'],
                    'recent-posts' => ['label' => '最新文章'],
                    'categories' => ['label' => '文章分类'],
                    'tags' => ['label' => '热门标签'],
                ],
            ],
            [
                'type' => 'Select',
                'name' => 'Sidebar_Position',
                'value' => 'right',
                'label' => '侧栏位置',
                'description' => '桌面端正文与侧栏的排列方向。',
                'options' => [
                    'right' => '正文在左，侧栏在右',
                    'left' => '侧栏在左，正文在右',
                ],
            ],
            [
                'type' => 'Switch',
                'name' => 'Sidebar_Sticky',
                'value' => true,
                'inline' => true,
                'label' => '侧栏跟随滚动',
                'description' => '滚动长文时让侧栏保持在视口内；关闭后侧栏随页面正常滚动。',
            ],
            [
                'type' => 'Switch',
                'name' => 'Show_Toc',
                'value' => true,
                'inline' => true,
                'label' => '文章目录',
                'description' => '自动提取正文小标题生成目录；窄屏自动隐藏，正文没有小标题时不显示。',
            ],
            [
                'type' => 'Switch',
                'name' => 'Show_ReadingProgress',
                'value' => true,
                'inline' => true,
                'label' => '阅读进度条',
                'description' => '在文章与独立页面顶部显示阅读进度。',
            ],
            [
                'type' => 'Switch',
                'name' => 'Comments_Collapsed',
                'value' => true,
                'inline' => true,
                'label' => '评论区默认收起',
                'description' => '评论列表默认只显示前三条，读者点击“查看更多评论”后展开全部；关闭后直接显示全部评论。',
            ],
            [
                'type' => 'Switch',
                'name' => 'Comments_Require_Login',
                'value' => false,
                'inline' => true,
                'label' => '评论需要登录',
                'description' => '仅作用于文章与独立页面；论坛回复始终要求登录。开启后未登录读者只能查看评论，提交前会显示登录与注册入口。',
            ],
            [
                'type' => 'Switch',
                'name' => 'Comments_Memes',
                'value' => true,
                'inline' => true,
                'label' => '启用评论区表情',
                'description' => '读取 assets/meme.json，表情图片由访客浏览器直连 B 站 CDN 加载，不占用站点服务器出站带宽。',
            ],
            [
                'type' => 'Select',
                'name' => 'Footer_Layout',
                'value' => 'columns',
                'label' => '页脚布局',
                'description' => '多列适合信息较多的站点，紧凑适合单行导航，居中适合品牌型站点。',
                'options' => [
                    'columns' => '多列信息',
                    'compact' => '紧凑横排',
                    'centered' => '居中品牌',
                ],
            ],
            [
                'type' => 'Switch',
                'name' => 'Footer_Show_Categories',
                'value' => true,
                'inline' => true,
                'label' => '页脚显示文章分类',
                'description' => '关闭后页脚不输出分类列表。',
            ],
            [
                'type' => 'Switch',
                'name' => 'Footer_Show_Tags',
                'value' => true,
                'inline' => true,
                'label' => '页脚显示热门标签',
                'description' => '关闭后页脚不输出标签列表。',
            ],
            [
                'type' => 'Blocks',
                'name' => 'Footer_Blocks',
                'value' => ['brand', 'nav', 'categories', 'tags', 'meta'],
                'label' => '页脚模块顺序',
                'description' => '拖动排序，移除模块即可隐藏对应部分；自定义模块可以填写标题与说明。',
                'placeholder' => '选择页脚模块…',
                'reorder' => ['drag', 'buttons'],
                'options' => [
                    'brand' => [
                        'label' => '站点信息',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用站点标题'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 3, 'placeholder' => '留空使用站点描述或页脚文案'],
                        ],
                    ],
                    'nav' => [
                        'label' => '站内导航',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '站内导航'],
                        ],
                    ],
                    'categories' => [
                        'label' => '文章分类',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '文章分类'],
                        ],
                    ],
                    'tags' => [
                        'label' => '热门标签',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '热门标签'],
                        ],
                    ],
                    'custom' => [
                        'label' => '自定义文本',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '例如：关于本站'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '内容', 'rows' => 4, 'placeholder' => '支持多行纯文本'],
                        ],
                    ],
                    'meta' => ['label' => '版权信息'],
                ],
            ],
                ],
];
