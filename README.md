# 拾光备忘

苹果备忘录风格的云端笔记应用，支持邮箱账户、跨设备同步、图片、录音和视频附件。

## 技术栈

- React + TypeScript + Vite
- Cloudflare Workers、D1、R2
- GitHub Actions + GitHub Pages

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

另开一个终端启动后端：

```bash
npm run worker:dev
```

本地 `.env` 默认指向 `http://127.0.0.1:8787`。线上部署后，将
`VITE_API_BASE_URL` 设置为 Cloudflare Worker 地址。

## Cloudflare 部署

需要先登录 Wrangler：

```bash
npx wrangler login
```

然后创建 D1、R2，更新 `wrangler.toml` 中的 `database_id`，执行：

```bash
npm run db:apply
npx wrangler secret put JWT_SECRET
npm run worker:deploy
```
