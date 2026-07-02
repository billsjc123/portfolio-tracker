# portfolio-tracker

个人持仓看板，每天 9:00 / 17:00 自动刷新，公开访问。

**看板地址**：[https://billsjc123.github.io/portfolio-tracker/](https://billsjc123.github.io/portfolio-tracker/)

---

## 🎯 日常使用：你只需要告诉 WorkBuddy 一句话

**不要直接改任何 JSON 文件**。所有持仓变更都通过 WorkBuddy 对话完成。

| 你说 | WorkBuddy 自动做 |
|---|---|
| "今天买了 sh513650 1000 份 @ 1.234" | 算加权成本、写 config、追加 trade、扣现金、push 到 GitHub |
| "我卖了 100 股 hk00700 @ 400" | 同上，自动算剩余持仓的加权成本 |
| "全天候账户月度定投：能源、有色、豆粕多买一点" | 解析意图 → 写入多笔 buy → 刷新看板 |
| "再刷新一次" | 立即触发一次自动跑 |

**响应时间**：从你说完到 Pages 看板刷新大约 **30-60 秒**。

---

## 🔄 自动更新流程

工作日 **09:00** 和 **17:00**（北京时间）：

```
[Mac 本机 launchd 调度]
        ↓
run-and-sync.sh
        ↓
  ① git pull 拉取最新配置
        ↓
  ② 抓行情：qt.gtimg.cn / fundgz.1234567 / open.er-api
        ↓
  ③ 算市值、写 portfolio-config.json
        ↓
  ④ 追加 portfolio-history-main.json（趋势图数据）
        ↓
  ⑤ 渲染 output/index.html + portfolio-dashboard.html
        ↓
  ⑥ git commit + git push
        ↓
[GitHub] deploy.yml 看到 push
        ↓
  ⑦ GitHub Pages 部署（约 30 秒）
        ↓
  https://billsjc123.github.io/portfolio-tracker/  刷新
```

---

## 📁 目录结构

```
portfolio-tracker/
├── .github/workflows/
│   └── deploy.yml                   # push 时自动部署 GitHub Pages
├── scripts/
│   ├── fetch-quote.js               # 公开 API 抓行情（GBK 解码）
│   ├── update-portfolio.js          # 主流程：抓行情 → 算市值 → 写 history → 渲染
│   └── render-dashboard.js          # 模板字符串替换（保留完整交互）
├── data/                            # ⭐ 数据源（git 跟踪）
│   ├── portfolio-config.json        #   持仓快照
│   ├── portfolio-trades.json        #   交易记录
│   └── dashboard.template.html      #   看板 HTML 模板
├── output/                          # 自动生成（git 跟踪）
│   ├── portfolio-history-main.json  #   主账户历史快照（趋势图）
│   ├── portfolio-history-aw.json    #   全天候账户历史快照
│   ├── portfolio-dashboard.html     #   完整看板
│   ├── index.html                   #   Pages 入口
│   ├── last-run.json                #   最近一次运行状态
│   └── automation.log               #   运行日志（7 天滚动）
├── run-and-sync.sh                  # launchd 入口
└── README.md
```

---

## ✋ 高级操作

### 立即触发一次更新（不等 9:00/17:00）

```bash
launchctl start com.bill.portfolio-tracker
```

或直接跑：

```bash
bash /Users/bill/Projects/portfolio-tracker/run-and-sync.sh
```

### 查看运行日志

```bash
tail -30 ~/Projects/portfolio-tracker/output/automation.log
```

### 查看 Git 历史（=价格时间线）

```bash
cd ~/Projects/portfolio-tracker
git log --oneline | head -30
```

每次自动跑都是一个 commit。`portfolio-history-main.json` 是趋势图数据。

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
| 看板停在某天 | launchd 没跑 / push 失败 | `launchctl start com.bill.portfolio-tracker` 看 `output/automation.log` |
| 行情没更新 | 公开 API 临时抽风 | 等 30 分钟再跑，或 `qt.gtimg.cn` 用浏览器开看是否可达 |
| GitHub Pages 404 | 路径错 / workflow 没跑 | 看 `https://github.com/billsjc123/portfolio-tracker/actions` |
| 价格不准 | qt.gtimg.cn 截断到 2 位小数 | 脚本会用 `minute` 命令逐只补精度（3 位小数） |
| 加权成本算错 | 多笔买入被合并成一次 | 一次性发完所有要买的，别分多轮 |

---

## 🚀 首次部署（重装用）

如果将来要换机器：

1. 创建 GitHub 仓 `portfolio-tracker`（private）
2. 本机克隆：`git clone git@github.com:billsjc123/portfolio-tracker.git ~/Projects/portfolio-tracker`
3. 把本仓的 `scripts/`、`data/`、`.github/workflows/deploy.yml` 复制过去
4. 配 SSH 公钥：`cat ~/.ssh/id_rsa.pub` → GitHub → Settings → SSH and GPG keys
5. 测一次：`bash ~/Projects/portfolio-tracker/run-and-sync.sh`
6. 配 launchd：

```bash
cat > ~/Library/LaunchAgents/com.bill.portfolio-tracker.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.bill.portfolio-tracker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/bill/Projects/portfolio-tracker/run-and-sync.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>17</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>/tmp/portfolio-tracker.log</string>
  <key>StandardErrorPath</key><string>/tmp/portfolio-tracker.err</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.bill.portfolio-tracker.plist
```

7. GitHub → Settings → Pages → Source: **GitHub Actions**

---

## 📝 设计原则

- **git = 数据库**：`portfolio-history-*.json` 增量 commit = 一次价格时间点
- **JSON = 表**：所有数据都是纯文本，diff 友好
- **WorkBuddy = 入口**：你只动嘴，剩下全自动化
- **零外部依赖**：所有行情 API 都不要鉴权
