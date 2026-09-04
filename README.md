# 鲜直达 · 助农优鲜 MVP

> 时效农产品分销小程序 + PC 管理后台，三层全栈（Node.js + SQLite + Vue 3）

## 快速开始

```bash
cd server
npm install
node src/app.js
```

启动成功后访问：

| 端 | 地址 |
|---|---|
| PC 后台 | http://localhost:4000/admin/ |
| 移动端 H5 | http://localhost:4000/mp/ |
| API 健康检查 | http://localhost:4000/api/health |

## 默认账号

| 端 | 账号 | 密码 |
|---|---|---|
| PC 管理后台 | `admin` | `admin123` |
| 移动端合伙人（李姐） | `136****9012` | `123456` |
| 移动端合伙人（王芳） | `139****5678` | `123456` |
| 移动端合伙人（老王） | `137****3456` | `123456` |
| 移动端普通用户（小张） | `138****1234` | `123456` |

## 技术栈

- **后端**：Node.js + Express + better-sqlite3 + JWT
- **前端 PC**：Vue 3（CDN 全局构建）+ Element Plus 2.7 + ECharts 5
- **前端移动**：Vue 3（CDN 全局构建）+ Vant 4
- **数据库**：SQLite（零配置，单文件，启动时自动种子）

## 目录结构

```
xzd-mvp/
├── public-admin/        服务实际读取的 PC 后台静态文件
│   ├── index.html
│   ├── js/{app.js, api.js}
│   ├── vendor/          本地化的 Vue / Element Plus / ECharts
│   └── css/admin.css
├── public-mp/           服务实际读取的移动端静态文件
│   ├── index.html
│   ├── js/{app.js, api.js}
│   ├── vendor/          本地化的 Vue / Vant
│   └── css/mp.css
├── server/
│   ├── src/
│   │   ├── app.js       统一服务入口（API + 静态）
│   │   ├── db.js        SQLite 初始化 + 种子数据
│   │   ├── auth.js      JWT 签发与校验
│   │   └── routes/      auth / products / orders / admin
│   ├── package.json
│   └── data.db          启动后自动生成
└── README.md
```

## 已实现功能

- [x] 用户注册/登录（手机号 + 密码，JWT）
- [x] 商品浏览（首页 + 分类 + 详情 + 库存）
- [x] 下单 / 付款 / 发货 / 签收 / 取消（事务化，库存联动）
- [x] 合伙人分销（一级推广，佣金自动结算）
- [x] PC 管理后台：看板 / 订单 / 用户 / 商品 / 合伙人 / 佣金
- [x] 商品管理：新增 / 编辑 / 上架 / 下架 / 库存调整
- [x] 合伙人管理：新增 / 编辑 / 升降级
- [x] 用户管理：详情抽屉 / 订单统计 / CSV 导出
- [x] 佣金管理：手动结算 / 状态跟踪

## 详细文档

访问链接与账号手册：[ACCESS.md](./ACCESS.md)
