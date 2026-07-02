# portfolio-tracker

持仓跟踪自动化项目。每天北京时间 **09:00** 和 **17:00**（工作日）自动抓取行情、更新历史快照、部署 GitHub Pages 看板。

> **数据源唯一**：所有持仓和交易记录都在 GitHub 仓库的 `data/` 目录下管理。改完 push 即可，下次自动跑时生效。

## 📁 目录结构

```
portfolio-tracker/
├── .github/workflows/
│   └── deploy.yml                   # push 时自动部署到 GitHub Pages
├── scripts/
│   ├── fetch-quote.js               # 纯 HTTP 抓 qt.gtimg.cn（GBK 解码）
│   ├── update-portfolio.js          # 主流程：抓行情 → 算市值 → 写 history → 渲染
│   └── render-dashboard.js          # 模板打补丁，输出 dashboard.html + index.html
├── data/
│   ├── portfolio-config.json        # ⭐ 持仓配置（主账户 + 全天候 + 现金 + 基金）
│   ├── portfolio-trades.json        # ⭐ 交易记录（每次买入/卖出）
│   └── dashboard.template.html      # 看板 HTML 模板（不常改）
├── output/                          # 自动生成，看板 HTML + 历史快照
│   ├── portfolio-history-main.json
│   ├── portfolio-history-aw.json
│   ├── portfolio-dashboard.html
│   ├── index.html                   # Pages 根路径入口
│   ├── last-run.json
│   └── automation.log
├── run-and-sync.sh                  # launchd 调度的入口脚本
└── README.md
```

## ✏️ 如何更新持仓

### 方式 1：GitHub 网页直接编辑（推荐，最方便）

1. 打开 https://github.com/billsjc123/portfolio-tracker/edit/main/data/portfolio-config.json
2. 点击 ✏️ 编辑按钮
3. 修改持仓（加减 `qty` / `cost`，或加新标的）
4. 点 **Commit changes**
5. 等下一次自动跑（工作日 9:00 或 17:00），或者立刻跑一次：
   ```bash
   launchctl start com.bill.portfolio-tracker
   ```

### 方式 2：本地编辑

```bash
cd ~/Projects/portfolio-tracker
# 编辑 config / trades
vim data/portfolio-config.json
# 提交
git add data/
git commit -m "update: 调整持仓"
git push
```

下次自动跑会拉取你刚 push 的配置。

## 🔄 自动更新流程（launchd 调度）

```
工作日 09:00 / 17:00
    ↓
launchd 触发 run-and-sync.sh
    ↓
① git pull 拉取最新 config / trades / template
    ↓
② 抓行情：qt.gtimg.cn + 基金净值 + 汇率
    ↓
③ 计算市值、写入历史快照
    ↓
④ 渲染 dashboard.html + index.html
    ↓
⑤ git commit + git push → GitHub Actions deploy.yml
    ↓
⑥ GitHub Pages 自动部署（30 秒内生效）
```

看板地址：**https://billsjc123.github.io/portfolio-tracker/**

## 🛠️ 手动触发

```bash
# 立即跑一次（不等定时）
launchctl start com.bill.portfolio-tracker

# 或直接跑
bash /Users/bill/Projects/portfolio-tracker/run-and-sync.sh

# 查看执行日志
tail -30 /Users/bill/Projects/portfolio-tracker/output/automation.log
```

## 🔍 字段速查

### `data/portfolio-config.json`

```json
{
  "name": "Bill 持仓组合",
  "holdings": {
    "cn": [ { "code": "sh600036", "name": "招商银行", "qty": 900, "cost": 38.151 } ],
    "hk": [ { "code": "hk00700",   "name": "腾讯控股", "qty": 180, "cost": 474.8  } ],
    "us": [ { "code": "usGOOG",    "name": "谷歌-C",  "qty": 17,  "cost": 138.545 } ]
  },
  "allweather": {
    "holdings": [ { "code": "sz159632", "name": "纳斯达克ETF华安", "qty": 4800, "cost": 2.3505 } ],
    "funds":    [ { "code": "009803",   "name": "易方达中债7-10国开债C", "shares": 12895.0, "cost": 1.3184 } ],
    "cash":     { "rmb": 13744.57 }
  }
}
```

| 字段 | 说明 |
|---|---|
| `code` | 标的代码（A 股 `sh`/`sz` 前缀；港股 `hk`；美股 `us`） |
| `qty` | 持仓数量（A 股 / ETF = 股；港股 = 股；美股 = 股） |
| `cost` | 加权平均成本（买入后用 (旧成本 × 旧数量 + 新买入) / 新数量 算） |
| `shares` | 基金份额 |
| `cash.rmb` | 全天候账户的人民币现金 |

### `data/portfolio-trades.json`

每次买入/卖出加一条。`id` 递增。`reason` 写买入原因（"月度定投"、"超跌加仓"等）。

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

## 📊 数据源

| 数据 | 接口 | 鉴权 |
|---|---|---|
| A 股 / 港股 / 美股行情 | `https://qt.gtimg.cn/q=` | 无 |
| 基金净值 | `http://fundgz.1234567.com.cn/js/` | 无 |
| 汇率 | `https://open.er-api.com/v6/latest/USD` | 无 |

全部免费公开 API，不依赖任何鉴权。

## 🚀 首次部署（已配置好，无需再做）

如果将来要重装：

1. GitHub 创建私有仓 `portfolio-tracker`
2. 本地克隆此目录
3. 添加本机 SSH 公钥到 GitHub
4. 跑 `bash run-and-sync.sh` 验证
5. GitHub → Settings → Pages → Source: **GitHub Actions**
6. 复制本目录的 `.github/workflows/deploy.yml` 到仓内
7. launchd 任务：`~/Library/LaunchAgents/com.bill.portfolio-tracker.plist`
