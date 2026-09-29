# GitHub Pages、Supabase 与高德地图开通指南

更新日期：2026-09-29。本文用于**取得项目所需资源**。你已建立仓库和 Supabase 项目，并取得高德与 DeepSeek Key；首版代码已开始实现。现阶段请优先按照 [DEPLOYMENT.md](DEPLOYMENT.md) 初始化数据库、部署云函数和发布 Pages。下文保留账号获取方法供以后参考。

## 先看整体关系

| 服务 | 在本项目中的作用 | 你需要取得什么 |
| --- | --- | --- |
| GitHub 仓库＋GitHub Pages | 保存网站代码、发布访客和管理员网页 | GitHub 用户名、仓库地址，最终得到 `https://用户名.github.io/仓库名/` |
| Supabase | 数据库、邮箱密码登录、收藏、申请、后台权限和服务端函数 | Project URL、Publishable Key；服务端另有 Secret Key |
| 高德开放平台 | 广州地图、地点搜索／定位、地址转坐标、公交地铁通勤 | 一组 Web端(JS API) Key＋安全密钥，另一组 Web 服务 Key |
| DeepSeek（后续接入） | 管理员上传 TXT 后辅助解析 | API Key，保存在服务端，不放进网页 |

GitHub Pages 只能发布静态网站，不能单独运行数据库和服务端代码，所以网页需要连接 Supabase。后台权限必须由 Supabase 的数据库权限／RLS 和服务端函数执行，不能仅靠“隐藏后台按钮”。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、[Supabase API Key 与 RLS 说明](https://supabase.com/docs/guides/getting-started/api-keys)。

> **不要把整个文件夹通过网页上传到公开仓库。** `student1.txt` 含详细地址和学生情况，不能进入公开 GitHub 或 Pages 包。项目已有 `.gitignore` 和不含原文、联系方式及门牌的演示样例。公开二维码已复制到 `public/qrcode.png`；原始 TXT 保留在本地，仅正式后台上传。

## 一、创建 GitHub 仓库

1. 打开 [GitHub 注册／登录页](https://github.com/signup)；已有账号直接登录。如果你希望网址以 `sherlockedjim.github.io` 开头，仓库必须建在对应的 `sherlockedjim` 账号下。
2. 打开 [新建仓库页面](https://github.com/new)，在 **Owner** 选择你的个人账号，在 **Repository name** 输入想要的网址尾部，例如 `examplee` 或 `find-your-student`。仓库名决定最终网址：选择 `examplee`，示例地址就是 `https://sherlockedjim.github.io/examplee/`。
3. 如果使用 GitHub Free，选择 **Public**，因为免费个人账号的 GitHub Pages 面向公开仓库；部分付费方案也允许从私有仓库发布，但**最终网站本身仍是公开的**。[GitHub Pages 仓库可见性说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
4. 目前本地已有文件，建议新仓库**先不要勾选**“Add a README file”“Add .gitignore”或许可证，保持空仓库，等完成隐私检查后再推送代码；GitHub 也提醒导入现有项目时预先初始化可能造成合并冲突。[GitHub 创建仓库说明](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)。
5. 点击 **Create repository**，保存仓库页面网址，例如 `https://github.com/sherlockedjim/examplee`。现在**不需要上传文件**，也不需要提供 GitHub 密码给我。

### 网站写好后开启 Pages

1. 进入该仓库的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。本项目预期需要构建前端，因此以后会提供适配仓库子路径的部署工作流；现阶段没有工作流，选择此项不会自动生成可用网站。[GitHub Pages 发布源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
3. 待代码推送并且 Actions 构建成功，在 **Settings → Pages** 查看正式网址。若网页样式或资源出现 404，需要检查前端构建的 `base` 是否设置成 `/<仓库名>/`；这一步会在实现时配置。

**不要绕过 `.gitignore` 上传文件。** 使用 `git add .` 后务必检查 `git status --short`，确认 TXT、`.env.local`、数据库导出、申请表、Excel、Supabase Secret Key、高德安全密钥和 Web 服务 Key 均未进入待提交列表。已公开的敏感内容即使删除，Git 历史仍可能保留。

## 二、创建 Supabase 项目

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)，注册或登录。没有组织（Organization）时，按界面提示先建一个个人组织。
2. 点击 **New project**，选择所属组织，填写项目名称（例如 `findyourstudent`），设置**独立且足够强的数据库密码**，保存在你自己的密码管理器中。不要在聊天里发送这个密码。[Supabase 创建项目入门](https://supabase.com/docs/guides/getting-started/quickstarts/vue)。
3. 选择数据存储区域。项目创建后不能直接改区域，需要新建项目再迁移；广州访客可在可用的亚太区域中评估，但这同时决定学生数据的存储位置。请以你能接受的数据存储地点和实际访问测试为准，不要仅凭“最近”决定。[Supabase 区域说明](https://supabase.com/docs/guides/platform/regions)、[修改区域说明](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z)。
4. 核对当前套餐、额度后点击创建，等待数据库准备完成。Supabase 当前有 Free 套餐用于开始测试，但额度、项目数量和计费规则可能变化，创建前看 [官方计费说明](https://supabase.com/docs/guides/platform/billing-on-supabase)。
5. 在项目首页点 **Connect**，找到并记录 **Project URL**（形如 `https://xxxxx.supabase.co`）和 **Publishable Key**（形如 `sb_publishable_...`）；也可在 **Settings → API Keys** 找到。浏览器前端将用到这两项，但前提是数据库 RLS 权限正确。[Supabase 查找 Key](https://supabase.com/docs/guides/getting-started/api-keys)。
6. **Secret Key**（形如 `sb_secret_...`）是服务端凭据，权限远高于 Publishable Key。不要发到聊天、不要放入 GitHub 仓库、GitHub Pages、`VITE_` 前缀环境变量或任何浏览器代码。以后由 Supabase Edge Function 的 **Secrets** 安全读取。[Supabase Key 类型](https://supabase.com/docs/guides/getting-started/api-keys)、[Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)。

### 为邮箱登录预留设置

访客收藏需要邮箱密码注册；管理员也用邮箱密码，但**注册访客不会自动成为管理员**。主管理员的初始授权和邀请流程要等数据库／后台代码完成后再设置，不要用前端参数来决定谁是管理员。

1. 进入 **Authentication → Sign In / Providers → Email**，确认邮箱密码方式可用。托管的 Supabase 项目默认要求确认邮箱；建议测试和正式使用时保留邮箱确认。[Supabase 邮箱密码登录](https://supabase.com/docs/guides/auth/passwords)。
2. 网站正式地址确定后，进入 **Authentication → URL Configuration**，将 **Site URL** 设为完整 Pages 地址，例如 `https://sherlockedjim.github.io/examplee/`；把登录确认、找回密码使用的实际回调路径加入 **Redirect URLs**。本地调试地址只在开发期另行加入，不要把生产设置一直留在默认 `localhost`。[Supabase Redirect URL 设置](https://supabase.com/docs/guides/auth/redirect-urls)。
3. Supabase 的默认邮件服务适合少量测试，不应直接当作大量访客注册邮件服务；正式开放注册前，检查邮件发送限制，并视使用量配置自己的 SMTP。[Supabase 邮件发送说明](https://supabase.com/docs/guides/auth/passwords)。
4. **不要另外手工设计订单表。** 本项目已提供 `supabase/migrations/202609290001_initial.sql`，按部署文档一次运行，并配置主管理员。项目创建成功不等于后台权限已配置完成。

## 三、获取高德地图 Key

这个项目建议在**同一个高德应用下创建两种不同平台的 Key**，不要把一种 Key 混用到另一种 API。

1. 打开 [高德开放平台控制台](https://console.amap.com/)，注册／登录开发者账号，按控制台提示完成所需的开发者认证。
2. 进入 **应用管理**，点击 **创建新应用**，例如命名为 `FindYourStudent`。[高德 JS API 准备文档](https://lbs.amap.com/api/javascript-api-v2/prerequisites)。
3. 在该应用中点击 **添加 Key**，服务平台选择 **Web端（JS API）**。保存 **Key** 和配套的 **安全密钥（securityJsCode）**。它用于浏览器地图、缩放、标记和地点交互。新申请的 JS Key 需要配合安全密钥使用。[高德 JS Key 创建步骤](https://lbs.amap.com/api/javascript-api-v2/prerequisites)。
4. 再点击 **添加 Key**，这次服务平台选择 **Web 服务**，保存第二个 Key。它用于地址转坐标和公交地铁路线／通勤计算；这些调用计划放在服务端。[高德 Web 服务 Key 创建步骤](https://lbs.amap.com/api/webservice/guide/create-project/get-key)、[公交路线规划 2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)。
5. 在控制台检查所选服务的当前额度、调用限制及可配置的安全限制。公交地铁通勤按访客位置与订单位置查询，调用量可能随访客和单子数增加；不应假定所有请求永远免费。

**重要安全区别：** JS API 的普通 Key 会随地图脚本请求出现在浏览器里，但其 **securityJsCode 不应以明文写进正式网页**。高德官方推荐放在服务端、通过代理转发；直接在前端设置安全密钥只适合便捷开发，不推荐生产使用。GitHub Pages 自身不能运行这个代理，后续实现阶段要用 Supabase 服务端函数或其他受控后端完成并测试。**Web 服务 Key 也只存服务端。**[高德 JS 安全密钥官方说明](https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode)、[GitHub Pages 静态托管限制](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。

## 四、后续接入 DeepSeek（本次可先不做）

管理员 TXT 解析已确定可把完整原文发送给 DeepSeek。届时需要你自己在 [DeepSeek 开放平台](https://platform.deepseek.com/)创建 API Key，并按 [官方价格页](https://api-docs.deepseek.com/quick_start/pricing/)查看调用费用。Key 只写入 Supabase Edge Function 的 Secrets，不进入 Pages 页面或 GitHub。AI 提取结果必须经过字段校验；你已经选择“确认入库后正常单立即上架”，因此预览页需要显著提示隐私、位置、编号及价格异常，再允许确认。

## 五、创建完成后怎样告诉我

只需回传下列**非秘密信息**：

- GitHub 用户名和新仓库网址；仓库可以先保持空白。
- Supabase 项目是否已创建，以及 Project URL（不需要发送 Key、数据库密码）。
- 高德是否已经创建 **Web端(JS API)** 和 **Web 服务** 两种 Key；只回答“已创建／未创建”，**不要粘贴 Key 或安全密钥**。
- 确认当前 `qrcode.png` 就是准备给所有访客看的微信二维码。

首版源码与数据库迁移位于当前项目。**本地演示可用不代表已正式上线，也不代表真实邮件、地图 Key 和云函数已完成联调。** 请按部署文档逐项配置并验证。

## 六、常见问题速查

| 表现 | 优先检查 |
| --- | --- |
| Pages 打开后白屏、图片或 JS 404 | 仓库名与构建 `base` 是否一致；Actions 是否成功部署 |
| 注册邮件把人带回 `localhost` | Supabase 的 Site URL／Redirect URLs 是否改为正式 Pages 地址 |
| 地图不显示或提示鉴权失败 | JS Key 平台类型、securityJsCode 的安全代理及高德额度 |
| 公交地铁时间查不到 | Web 服务 Key、起终点近似坐标、查询日期时间和接口额度 |
| 登录成功却读不到订单 | 数据库迁移、RLS 策略、用户角色；不要用 Secret Key 放宽浏览器权限 |
| 不小心把原始 TXT 或密钥推送到公开仓库 | 立即停止继续发布；密钥需要到原平台轮换，敏感数据需检查 Git 历史而不只是删除最新文件 |
