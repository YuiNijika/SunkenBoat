# SunkenBoat

SunkenBoat 是一套使用 TTDF Next 构建的 Typecho 主题，面向长文阅读。

- PHP 8.2+ / Typecho 1.2.1+ 或 1.3.x
- Vite + React 岛 + Tailwind CSS
- 明暗配色、搜索、目录、阅读进度、代码复制、返回顶部
- 首页只保留站点介绍与最新文章，文章页专注阅读

## 目录

```text
functions.php                         唯一 PHP 入口，仅启动 TTDF
index.php                             Typecho 主题元信息与版本号
vendor/yuinijika/ttdf/                TTDF 框架，只读依赖区
app/config/app.php                    运行配置：debug、REST、router、Vite
app/config/theme.php                  后台主题设置字段
app/config/fields.php                 文章与页面自定义字段
app/pages/                            Typecho 页面类型模板
app/components/layout/                页头、页尾
app/components/content/               文章、页面、归档、卡片、评论
app/components/home/                  首页 Hero 与首页布局
app/router/                           TTDF 自定义 URL
assets/style.css                      设计变量与正文排版
assets/dist/                          Vite 生产构建产物
vite/                                 React 源码与 Vite 配置
```

## 开发

安装依赖并启动 Vite：

```bash
pnpm --dir vite install
php vendor/yuinijika/ttdf/bin/ttdf dev --vite
pnpm --dir vite dev
```

生产构建与关闭开发模式：

```bash
pnpm --dir vite build
php vendor/yuinijika/ttdf/bin/ttdf dev --off
```

构建会写入 `assets/dist/`，PHP 通过 TTDF 的 `manifest` 读取带哈希的 JS 与 CSS，不需要修改模板。

## 前端挂载

PHP 只需输出挂载点：

```html
<div data-ttdf-component="ThemeToggle"></div>
```

`vite/src/main.tsx` 自动扫描 `[data-ttdf-component]`，从 `data-*` 读取 props，并把对应 React 岛挂载到该节点。未知组件在开发模式下只输出控制台警告，不会阻断页面。

## 文档

- 主题开发 Skill：<https://blog.miomoe.cn/docs/skill/typecho-theme-dev>
- TTDF v5 文档：<https://blog.miomoe.cn/docs/ttdf/v5/index>

线上文档是唯一真源，仓库内不维护完整文档副本。

## License

MIT
