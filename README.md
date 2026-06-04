# Daily Briefing · 全网热点信源分析

每日自动聚合 14 个平台的热点新闻，按信源可信度分组展示，支持邮件订阅每日推送。

## 数据来源

**TrendRadar MCP** (11 个中文平台):
微博、知乎、百度、B站、抖音、今日头条、澎湃新闻、财联社、华尔街见闻、凤凰网、贴吧

**补充数据源:**
- **Hacker News** (Firebase API) — 全球科技/创业热点
- **V2EX** (JSON API) — 中文技术社区热帖

## 功能

- 📋 **Tier 分组展示** — 高可信度 (T1-T2) 优先，待验证 (T4-T5) 附带警告
- 🔍 **信源追溯** — 点击热点展开完整传播链：首发 → 转载 → 扩散
- 📅 **昨日对比** — 持续热点 / 今日新增 / 昨日退出
- 📧 **邮件订阅** — 每日 08:00 自动推送

## 本地运行

需要 Docker 运行 TrendRadar MCP:

```bash
# 启动 TrendRadar MCP
docker run -d --name trendradar-mcp -p 3333:3333 wantcat/trendradar-mcp

# 等待启动
sleep 10

# 安装依赖并运行聚合
npm install
node scripts/aggregate.mjs

# 打开页面
npx serve .
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `RESEND_API_KEY` | Resend API Key（用于发送邮件） |
| `RESEND_AUDIENCE_ID` | Resend 联系人列表 ID |
| `EMAIL_RECIPIENTS` | 接收推送的邮箱地址（逗号分隔） |

## 部署到 GitHub Pages

1. Fork 本仓库
2. 在 Settings → Secrets and variables → Actions 设置上述环境变量
3. 在 Settings → Pages → Source 选择 **GitHub Actions**
4. 每日 08:00 (北京时间) 自动运行

## 技术栈

- 静态 HTML/CSS/JS（零框架）
- Node.js 22（数据聚合脚本）
- TrendRadar MCP（数据源）
- Resend（邮件推送）
- GitHub Actions（定时 + 部署）
- GitHub Pages（托管）
