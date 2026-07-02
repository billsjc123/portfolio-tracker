#!/bin/bash
# ~/Projects/portfolio-tracker/run-and-sync.sh
# 完全自动化：跑 update → 推送到 GitHub → GitHub Pages 自动部署
# 失败也无所谓，下次还会跑

set -e

PROJECT_DIR="/Users/bill/Projects/portfolio-tracker"
LOG_FILE="$PROJECT_DIR/output/automation.log"
NODE_BIN="/Users/bill/.workbuddy/binaries/node/versions/22.22.2/bin/node"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$PROJECT_DIR/output"

echo "[$TIMESTAMP] === 开始更新 portfolio ===" >> "$LOG_FILE"

cd "$PROJECT_DIR"

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
git add output/portfolio-history-main.json output/portfolio-history-aw.json output/portfolio-dashboard.html 2>> "$LOG_FILE"

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
    echo "[$TIMESTAMP] ❌ push 失败（可能 SSH 临时不通或 iCloud 锁）" >> "$LOG_FILE"
    exit 1
fi

# 4. 清理过老的 log（保留 7 天）
find "$PROJECT_DIR/output" -name "automation.log" -mtime +7 -delete 2>/dev/null

echo "[$TIMESTAMP] === 完成 ===" >> "$LOG_FILE"
