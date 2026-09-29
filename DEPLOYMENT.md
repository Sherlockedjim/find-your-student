# 首版部署操作手册

目标网址：`https://sherlockedjim.github.io/find-your-student/`。这只是部署目标；必须 GitHub Actions 成功后才实际可访问。

## 1. 先本地查看

在项目文件夹运行 `npm ci`、`npm run dev`，打开终端提供的地址。默认演示模式可查看访客页、体验后台、上传 TXT、编辑预览和下载测试 Excel。真实资料不在前端包中；正式上线后由管理员在后台上传。

## 2. 初始化 Supabase 数据库

1. 打开 https://supabase.com/dashboard ，进入你的项目。
2. 左侧 **SQL Editor → New query**。
3. 复制 `supabase/migrations/202609290001_initial.sql` 全文，运行一次。只适用于空白项目，重复执行会报表已存在；不要删除已有数据库来重跑。
4. 左侧 **Authentication → Users → Add user**，用主管理员邮箱创建用户并设置你自己的强密码，确认邮箱。不要把密码发送到聊天或提交到 GitHub。
5. 新建 SQL，替换下面的 `你的主管理员邮箱` 后运行。该段含私人邮箱，替换后不要提交到公开仓库。

```sql
insert into public.admin_accounts(user_id,email,role,enabled)
select id,email,'owner',true from auth.users
where lower(email)=lower('你的主管理员邮箱');
```

6. 确认 Table Editor 的 `admin_accounts` 有一条 `owner / enabled=true`；没有记录说明 Auth 用户尚未创建成功。

正式后台采用邮箱密码登录。访客注册不自动获得管理员权限；主管理员登录后台「管理员账号」才能邀请或停用其他管理员。

## 3. Auth 邮件与回跳地址

Authentication → URL Configuration：

- Site URL：`https://sherlockedjim.github.io/find-your-student/`
- Redirect URLs 添加：`https://sherlockedjim.github.io/find-your-student/**`
- 本地联调再添加：`http://127.0.0.1:5173/**`

启用 Email provider、邮箱确认，设置最少8位密码。生产使用需在 Auth 的 SMTP 设置中配置你自己的邮件服务，否则默认测试邮件服务的收件人限制与配额可能导致注册 / 邀请无法送达。用一个实际非管理员邮箱验证注册邮件。邀请与找回密码链接进入网站后会显示设置密码窗口。

## 4. Supabase 云函数与密钥

云函数目录已经写好，不要把服务器密钥填入任何 `VITE_` 变量。推荐用 Supabase CLI 部署（无需本地 Docker，除非你还要本地运行完整 Supabase）。在项目目录：

```powershell
npx supabase login
npx supabase link --project-ref bjlwjntsrfsjpoievfps
npx supabase functions deploy apply --no-verify-jwt
npx supabase functions deploy map-service --no-verify-jwt
npx supabase functions deploy amap-proxy --no-verify-jwt
npx supabase functions deploy parse-orders --no-verify-jwt
npx supabase functions deploy admin-users --no-verify-jwt
```

选择 `--no-verify-jwt` 是为兼容 publishable key 的匿名访问，不代表免后台鉴权：`parse-orders` 与 `admin-users` 在函数内调用 Auth 验证用户 JWT，再查启用状态与角色。申请与访客地图无需登录，但有参数校验、用途限制和限流。

进入 **Edge Functions → Secrets** 添加：

| 名称 | 值 / 用途 |
| --- | --- |
| `AMAP_WEB_SERVICE_KEY` | 高德「Web服务」类型 Key，仅后台定位和通勤查询 |
| `AMAP_SECURITY_JS_CODE` | 高德 JS Key 配套安全密钥，仅后台 SDK 代理 |
| `DEEPSEEK_API_KEY` | DeepSeek 官方 API Key，仅后台解析 |
| `DEEPSEEK_MODEL` | 可选，默认 `deepseek-flash` |
| `SITE_URL` | `https://sherlockedjim.github.io/find-your-student/` |
| `ALLOWED_ORIGINS` | `https://sherlockedjim.github.io,http://127.0.0.1:5173,http://localhost:5173` |

`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 使用 Supabase 云函数运行时自动提供的配置，不复制到前端。未设置 AI Key 时仍可关闭 AI 使用规则解析。

高德控制台为 JS Key 配置允许域名 `sherlockedjim.github.io`（本地联调也加入 `127.0.0.1` / `localhost`）。如 Web 服务 Key 使用 IP 白名单，Supabase Edge 默认出站 IP 未必固定，需在高德确认适合的安全配置；不能写浏览器的 IP。JS SDK 代理只转发限定端点，若高德 SDK 变更端点需根据实际报错更新允许列表。

## 5. 上传 GitHub 与 Pages 配置

仓库：https://github.com/Sherlockedjim/find-your-student

不要通过「Upload files」一股脑上传整个文件夹，尤其不要上传 `student1.txt`、`.env.local`、`node_modules`、`.npm-cache` 或 Excel。推荐 GitHub Desktop 添加本地仓库后推送，Git 会遵循 `.gitignore`。

如果本地尚无 Git 仓库，也可以在本目录使用：

```powershell
git init -b main
git remote add origin https://github.com/Sherlockedjim/find-your-student.git
git add .
git status --short
# 先检查待提交列表没有学生原文、私人环境文件和表格，再执行：
git commit -m "Build first tutoring map release"
git push -u origin main
```

仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

仓库 **Settings → Secrets and variables → Actions → Variables → New repository variable** 添加：

| 名称 | 值 |
| --- | --- |
| `VITE_DATA_MODE` | 先 `demo`，正式完成验收后改成 `live` |
| `VITE_SUPABASE_URL` | 你的项目 URL，不要带 `https\:` 的转义字符 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 你的 `sb_publishable_...` |
| `VITE_AMAP_JS_KEY` | 高德「Web端(JS API)」Key（不是 Web 服务 Key） |
| `VITE_AMAP_PROXY_URL` | `https://bjlwjntsrfsjpoievfps.supabase.co/functions/v1/amap-proxy/_AMapService` |

这些是公开配置，不放任何 secret/service_role、Web服务 Key、安全密钥或 DeepSeek Key。改完变量，去 **Actions → Build and deploy GitHub Pages → Run workflow** 重新构建；不重建则旧前端仍使用旧配置。

## 6. 切换真实模式与 student1.txt 首次导入

1. 本地 `.env.local` 将 `VITE_DATA_MODE=live`，填好 JS Key，重启 `npm run dev`。
2. 主管理员邮箱登录 → 管理后台 → TXT 导入 → 先不勾 AI，上传 `student1.txt`。
3. 核对11条编号 `8944` 至 `8934`，应有7条明确时薪、4条面议。
4. 查看公开小区位置是否正确、时薪换算是否合理、要求与学生情况是否已隐藏隐私。无法识别的姓名可能没有明确标签，必须人工核对公开预览；规则脱敏不能替代人工隐私审核。
5. 自动定位取小区 / 街道近似位置。修改地址后清除旧坐标并尝试自动重新定位，失败时使用「重新定位」或地图选点再保存。无地址单不允许上架。只到区中心的单子标注位置待确认。
6. 确认入库。重复编号进入异常，其他继续入库，不会覆盖历史和归档编号。
7. 下载 Excel，检查完整地址、原始文本和来源在管理员总表中完整保留。
8. 正式网站 `VITE_DATA_MODE=live`，重新运行 Pages 部署。

## 7. 上线验收清单

- 未登录打开：仅已上架显示地图；已接单只能通过主动搜索找到，无法申请。
- 手机能收起左栏查看地图；地图可以拖动、缩放、点击价格标记回到对应卡片。
- 访客 Network 响应不含 `raw_text / full_address / source_file / anomalies`；直接调用 `order_private` 无权读取。
- 普通收藏账号无法调用导入 RPC，无法读取申请或提升管理员角色。
- 主账号停用副管理员后，该账号即使仍有旧登录会话也无法再读取私有数据或导入。
- 邮箱注册、收藏、免注册申请、后台查看申请、微信二维码均用真实账号验证。
- 定位失败可输入广州地点或在地图选点；通勤只查询白天10点，优先公交地铁最短时间，不用直线距离冒充。
- 89分钟显示约1h，但1h筛选不能包含该单；面议保留标记、不显示数字价格。
- 归档后访客不可见，再次导入原编号进入异常；总表仍保留旧资料。

当前限流按来源 IP 的哈希统计：同学校同出口用户可能共享配额。首版是小规模工具；扩大公开推广前建议加 CAPTCHA、共享缓存、配额预算告警与更精细的限流。位置不上传持久化；通勤只使用选定出发点与公开近似目的地。AI 仅主动勾选时调用，单批最多50条 / 25000字符，超限回退规则解析。

参考官方文档：[Supabase 云函数鉴权](https://supabase.com/docs/guides/functions/auth)、[高德路线规划2.0](https://lbs.amap.com/api/webservice/guide/api/newroute)、[高德安全密钥代理](https://lbs.amap.com/api/javascript-api/guide/abc/prepare)、[DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)、[GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
