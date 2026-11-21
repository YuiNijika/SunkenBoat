![SunkenBoat](screenshot.jpg)

# SunkenBoat

SunkenBoat 是一套使用 TTDF Next 构建的 Typecho 主题。

- PHP 8.2+ / Typecho 1.2.1+ 或 1.3.x
- Vite + React + Tailwind CSS
- 明暗配色、搜索、目录、阅读进度、代码高亮与复制、图片灯箱、返回顶部
- 首页只保留站点介绍与最新文章，文章页专注阅读
- 前台登录/注册、账号安全设置、邮箱验证码、找回密码与 OAuth 社交账号绑定
- 文章与帖子资源下载、每日免费额度、付费订单与用户中心下载记录

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
