# 广州家教地图-edus

Vue 3 + TypeScript + Element Plus + 高德地图 + Supabase 的家教单筛选工具。前端发布到 GitHub Pages，数据库、鉴权和云函数运行在 Supabase。

## 本地启动

需要 Node.js 22.12+（建议 Node 24 LTS）。

```powershell
npm ci
npm run dev
```

打开 http://127.0.0.1:5173 。默认 `demo` 模式使用脱敏、人工构造的测试资料；地图为明确标识的示意图。演示后台和申请仅保留在本次会话，不代表真实后台连接成功。

## 已实现

- 类型 / 科目 / 区域 / 星期 / 时段 / 老师性别 / 时薪筛选；最新、价格、公交通勤排序。
- 仅已上架进入地图；已接单仅在访客主动搜索时进入左侧列表。
- 收藏需邮箱登录，申请免注册，统一微信二维码。
- TXT 规则解析、可选 DeepSeek、编辑预览、确认入库、自动近似定位、编号冲突隔离。
- 后台四种状态、软删除归档、私有原文、申请查看、主管理员邀请和停用账号。
- 管理员 Excel 总表（类型筛选、完整地址、原文、来源和异常）。
- 数据库 RLS、公共 / 私有字段隔离、后台权限校验与匿名申请限流。

## 验证

```powershell
npm test
npm run build
npx playwright test
```

本地存在 `student1.txt` 时会额外测试其编号及课酬；文件本身不进入 Git。浏览器测试使用 Windows 已安装的 Edge。数据库测试用本地 PostgreSQL WASM 执行实际迁移及 RLS，不修改远端 Supabase。

## 部署与安全

按 [DEPLOYMENT.md](DEPLOYMENT.md) 操作；账号获取见 [SETUP_GUIDE.md](SETUP_GUIDE.md)。

不要提交 `.env.local`、学生 TXT、Excel、数据库 secret/service_role、高德 Web 服务 Key、安全密钥或 DeepSeek Key。Supabase publishable key 与高德 JS Key 是受用途和域名限制的公开配置，不能替代管理员授权。

参考网站只提供公开页面，未获得其私有后端源码。本项目借鉴公开的地图 / 列表交互，自行实现后端及新增功能，不宣称获取或复制了原站后台。
