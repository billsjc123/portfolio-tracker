# portfolio-tracker

持仓跟踪自动化项目。每天北京时间 **09:00** 和 **17:00**（工作日）自动抓取行情、更新历史快照、部署 GitHub Pages 看板。

## 📁 目录结构

```
portfolio-tracker/
├── .github/workflows/update.yml   # 定时任务
├── scripts/
│   ├── fetch-quote.js             # 纯 HTTP 抓 qt.gtimg.cn
│   ├── update-portfolio.js        # 主流程
│   └── render-dashboard.js        # 渲染 dashboard.html
├── data/
│   ├── portfolio-config.json      # 持仓配置
│   └── portfolio-trades.json      # 交易记录
├── output/
│   ├── portfolio-history-main.json
│   ├── portfolio-history-aw.json
│   └── portfolio-dashboard.html   # 推送到 Pages
└── README.md
```

## 🚀 首次部署

### 1. 创建 GitHub 私有仓
- GitHub 网页 → New repository → 名称 `portfolio-tracker` → **Private**

### 2. 推送代码
```bash
cd ~/Projects/portfolio-tracker
git init
git add .
git commit -m "init: portfolio tracker"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/portfolio-tracker.git
git push -u origin main
```

### 3. 启用 GitHub Pages
- 仓 → Settings → Pages → Source: **GitHub Actions**

### 4. 首次手动验证
- Actions → "Update Portfolio" → Run workflow
- 等 ~30 秒，看是否成功
- 访问 `https://YOUR_USERNAME.github.io/portfolio-tracker/`

## 🔄 日常更新持仓 / 交易

修改本地 `data/portfolio-config.json` 或 `data/portfolio-trades.json` 后推送到 main：
```bash
git add data/
git commit -m "update: 调整持仓"
git push
```

下次定时任务会自动用最新配置生成快照。

## 🛠️ 本地调试

```bash
cd ~/Projects/portfolio-tracker
npm install iconv-lite
node scripts/update-portfolio.js
open output/portfolio-dashboard.html
```

## 📊 数据源

| 数据 | 接口 |
|---|---|
| A 股 / 港股 / 美股行情 | `https://qt.gtimg.cn/q=` |
| 基金净值 | `http://fundgz.1234567.com.cn/js/` |
| 汇率 | `https://open.er-api.com/v6/latest/USD` |

无鉴权、免费、稳定。
