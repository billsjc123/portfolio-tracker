# portfolio-tracker

个人持仓看板，**完全跑在 GitHub 上**，关掉电脑也照常更新。公开访问。

**看板地址**：[https://billsjc123.github.io/portfolio-tracker/](https://billsjc123.github.io/portfolio-tracker/)

---

## 🎯 日常使用：你只需要告诉 WorkBuddy 一句话

**不要直接改任何 JSON 文件**。所有持仓变更都通过 WorkBuddy 对话完成。

| 你说 | WorkBuddy 自动做 |
|---|---|
| "今天买了 sh513650 1000 份 @ 1.234" | 算加权成本、写 config、追加 trade、扣现金、push 到 GitHub |
| "我卖了 100 股 hk00700 @ 400" | 同上，自动算剩余持仓的加权成本 |
| "全天候账户月度定投：能源、有色、豆粕多买一点" | 解析意图 → 写入多笔 buy → 刷新看板 |
| "再刷新一次" | 立即触发一次自动跑（手机也能） |

**响应时间**：从你说完到 Pages 看板刷新大约 **30-60 秒**。

---

## 🔄 自动更新流程（完全云端，Mac 不需要启动）

工作日 **09:00** 和 **17:00**（北京时间）：

```
[GitHub Actions cron 触发] (UTC 01:00 / 09:00)
        ↓
update-data.yml
        ↓
  ① checkout main 分支
        ↓
  ② 装 Node 20 依赖（iconv-lite）
        ↓
  ③ 抓行情：qt.gtimg.cn / fundgz.1234567 / open.er-api
        ↓
  ④ 算市值、写 portfolio-config.json
        ↓
  ⑤ 追加 portfolio-history-main.json（趋势图数据）
        ↓
  ⑥ 渲染 docs/index.html + portfolio-dashboard.html
        ↓
  ⑦ git commit + git push origin main
        ↓
[GitHub Pages 内置进程] 检测到 main /docs 变化
        ↓
  ⑧ 自动部署（约 30 秒）
        ↓
  https://billsjc123.github.io/portfolio-tracker/  刷新
```

**触发矩阵**：

| 场景 | 触发方式 | 频率 |
|------|---------|------|
| 平时自动更新 | cron | 工作日 北京时间 9:00 / 17:00 |
| 你改了 `data/portfolio-*.json` | push 触发 | 立即跑一次 |
| 你改了 `scripts/*.js` | push 触发 | 立即跑一次 |
| 临时想拉一次 | Actions → Run workflow | 手动 |

---

## ✋ 立即触发一次更新（不等 9:00/17:00）

### 方法 1：手机/网页点（推荐）

1. 打开 [https://github.com/billsjc123/portfolio-tracker/actions/workflows/update-data.yml](https://github.com/billsjc123/portfolio-tracker/actions/workflows/update-data.yml)
2. 右侧 **Run workflow** → 选 main → **Run workflow**
3. 等 1-2 分钟，看 Actions 日志确认成功

### 方法 2：告诉 WorkBuddy

直接说 "再刷新一次" 或 "立即更新一下看板"，WorkBuddy 触发同样的流程。

---

## 📁 目录结构

```
portfolio-tracker/
├── .github/workflows/
│   └── update-data.yml               # ⭐ 自动抓行情（cron + push + 手动）
├── scripts/
│   ├── fetch-quote.js                # 公开 API 抓行情（GBK 解码）
│   ├── update-portfolio.js           # 主流程：抓行情 → 算市值 → 写 history → 渲染
│   └── render-dashboard.js           # 模板字符串替换（保留完整交互）
├── data/                             # ⭐ 数据源（git 跟踪）
│   ├── portfolio-config.json         #   持仓快照
│   ├── portfolio-trades.json         #   交易记录
│   └── dashboard.template.html       #   看板 HTML 模板
├── docs/                           # 自动生成（git 跟踪）
│   ├── portfolio-history-main.json   #   主账户历史快照（趋势图）
│   ├── portfolio-history-aw.json     #   全天候账户历史快照
│   ├── portfolio-dashboard.html      #   完整看板
│   ├── index.html                    #   Pages 入口
│   └── last-run.json                 #   最近一次运行状态
└── README.md
```

---

## 🗂️ 字段速查

### `data/portfolio-config.json`

```json
{
  "name": "Bill 持仓组合",
  "holdings": {
    "cn": [{ "code": "sh600036", "name": "招商银行", "qty": 900, "cost": 38.151 }],
    "hk": [{ "code": "hk00700", "name": "腾讯控股", "qty": 180, "cost": 474.8 }],
    "us": [{ "code": "usGOOG",  "name": "谷歌-C",   "qty": 17,  "cost": 138.545 }]
  },
  "allweather": {
    "holdings": [{ "code": "sz159632", "name": "纳斯达克ETF华安", "qty": 4800, "cost": 2.3505 }],
    "funds":    [{ "code": "009803",   "name": "易方达中债7-10国开债C", "shares": 12895.0, "cost": 1.3184 }],
    "cash":     { "rmb": 13744.57 }
  }
}
```

| 字段 | 说明 |
|---|---|
| `code` | 标的代码（A 股 `sh`/`sz`；港股 `hk`；美股 `us`） |
| `qty` | 持仓数量 |
| `cost` | 加权平均成本（WorkBuddy 自动算） |
| `shares` | 基金份额（基金专有） |
| `cash.rmb` | 全天候账户的人民币现金（WorkBuddy 自动扣减） |

### `data/portfolio-trades.json`

```json
{
  "id": 18,
  "date": "2026-07-15",
  "code": "sh513650",
  "name": "标普500ETF南方",
  "action": "buy",
  "price": 1.90,
  "currency": "CNY",
  "qty": 1000,
  "settleCcy": "CNY",
  "settleAmount": 1900.00,
  "reason": "月度定投"
}
```

---

## 📊 数据源（全部免费公开 API，无鉴权）

| 数据 | 接口 |
|---|---|
| A 股 / 港股 / 美股行情 | `https://qt.gtimg.cn/q=` |
| 基金净值 | `http://fundgz.1234567.com.cn/js/` |
| 汇率 | `https://open.er-api.com/v6/latest/USD` |

---

## 🔧 故障排查

| 症状 | 原因 | 解决 |
|---|---|---|
| 看板停在某天 | cron 没跑 / push 失败 | 看 [Actions 页面](https://github.com/billsjc123/portfolio-tracker/actions)，找最近一次 update-data run |
| 行情没更新 | 公开 API 临时抽风 | 等 30 分钟再跑一次；或浏览器开 `qt.gtimg.cn/q=sh600036` 看是否可达 |
| GitHub Pages 404 | Pages 配置不对 / main /docs 不存在 | Settings → Pages → Source: main → Folder: /docs |
| 加权成本算错 | 多笔买入被合并成一次 | 一次性发完所有要买的，别分多轮 |
| GitHub 配额 | 每天 2 次 × 2 分钟 = 120 分钟/月 | 远低于免费 2000 分钟/月，无需担心 |

---

## 🚀 首次部署（重装用）

如果将来要换机器，**零本机配置**：

1. 创建 GitHub 仓 `portfolio-tracker`
2. 克隆本仓的 `scripts/`、`data/`、`.github/workflows/` 到新仓
3. GitHub → Actions → 手动 Run 一次 `update-data.yml` 验证
4. GitHub → Settings → Pages → Source: **Deploy from a branch** → Branch: `main` → Folder: `/docs`
5. 完成。从此无需本机

---

## 📝 设计原则

- **git = 数据库**：`portfolio-history-*.json` 增量 commit = 一次价格时间点
- **JSON = 表**：所有数据都是纯文本，diff 友好
- **WorkBuddy = 入口**：你只动嘴，剩下全自动化
- **零外部依赖**：所有行情 API 都不要鉴权
- **零本机依赖**：所有计算跑在 GitHub Actions，关电脑也能更新
