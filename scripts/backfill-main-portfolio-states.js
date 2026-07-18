#!/usr/bin/env node
/**
 * 为历史主账户快照冻结当日持仓状态，并按清仓日期重建累计已实现盈亏。
 *
 * 背景：早期 history 只保存价格，页面用今天的 portfolio-config 反算过去。
 * 任何清仓或调仓都会改写整条历史曲线。本迁移仅用于回填旧快照；后续更新由
 * update-portfolio.js 直接把 portfolioState 写入每条新快照。
 */
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_FILE = path.join(ROOT, 'docs', 'portfolio-history-main.json');
const TRADES_FILE = path.join(ROOT, 'data', 'portfolio-trades.json');

// Git 中可审计的历史配置版本。effectiveDate 采用交易实际生效日，而非补录 commit 时间。
const CONFIG_REVISIONS = {
    base: 'd8dd42a',
    netflix: '4f297c1',
    rklb: '3f27331',
    rebalance: '4672008',
    rebalanceCashReconciled: '1b5b519'
};

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function configAt(ref) {
    const json = childProcess.execFileSync('git', ['show', `${ref}:data/portfolio-config.json`], {
        cwd: ROOT,
        encoding: 'utf8'
    });
    return JSON.parse(json);
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function removeHolding(state, code) {
    for (const market of ['cn', 'hk', 'us']) {
        state.holdings[market] = (state.holdings[market] || []).filter(h => h.code !== code);
    }
}

function stateAt(date, configs) {
    let source = 'd8dd42a (初始持仓基线)';
    let cfg = configs.base;

    if (date >= '2026-07-02') {
        source = '4f297c1 (奈飞建仓后)';
        cfg = configs.netflix;
    }
    if (date >= '2026-07-09') {
        source = '3f27331 (RKLB 建仓后)';
        cfg = configs.rklb;
    }
    if (date >= '2026-07-17') {
        source = '4672008/1b5b519 (7月17日调仓后)';
        cfg = configs.rebalance;
    }

    const state = {
        holdings: clone(cfg.holdings),
        cash: clone(cfg.cash),
        source
    };

    // 补录 commit 晚于实际交易：按成交日修正状态，避免补录本身篡改旧曲线。
    if (date >= '2026-06-26') removeHolding(state, 'sh513110');
    if (date >= '2026-07-01') removeHolding(state, 'usASML');

    if (date >= '2026-07-17') {
        // 1b5b519 只补记 sh513110 卖出回款，保留 4672008 的持仓结构，采用其核对后的现金。
        state.cash = clone(configs.rebalanceCashReconciled.cash);
    }

    return state;
}

function realizedPnLAsOf(closedPositions, date) {
    return closedPositions
        .filter(cp => cp.date && cp.date <= date)
        .reduce((sum, cp) => sum + (Number(cp.realizedPnL_CNY) || 0), 0);
}

function main() {
    const history = readJson(HISTORY_FILE);
    const trades = readJson(TRADES_FILE);
    const configs = Object.fromEntries(Object.entries(CONFIG_REVISIONS).map(([name, ref]) => [name, configAt(ref)]));
    const closedPositions = trades.closedPositions || [];

    for (const snapshot of history.snapshots) {
        snapshot.portfolioState = stateAt(snapshot.date, configs);
        snapshot.realizedPnL_CNY = +realizedPnLAsOf(closedPositions, snapshot.date).toFixed(2);
    }

    history.schemaVersion = 2;
    history.lastUpdated = new Date().toISOString();
    writeJson(HISTORY_FILE, history);

    const missingPnl = ['sh513110'].filter(code =>
        !closedPositions.some(cp => cp.code === code && Number.isFinite(cp.realizedPnL_CNY))
    );
    console.log(`Backfilled ${history.snapshots.length} snapshots with frozen portfolioState.`);
    if (missingPnl.length) {
        console.warn(`WARNING: ${missingPnl.join(', ')} 缺少合法 closedPositions / realizedPnL_CNY；其 2026-06-26 前历史成本仍无法审计。`);
    }
}

main();
