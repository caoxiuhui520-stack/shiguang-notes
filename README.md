# 拾光备忘

苹果备忘录风格的云端笔记应用，支持邮箱账户、跨设备同步、图片、录音和视频附件。

## 技术栈

- React + TypeScript + Vite
- Supabase Auth、Postgres、Realtime、Storage
- GitHub Actions + GitHub Pages

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

在 `.env` 中填写 Supabase 项目 URL 与 publishable key。不要在前端使用
`service_role` 或 secret key。

## 数据库

数据库和存储策略位于 `supabase/migrations/`。所有备忘录表均启用 RLS，
附件存储桶为私有桶，用户只能访问自己 UUID 目录下的文件。
