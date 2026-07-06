#!/bin/bash
# ~/Projects/portfolio-tracker/run-and-sync.sh
# 完全自动化：git pull 拉最新持仓 → 跑 update → 推送到 GitHub → GitHub Pages 自动部署
# 数据源：直接在 GitHub 仓库 data/ 目录编辑（网页或本地都行）
# 失败也无所谓，下次还会跑

set -e

PROJECT_DIR="/Users/bill/Projects/portfolio-tracker"
LOG_FILE="$PROJECT_DIR/docs/automation.log"
NODE_BIN="/Users/bill/.workbuddy/binaries/node/versions/22.22.2/bin/node"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$PROJECT_DIR/docs"
echo "[$TIMESTAMP] === 开始更新 portfolio ===" >> "$LOG_FILE"
cd "$PROJECT_DIR"

# 0. 拉取最新 config / trades / template（用户在 GitHub 网页或别处改的）
echo "[$TIMESTAMP] git pull 拉取最新配置..." >> "$LOG_FILE"
if git pull --rebase --autostash >> "$LOG_FILE" 2>&1; then
    echo "[$TIMESTAMP]   ✅ pull 成功" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP]   ⚠️ pull 失败（可能没远程变更或网络问题），继续使用本地" >> "$LOG_FILE"
fi

# 1. 跑更新脚本
echo "[$TIMESTAMP] 跑 update-portfolio.js..." >> "$LOG_FILE"
if $NODE_BIN scripts/update-portfolio.js >> "$LOG_FILE" 2>&1; then
    echo "[$TIMESTAMP] ✅ update 成功" >> "$LOG_FILE"
else
    EXIT_CODE=$?
    echo "[$TIMESTAMP] ❌ update 失败 (exit=$EXIT_CODE)，跳过 push" >> "$LOG_FILE"
    exit $EXIT_CODE
fi

# 2. 推送到 GitHub
echo "[$TIMESTAMP] 推送到 GitHub..." >> "$LOG_FILE"
git add docs/portfolio-history-main.json docs/portfolio-history-aw.json docs/portfolio-dashboard.html docs/index.html 2>> "$LOG_FILE"

# 检查是否有变化
if git diff --staged --quiet; then
    echo "[$TIMESTAMP] 无变化，跳过 commit" >> "$LOG_FILE"
    exit 0
fi

# 3. 提交并推送
git commit -m "chore: update portfolio $(date -u +'%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE" 2>&1
if git push origin main >> "$LOG_FILE" 2>&1; then
    echo "[$TIMESTAMP] ✅ push 成功，看板将自动更新" >> "$LOG_FILE"
else
    echo "[$TIMESTAMP] ❌ push 失败（可能 SSH 临时不通）" >> "$LOG_FILE"
    exit 1
fi

# 4. 清理过老的 log（保留 7 天）
find "$PROJECT_DIR/docs" -name "automation.log" -mtime +7 -delete 2>/dev/null

echo "[$TIMESTAMP] === 完成 ===" >> "$LOG_FILE"
