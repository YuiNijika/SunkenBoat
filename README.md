# SunkenBoat

SunkenBoat 是一套使用 TTDF Next 构建的 Typecho 主题，面向长文阅读。

- PHP 8.2+ / Typecho 1.2.1+ 或 1.3.x
- Vite + React 岛 + Tailwind CSS
- 明暗配色、搜索、目录、阅读进度、代码高亮与复制、图片灯箱、返回顶部
- 首页只保留站点介绍与最新文章，文章页专注阅读
- 前台登录/注册、账号安全设置、邮箱验证码、找回密码与 OAuth 社交账号绑定

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
vendor/phpmailer/phpmailer/           随主题分发的 PHPMailer
vite/                                 React 源码与 Vite 配置
```

## 账号与邮件

用户按钮点击后展开账号菜单；未登录时打开登录对话框，可按 Typecho 后台的“允许注册”设置切换登录与注册。注册、找回密码和更换邮箱可分别要求邮箱验证码。

用户中心拆分为 `/user/profile`（个人资料）、`/user/account`（账号安全）和 `/user/social`（社交账号）。登录后可在个人资料修改显示名称、个人主页，在账号安全修改登录邮箱和密码。开启“更多资料”后，个人资料会多出个性签名、性别、隐私设置和居住地，用户可自行填写；QQ、微信、微博、GitHub 等社交账号不提供手工填写，统一在“社交账号”中通过 OAuth 授权绑定。修改密码会轮换用户 `authCode`，其他设备上的旧登录凭证随之失效。

更多资料与 OAuth 绑定按用户保存（Typecho 用户级 `options` 行，作用等同于子比的 user meta），不修改 `users` 表结构，因此切换主题不会留下孤立字段。主题设置“用户&邮件 → 邮件设置”中配置 SMTP；PHPMailer 7 已随主题放在 `vendor/phpmailer/phpmailer/`，生产环境不需要安装 Composer 或 Node.js。

主题设置“用户&邮件 → OAuth 登录”可分别启用 QQ、微信、微博、GitHub、Gitee、GitLab、Google、Microsoft、华为与小米；“用户&邮件 → 第三方登录”集中配置 BlogsClub、鼠子 Blog、彩虹聚合登录与子比主题开放登录。各平台后台的回调地址必须填写为 `站点地址/ttdf/oauth/{provider}/callback`；彩虹与子比使用固定回调地址 `站点地址/ttdf/oauth/caihong/callback`、`站点地址/ttdf/oauth/zibll/callback`，在后台用穿梭框选择需要展示的平台后，每个平台会生成独立的登录按钮与绑定项。

“首次授权处理”提供“绑定已有账号”和“自动注册新账号”两种模式。绑定模式会要求用户输入本站已有账号的用户名或邮箱与密码，验证通过后才写入社交绑定；自动注册模式仍受 Typecho 后台“是否允许注册”控制，注册关闭时会自动回退到绑定页面。OAuth 关闭时登录框不显示社交登录按钮，用户中心也不显示“社交账号”标签。

REST v2 提供以下账号接口与扩展钩子：

- `POST /ttdf/v2/auth/register`
- `POST /ttdf/v2/auth/email-code`
- `POST /ttdf/v2/auth/reset-password`
- `POST /ttdf/v2/auth/password`
- `PATCH /ttdf/v2/me`

验证码只通过 `rest.v2.email_code.send` 钩子交给服务端发送，不会出现在 API 响应中。注册、重置密码、邮箱变更、密码修改和验证码发送前后均可通过 `rest.v2.*` 钩子扩展验证策略。

## 正文增强

文章与页面正文在 React 挂载后会增强阅读体验：

- 代码块按 `language-*` / `lang-*` 提示使用 highlight.js 高亮，未知语言回退到自动识别。
- 代码块使用深色语言栏，显示语言名称、识别图标和复制按钮，复制的是原始代码文本。
- 正文图片可点击打开灯箱，支持左右方向键切换、`Esc` 关闭、点击背景关闭和查看原图。
- 灯箱关闭后会把焦点还给触发图片，并恢复页面滚动。

## 内容区块

首页、归档、文章、独立页面与 404 页面都在“页面&显示”中按页面类型配置区块。除首屏、轮播、文章列表、分类、正文、评论等页面专属区块外，所有页面共用以下内容区块：

- 提示框：信息、成功、警告、错误四种状态，可带按钮。
- 公告条：柔和、强调、深色三种样式，支持全宽、半宽与内容宽度。
- 引用：标准与大字两种排版，可填写出处与出处链接。
- 特性卡片：两列、三列或四列，每行填写 `标题|说明|链接`。
- 数据统计：留空统计项时自动读取站点文章、评论、分类与标签数量，也可每行填写 `数值|标签`。
- 步骤说明：纵向或网格排列，每行填写 `标题|说明`。
- 常见问题：原生折叠面板，每行填写 `问题|答案`。
- 时间线：每行填写 `日期|标题|说明`。
- 图片画廊：两列、三列或四列，图片从媒体库选择，点击后打开灯箱。
- 表格：表头与单元格使用 `|` 分隔。
- 作者名片：支持头像、身份、简介与社交链接。
- 订阅卡片：主按钮默认回退到站点 RSS 地址。
- 链接列表：每行填写 `标题|说明|链接`。

所有多行字段都有条数上限，链接只接受 `http(s)`、`mailto`、`tel`、站内根路径、锚点与相对路径；`javascript:`、`data:` 等危险协议会被丢弃。区块内容按纯文本渲染，不开放任意 HTML 或脚本字段。

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
