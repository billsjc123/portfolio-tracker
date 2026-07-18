#!/usr/bin/env node
// scripts/update-portfolio.js
// 主流程：抓行情 → 更新历史快照 → 用模板渲染 dashboard
// 完全独立运行，不读写 iCloud 路径
// 数据落盘位置：docs/portfolio-history-main.json, docs/portfolio-history-aw.json
// 看板落盘位置：docs/portfolio-dashboard.html

const fs = require('fs');
const path = require('path');
const { fetchQuotes, fetchFundNav, fetchUsdCny, deriveHkdCny } = require('./fetch-quote');
const { renderDashboard } = require('./render-dashboard');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_DIR = path.join(ROOT, 'docs');
const CFG_FILE = path.join(DATA_DIR, 'portfolio-config.json');
const TRADES_FILE = path.join(DATA_DIR, 'portfolio-trades.json');
const TEMPLATE_FILE = path.join(DATA_DIR, 'dashboard.template.html');
const HIST_MAIN = path.join(OUTPUT_DIR, 'portfolio-history-main.json');
const HIST_AW = path.join(OUTPUT_DIR, 'portfolio-history-aw.json');
const DASHBOARD_OUT = path.join(OUTPUT_DIR, 'portfolio-dashboard.html');

function readJSON(p) {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
}
function writeJSON(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); }

function isWeekend(date) {
    const d = new Date(date);
    return d.getDay() === 0 || d.getDay() === 6;
}

/**
 * 汇总已实现 CNY 盈亏（含 USD PnL 按汇率折算）
 * 所有清仓记录必须包含 realizedPnL_CNY 或 realizedPnL_USD
 */
function sumRealizedPnL(closedPositions, asOfDate) {
    let total = 0;
    for (const cp of closedPositions) {
        if (cp.date && cp.date > asOfDate) continue;
        total += (cp.realizedPnL_CNY || 0);
    }
    return total;
}

/**
 * 补充汇总仅有 USD 盈亏的记录（等汇率到位后再调用）。
 * 新建清仓记录仍强制要求 recorded realizedPnL_CNY；这里仅兼容旧数据。
 */
function sumRealizedPnL_UsdOnly(closedPositions, usdCny, asOfDate) {
    let total = 0;
    for (const cp of closedPositions) {
        if (cp.date && cp.date > asOfDate) continue;
        if (cp.realizedPnL_USD && !cp.realizedPnL_CNY) {
            total += cp.realizedPnL_USD * usdCny;
        }
    }
    return total;
}

function buildPortfolioState(cfg) {
    return {
        holdings: structuredClone(cfg.holdings),
        cash: structuredClone(cfg.cash || { usd: 0, hkd: 0, rmb: 0 })
    };
}

/**
 * 账户状态从上一日到今日若移除了完整持仓，必须有合格的平仓记录。
 * 这条校验阻止“先从 config 删除、后补 realizedPnL”篡改累计历史。
 */
function validateFullClosures(previousState, currentHoldings, closedPositions, asOfDate) {
    if (!previousState?.holdings) return;

    const currentCodes = new Set(
        ['cn', 'hk', 'us'].flatMap(m => (currentHoldings[m] || []).map(h => h.code))
    );
    const removed = ['cn', 'hk', 'us']
        .flatMap(m => previousState.holdings[m] || [])
        .filter(h => !currentCodes.has(h.code));

    for (const holding of removed) {
        const record = (closedPositions || []).find(cp =>
            cp.code === holding.code && cp.date <= asOfDate && Number.isFinite(cp.realizedPnL_CNY)
        );
        if (!record) {
            throw new Error(
                `检测到 ${holding.code} 已从 holdings 移除，但 closedPositions 缺少 ` +
                `date <= ${asOfDate} 且带 realizedPnL_CNY 的平仓记录；拒绝写入会改写历史的快照。`
            );
        }
    }
}

/**
 * 主账户快照
 */
async function updateMainAccount(cfg, trades) {
    const codes = [];
    for (const m of ['cn', 'hk', 'us']) {
        for (const h of cfg.holdings[m]) codes.push(h.code);
    }
    console.log(`[main] 抓取 ${codes.length} 只标的行情...`);
    const quotes = await fetchQuotes(codes);

    const today = todayISO();
    const hist = readHistory(HIST_MAIN);
    const latestSnapshot = hist.snapshots[hist.snapshots.length - 1];
    validateFullClosures(latestSnapshot?.portfolioState, cfg.holdings, trades.closedPositions, today);

    const fxRaw = await fetchUsdCny();
    const rates = {
        USD_CNY: fxRaw?.USD_CNY || 7.0,
        HKD_CNY: fxRaw?.HKD_CNY || deriveHkdCny(fxRaw?.USD_CNY) || 0.9
    };

    // 已实现盈亏仅计入截至本快照日期已经完成的清仓。
    let realized = 0;
    if (Array.isArray(trades.closedPositions)) {
        realized += sumRealizedPnL(trades.closedPositions, today);
        realized += sumRealizedPnL_UsdOnly(trades.closedPositions, rates.USD_CNY, today);
    }
    if (trades.realizedPnLSummary) realized += (trades.realizedPnLSummary.mainCNY || 0);

    const snap = {
        date: today,
        dataTime: nowISO(),
        rates,
        portfolioState: buildPortfolioState(cfg),
        realizedPnL_CNY: +realized.toFixed(2),
        prices: {},
        changePct: {}
    };

    let successCount = 0;
    for (const c of codes) {
        const q = quotes[c];
        if (q && q.price > 0) {
            snap.prices[c] = q.price;
            snap.changePct[c] = q.changePercent;
            successCount++;
        } else {
            // 失败：回退到上一快照
            const prev = readHistoryLast(HIST_MAIN, c);
            snap.prices[c] = prev?.price || 0;
            snap.changePct[c] = 0;
        }
    }
    console.log(`[main] 成功 ${successCount}/${codes.length} (含 ETF 复权)`);

    const idx = hist.snapshots.findIndex(s => s.date === today);
    if (idx >= 0) hist.snapshots[idx] = snap; else hist.snapshots.push(snap);
    hist.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    hist.lastUpdated = nowISO();
    writeJSON(HIST_MAIN, hist);
    console.log(`[main] 写入快照 ${today} (历史 ${hist.snapshots.length} 条)`);

    return { snap, hist, successCount, total: codes.length };
}

/**
 * 全天候账户快照
 */
async function updateAllWeather(cfg) {
    const aw = cfg.allweather || {};
    const holdings = aw.holdings || [];
    const funds = aw.funds || [];

    const codes = holdings.map(h => h.code);
    console.log(`[aw] 抓取 ${codes.length} 只 ETF...`);
    const etfQuotes = await fetchQuotes(codes);

    const fundCodes = funds.map(f => f.code);
    console.log(`[aw] 抓取 ${fundCodes.length} 只基金净值...`);
    const fundData = {};
    for (const fc of fundCodes) {
        const data = await fetchFundNav(fc);
        fundData[fc] = data;
        if (data) console.log(`[aw]   ${fc} ${data.name || ''} NAV=${data.nav} (${data.navDate})`);
    }

    const fxRaw = await fetchUsdCny();
    const rates = {
        USD_CNY: fxRaw?.USD_CNY || 7.0,
        HKD_CNY: fxRaw?.HKD_CNY || deriveHkdCny(fxRaw?.USD_CNY) || 0.9
    };

    // 全天候已实现盈亏（默认 212.77 + 任何新增的）
    let awRealized = 212.77;
    // 兼容 config 中已有的 awRealizedPnL_CNY 字段（如有）
    if (aw.awRealizedPnL_CNY) awRealized = aw.awRealizedPnL_CNY;
    // 兼容 trades.realizedPnLSummary.allweatherCNY
    // 注：trades 里的汇总需外部传入，简化处理：从 cfg.allweather 直接取
    if (aw.allweatherCNY) awRealized = aw.allweatherCNY;

    const today = todayISO();
    const snap = {
        date: today,
        dataTime: nowISO(),
        rates,
        awRealizedPnL_CNY: +awRealized.toFixed(2),
        prices: {},
        changePct: {},
        funds: {}
    };

    let etfSuccess = 0;
    for (const c of codes) {
        const q = etfQuotes[c];
        if (q && q.price > 0) {
            snap.prices[c] = q.price;
            snap.changePct[c] = q.changePercent;
            etfSuccess++;
        } else {
            snap.prices[c] = 0;
            snap.changePct[c] = 0;
        }
    }
    let fundSuccess = 0;
    for (const f of funds) {
        const d = fundData[f.code];
        if (d && d.nav > 0) {
            snap.funds[f.code] = d.nav;
            fundSuccess++;
        } else {
            snap.funds[f.code] = 0;
        }
    }
    console.log(`[aw] ETF ${etfSuccess}/${codes.length}, Fund ${fundSuccess}/${fundCodes.length}`);

    let hist = readHistory(HIST_AW);
    const idx = hist.snapshots.findIndex(s => s.date === today);
    if (idx >= 0) hist.snapshots[idx] = snap; else hist.snapshots.push(snap);
    hist.snapshots.sort((a, b) => a.date.localeCompare(b.date));
    hist.lastUpdated = nowISO();
    writeJSON(HIST_AW, hist);
    console.log(`[aw] 写入快照 ${today} (历史 ${hist.snapshots.length} 条)`);

    return { snap, hist };
}

function readHistory(file) {
    if (!fs.existsSync(file)) return { version: 1, snapshots: [] };
    try { return readJSON(file); } catch (e) { return { version: 1, snapshots: [] }; }
}
function readHistoryLast(file, code) {
    if (!fs.existsSync(file)) return null;
    try {
        const h = readJSON(file);
        const last = h.snapshots[h.snapshots.length - 1];
        if (!last) return null;
        return { price: last.prices?.[code] || 0 };
    } catch (e) { return null; }
}

async function main() {
    const dateStr = todayISO();
    const dayLabel = ['日','一','二','三','四','五','六'][new Date().getDay()];
    console.log('==== Portfolio Update ====');
    console.log(`时间: ${dateStr} 星期${dayLabel}`);

    // 周末跳过
    if (isWeekend(dateStr)) {
        console.log('⏸️  周末，跳过更新。');
        return;
    }

    if (!fs.existsSync(CFG_FILE)) {
        throw new Error('config 不存在: ' + CFG_FILE);
    }
    if (!fs.existsSync(TEMPLATE_FILE)) {
        throw new Error('dashboard 模板不存在: ' + TEMPLATE_FILE);
    }

    const cfg = readJSON(CFG_FILE);
    const trades = readJSON(TRADES_FILE);

    const mainRes = await updateMainAccount(cfg, trades);
    const awRes = await updateAllWeather(cfg);

    // 渲染 dashboard：模板 + 注入 4 个数据块
    console.log('[render] 用模板渲染 dashboard.html...');
    const template = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    const html = renderDashboard({
        template,
        config: cfg,
        historyMain: mainRes.hist,
        historyAW: awRes.hist,
        trades
    });
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(DASHBOARD_OUT, html, 'utf-8');
    // 同时输出 index.html，让 GitHub Pages 根路径 / 直接可访问
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf-8');
    console.log(`[render] ✅ ${DASHBOARD_OUT} (${(html.length / 1024).toFixed(1)} KB)`);
    console.log(`[render] ✅ ${path.join(OUTPUT_DIR, 'index.html')} (Pages 根路径入口)`);

    // 落盘 last-run 状态
    const runStat = {
        lastRunAt: nowISO(),
        mainSuccess: mainRes.successCount,
        mainTotal: mainRes.total,
        snapshotDate: mainRes.snap.date
    };
    writeJSON(path.join(OUTPUT_DIR, 'last-run.json'), runStat);

    console.log('==== Done ====');
}

main().catch(e => {
    console.error('❌ 失败:', e);
    process.exit(1);
});
