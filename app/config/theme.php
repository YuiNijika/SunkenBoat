<?php

declare(strict_types=1);

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

return [
    'General' => [
        'title' => '基础设置',
        'tabs' => [
            'general' => [
                'title' => '一般设置',
                'description' => '站点标识、副标题与页脚文案。',
                'fields' => [
                    [
                        'type' => 'Media',
                        'name' => 'Logo',
                        'value' => '',
                        'label' => '站点 Logo',
                        'description' => '从媒体库选择图片；留空时显示站点标题。值保存为图片地址。',
                        'aliases' => ['logoUrl'],
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'SubTitle',
                        'value' => '',
                        'label' => '副标题',
                        'description' => '显示在站点标题下方，留空则不显示。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'FooterText',
                        'value' => '',
                        'label' => '页脚文本',
                        'description' => '支持纯文本，输出时会自动转义。',
                    ],
                ],
            ],
            'navigation' => [
                'title' => '导航设置',
                'description' => '页头标题、前台用户入口与自定义导航。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Show_Title',
                        'value' => true,
                        'inline' => true,
                        'label' => '显示站点标题',
                        'description' => '关闭后页头只显示 Logo；没有设置 Logo 时仍会显示站点标题，避免导航无法识别站点。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'Show_UserCenter',
                        'value' => true,
                        'inline' => true,
                        'label' => '前台用户中心',
                        'description' => '关闭后隐藏页头用户按钮。登录、查看资料与退出登录依赖 REST v2，请先在运行配置中开启。',
                    ],
                    [
                        'type' => 'Nav',
                        'name' => 'Nav_Items',
                        'value' => [],
                        'label' => '自定义导航',
                        'description' => '最多 12 个一级导航、每项最多 8 个二级导航。留空时自动使用首页与 Typecho 独立页面。链接支持 https://、以 / 开头的站内路径和 # 锚点。',
                    ],
                ],
            ],
            'colors' => [
                'title' => '颜色设置',
                'description' => '浅色与深色模式下的主题色和页面底色。',
                'fields' => [
                    [
                        'type' => 'Select',
                        'name' => 'Color_Mode',
                        'value' => 'auto',
                        'label' => '默认配色',
                        'description' => '访客首次访问时使用的配色；页头右上角的切换按钮仍可临时覆盖，选择会保存在访客浏览器里。',
                        'options' => [
                            'auto' => '跟随系统',
                            'light' => '浅色',
                            'dark' => '深色',
                        ],
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Accent',
                        'value' => '#2563eb',
                        'inline' => true,
                        'label' => '浅色模式主色',
                        'description' => '按钮、链接与强调元素；留空使用主题默认色。',
                        'predefine' => ['#2563eb', '#0f9d58', '#7c5cff', '#e0435c', '#b45309', '#0e7490'],
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Accent_Dark',
                        'value' => '#7d9bff',
                        'inline' => true,
                        'label' => '深色模式主色',
                        'description' => '深色模式下的按钮、链接与强调元素；留空使用主题默认色。',
                        'predefine' => ['#7d9bff', '#8ab4ff', '#b39dff', '#ff8fa3', '#ffb26b', '#7bd88f'],
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Background',
                        'value' => '#f5f6f7',
                        'inline' => true,
                        'label' => '浅色模式背景',
                        'description' => '页面底色；留空使用主题默认色。',
                    ],
                    [
                        'type' => 'ColorPicker',
                        'name' => 'Color_Background_Dark',
                        'value' => '#15171c',
                        'inline' => true,
                        'label' => '深色模式背景',
                        'description' => '深色模式下的页面底色；留空使用主题默认色。',
                    ],
                ],
            ],
            'thumbnails' => [
                'title' => '缩略图',
                'description' => '列表卡片与首屏文章的缩略图来源。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Thumbnail_Use_First_Image',
                        'value' => true,
                        'label' => '未设置缩略图时取正文首图',
                        'description' => '文章或页面没有设置 Thumbnail 字段时，尝试从正文第一张图片生成缩略图。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'Thumbnail_Default',
                        'value' => '',
                        'media' => true,
                        'rows' => 3,
                        'label' => '默认缩略图',
                        'description' => '每行一个图片地址；没有缩略图字段且未启用正文首图，或正文首图无法解析时，从这些图片中随机选择一张。留空则使用主题内置 assets/img/thumbnail.svg。',
                    ],
                ],
            ],
        ],
    ],
    'Layout' => [
        'title' => '布局与区块',
        'tabs' => [
            'general' => [
                'title' => '全局布局',
                'description' => '侧栏、目录、阅读进度与页脚。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Layout_Modules',
                'value' => ['reading-progress', 'header', 'main', 'footer', 'action-rail'],
                'label' => '全局模块顺序',
                'description' => '按顺序组合页面骨架；main 是正文主内容区，缺失时会自动追加到末尾。',
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
                'value' => ['toc', 'site-card', 'recent-posts', 'categories', 'tags'],
                'label' => '侧栏模块顺序',
                'description' => '按顺序组合侧栏模块；没有内容或关闭对应功能的模块会自动跳过。',
                'placeholder' => '选择侧栏模块…',
                'reorder' => ['drag', 'buttons'],
                'options' => [
                    'toc' => ['label' => '文章目录'],
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
                'description' => '在文章与独立页面右侧显示由正文 h2/h3 生成的目录；窄屏自动隐藏，正文没有小标题时不显示。',
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
                ],
            ],
            'templates' => [
                'title' => '模板映射',
                'description' => '为 Typecho 各页面类型指定 app/components 组件；留空时使用入口模板回退。',
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
                'label' => '模板映射',
                'description' => '为每个页面入口选择渲染组件；留空时使用入口模板回退。',
            ],
                ],
            ],
            'home' => [
                'title' => '首页',
                'description' => '首页首屏、轮播、文章列表与分类区块。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Home_Blocks',
                'value' => ['hero', 'carousel', 'post-list:list', 'categories'],
                'label' => '首页区块',
                'description' => '拖动左侧手柄调整顺序；展开箭头可补写区块标题与文案。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => [
                    'hero' => [
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
                        ],
                    ],
                    'post-list' => [
                        'label' => '文章列表',
                        'variants' => ['grid' => '双列卡片', 'list' => '横向卡片'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用默认标题'],
                            ['type' => 'Category', 'name' => 'category', 'label' => '限定分类', 'placeholder' => '全部分类'],
                            ['type' => 'Text', 'name' => 'empty', 'label' => '空状态文案', 'placeholder' => '这里还没有文章。'],
                        ],
                    ],
                    'carousel' => [
                        'label' => '轮播图',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空不显示标题'],
                            ['type' => 'Slides', 'name' => 'slides', 'label' => '轮播项目'],
                        ],
                    ],
                    'categories' => [
                        'label' => '分类导航',
                        'variants' => ['grid' => '卡片', 'chips' => '标签'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '分类'],
                        ],
                    ],
                    'cta' => [
                        'label' => '订阅提示',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 3],
                            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案'],
                            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接'],
                        ],
                    ],
                    'divider' => ['label' => '分隔线', 'variants' => ['default' => '细线', 'dashed' => '虚线']],
                    'spacer' => ['label' => '留白', 'variants' => ['sm' => '小', 'md' => '中', 'lg' => '大']],
                ],
            ],
                ],
            ],
            'archive' => [
                'title' => '归档',
                'description' => '分类、标签、搜索、作者与日期归档的区块。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Archive_Blocks',
                'value' => ['archive-header', 'post-list:list'],
                'label' => '归档区块',
                'description' => '分类、标签、搜索、作者、日期等归档页面使用的区块。可选：archive-header（归档标题）、post-list（variant：grid/list）、categories（variant：grid/chips）、search、divider、spacer。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => [
                    'archive-header' => [
                        'label' => '归档标题',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空使用 Typecho 归档标题'],
                            ['type' => 'Textarea', 'name' => 'description', 'label' => '说明', 'rows' => 3],
                        ],
                    ],
                    'post-list' => [
                        'label' => '文章列表',
                        'variants' => ['grid' => '双列卡片', 'list' => '横向卡片'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '留空不显示'],
                            ['type' => 'Category', 'name' => 'category', 'label' => '限定分类', 'placeholder' => '使用当前归档'],
                            ['type' => 'Text', 'name' => 'empty', 'label' => '空状态文案'],
                        ],
                    ],
                    'categories' => [
                        'label' => '分类导航',
                        'variants' => ['grid' => '卡片', 'chips' => '标签'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '分类'],
                        ],
                    ],
                    'search' => [
                        'label' => '站内搜索',
                        'variants' => ['default' => '标准', 'panel' => '卡片'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
                            ['type' => 'Text', 'name' => 'placeholder', 'label' => '输入框占位'],
                            ['type' => 'Text', 'name' => 'button_label', 'label' => '按钮文案'],
                        ],
                    ],
                    'divider' => ['label' => '分隔线', 'variants' => ['default' => '细线', 'dashed' => '虚线']],
                    'spacer' => ['label' => '留白', 'variants' => ['sm' => '小', 'md' => '中', 'lg' => '大']],
                ],
            ],
                ],
            ],
            'post' => [
                'title' => '文章',
                'description' => '文章正文、标签、前后文章与评论区块。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Post_Blocks',
                'value' => ['prose', 'tags', 'post-nav', 'comments'],
                'label' => '文章区块',
                'description' => '文章详情页使用的区块。标题、分类、作者、日期与正文已合并到 prose 卡片；可选：prose（标题、元信息、正文、目录与代码复制）、tags（标签）、post-nav（上一篇/下一篇）、comments（评论区）、divider、spacer。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => [
                    'prose' => [
                        'label' => '正文内容',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'toc_title', 'label' => '目录标题', 'placeholder' => '本页目录'],
                        ],
                    ],
                    'tags' => [
                        'label' => '标签',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '标签'],
                        ],
                    ],
                    'post-nav' => ['label' => '前后文章'],
                    'comments' => [
                        'label' => '评论区',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '评论'],
                        ],
                    ],
                    'divider' => ['label' => '分隔线', 'variants' => ['default' => '细线', 'dashed' => '虚线']],
                    'spacer' => ['label' => '留白', 'variants' => ['sm' => '小', 'md' => '中', 'lg' => '大']],
                ],
            ],
                ],
            ],
            'page' => [
                'title' => '独立页面',
                'description' => '独立页面标题、正文与评论区块。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'Page_Blocks',
                'value' => ['page-header', 'prose', 'comments'],
                'label' => '独立页面区块',
                'description' => '独立页面（page）使用的区块。可选：page-header（页面标题，variant：default/compact）、prose、comments、divider、spacer。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => [
                    'page-header' => [
                        'label' => '页面标题',
                        'variants' => ['default' => '标准', 'compact' => '紧凑'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
                        ],
                    ],
                    'prose' => [
                        'label' => '正文内容',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'toc_title', 'label' => '目录标题', 'placeholder' => '本页目录'],
                        ],
                    ],
                    'comments' => [
                        'label' => '评论区',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '评论'],
                        ],
                    ],
                    'divider' => ['label' => '分隔线', 'variants' => ['default' => '细线', 'dashed' => '虚线']],
                    'spacer' => ['label' => '留白', 'variants' => ['sm' => '小', 'md' => '中', 'lg' => '大']],
                ],
            ],
                ],
            ],
            'notfound' => [
                'title' => '404',
                'description' => '错误页提示、搜索与订阅入口。',
                'fields' => [
            [
                'type' => 'Blocks',
                'name' => 'NotFound_Blocks',
                'value' => ['notfound', 'search'],
                'label' => '404 区块',
                'description' => '404 页面使用的区块。可选：notfound（提示文案）、search、cta、link-list（链接列表，仅自定义路由可传入条目）、divider、spacer。',
                'placeholder' => '选择区块…',
                'reorder' => ['drag'],
                'options' => [
                    'notfound' => [
                        'label' => '404 提示',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题', 'placeholder' => '这里没有内容'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 3],
                            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案', 'placeholder' => '返回首页'],
                            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接', 'placeholder' => '留空使用站点首页'],
                        ],
                    ],
                    'search' => [
                        'label' => '站内搜索',
                        'variants' => ['default' => '标准', 'panel' => '卡片'],
                        'fields' => [
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
                            ['type' => 'Text', 'name' => 'placeholder', 'label' => '输入框占位'],
                            ['type' => 'Text', 'name' => 'button_label', 'label' => '按钮文案'],
                        ],
                    ],
                    'cta' => [
                        'label' => '订阅提示',
                        'fields' => [
                            ['type' => 'Text', 'name' => 'eyebrow', 'label' => '引导语'],
                            ['type' => 'Text', 'name' => 'title', 'label' => '标题'],
                            ['type' => 'Textarea', 'name' => 'text', 'label' => '说明', 'rows' => 3],
                            ['type' => 'Text', 'name' => 'action_label', 'label' => '按钮文案'],
                            ['type' => 'Text', 'name' => 'action_url', 'label' => '按钮链接'],
                        ],
                    ],
                    'divider' => ['label' => '分隔线', 'variants' => ['default' => '细线', 'dashed' => '虚线']],
                    'spacer' => ['label' => '留白', 'variants' => ['sm' => '小', 'md' => '中', 'lg' => '大']],
                ],
            ],
                ],
            ],
        ],
    ],
    'Runtime' => [
        'title' => '运行配置',
        'tabs' => [
            'general' => [
                'title' => '一般设置',
                'description' => '调试与静态资源。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'Debug_Switch',
                        'value' => false,
                        'label' => '调试模式',
                        'description' => '开启后记录详细错误堆栈并显示错误详情；生产环境请关闭。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'Assets_CDN',
                        'value' => '',
                        'label' => '静态资源 CDN',
                        'description' => '留空使用主题本地资源；仅支持 http(s) 地址，非法地址会自动回退。',
                    ],
                ],
            ],
            'rest' => [
                'title' => 'REST API',
                'description' => '公开接口、跨域、Token 与 v2 写接口。',
                'fields' => [
                    [
                        'type' => 'Switch',
                        'name' => 'RESTAPI_Switch',
                        'value' => false,
                        'group' => 'rest',
                        'label' => 'REST API 总开关',
                        'description' => '同时控制 /ttdf/v1 公开只读接口与 /ttdf/v2 完整接口。关闭后仅保留需要管理员登录与 nonce 的后台接口。',
                    ],
                    [
                        'type' => 'Textarea',
                        'name' => 'CORS_Origins',
                        'value' => '',
                        'group' => 'rest',
                        'label' => 'CORS 白名单',
                        'description' => '每行一个完整 Origin，例如 https://example.com。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'REST_Token_Switch',
                        'value' => false,
                        'group' => 'rest',
                        'inline' => true,
                        'label' => '启用公开 REST Token',
                        'description' => '开启后，/ttdf/v1 公共只读接口必须携带 Authorization: Bearer <token>；Token 值来自下方环境变量。后台管理接口不受影响。',
                    ],
                    [
                        'type' => 'Switch',
                        'name' => 'RESTV2_Switch',
                        'value' => false,
                        'group' => 'rest',
                        'inline' => true,
                        'label' => '启用 v2 写接口',
                        'description' => '仅在 REST API 总开关开启后生效。/ttdf/v2 提供登录、评论与内容管理接口，可用 API 完整驱动站点。',
                    ],
                    [
                        'type' => 'Text',
                        'name' => 'REST_Token_Env',
                        'value' => 'TTDF_REST_TOKEN',
                        'group' => 'rest',
                        'show_when' => ['REST_Token_Switch' => true],
                        'label' => '公共 REST Token 环境变量名',
                        'description' => '开关开启时才生效。这里填环境变量名，不是 Token 本身；例如 TTDF_REST_TOKEN，需在 PHP-FPM 或 Web 服务器环境中设置同名值（至少 32 字符）。开关开启但变量未配置时，公共 REST 返回 500。',
                    ],
                    [
                        'type' => 'Number',
                        'name' => 'RESTV2_Token_TTL',
                        'value' => 604800,
                        'group' => 'rest',
                        'show_when' => ['RESTV2_Switch' => true],
                        'label' => 'v2 Token 有效期（秒）',
                        'description' => '登录接口签发的 Token 有效时长，最少 300 秒、最多 2592000 秒（30 天）；留 0 使用默认 7 天。',
                        'min' => 0,
                        'max' => 2592000,
                        'step' => 3600,
                    ],
                ],
            ],
        ],
    ],
];
