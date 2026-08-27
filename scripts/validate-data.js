#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function read(relativePath) {
    try {
        return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
    } catch (error) {
        errors.push(`${relativePath}: ${error.message}`);
        return null;
    }
}

function finite(value) { return Number.isFinite(value); }
function checkHolding(holding, location) {
    if (!holding || typeof holding.code !== 'string' || !holding.code.trim()) errors.push(`${location}: code 缺失`);
    if (!holding || typeof holding.name !== 'string' || !holding.name.trim()) errors.push(`${location}: name 缺失`);
    if (!finite(holding?.qty) || holding.qty < 0) errors.push(`${location}: qty 必须是非负数`);
    if (!finite(holding?.cost)) errors.push(`${location}: cost 必须是有限数值`);
    // 负成本是账本的有效语义：累计回收资本已超过剩余仓位原始投入。
}

const config = read('data/portfolio-config.json');
if (config) {
    for (const market of ['cn', 'hk', 'us']) {
        if (!Array.isArray(config.holdings?.[market])) errors.push(`portfolio-config: holdings.${market} 必须是数组`);
        else config.holdings[market].forEach((holding, index) => checkHolding(holding, `holdings.${market}[${index}]`));
    }
    (config.allweather?.holdings || []).forEach((holding, index) => checkHolding(holding, `allweather.holdings[${index}]`));
    for (const [currency, value] of Object.entries(config.cash || {})) {
        if (!finite(value)) errors.push(`cash.${currency}: 必须是有限数值`);
    }
}

const trades = read('data/portfolio-trades.json');
if (trades) {
    if (!Array.isArray(trades.trades)) errors.push('portfolio-trades: trades 必须是数组');
    for (const [index, trade] of (trades.trades || []).entries()) {
        if (!trade.date || !/^\d{4}-\d{2}-\d{2}$/.test(trade.date)) errors.push(`trades[${index}]: date 无效`);
        if (!['buy', 'sell', 'dividend'].includes(trade.action)) errors.push(`trades[${index}]: action 无效`);
        for (const field of ['price', 'qty', 'settleAmount']) if (!finite(trade[field])) errors.push(`trades[${index}].${field}: 必须是有限数值`);
    }
}

for (const relativePath of ['docs/portfolio-history-main.json', 'docs/portfolio-history-aw.json']) {
    const history = read(relativePath);
    if (!history) continue;
    if (!Array.isArray(history.snapshots)) errors.push(`${relativePath}: snapshots 必须是数组`);
    const dates = new Set();
    for (const [index, snapshot] of (history.snapshots || []).entries()) {
        if (dates.has(snapshot.date)) errors.push(`${relativePath}: 重复日期 ${snapshot.date}`);
        dates.add(snapshot.date);
        if (index && history.snapshots[index - 1].date > snapshot.date) errors.push(`${relativePath}: 快照未按日期排序`);
        for (const [code, price] of Object.entries(snapshot.prices || {})) {
            if (!finite(price) || price < 0) errors.push(`${relativePath}: ${snapshot.date} ${code} 价格无效`);
        }
    }
}

const research = read('public-research/company-summaries.json');
if (research) {
    if (research.schemaVersion !== 1 || !Array.isArray(research.items)) errors.push('public-research: schemaVersion/items 无效');
    const allowed = new Set(['instrumentId', 'companyName', 'researchStatus', 'approvedAsOf', 'thesisStatus', 'confidence', 'valuation', 'priceZones', 'topRisks', 'valuationFreshness']);
    const required = [...allowed];
    for (const [index, item] of (research.items || []).entries()) {
        for (const key of Object.keys(item)) if (!allowed.has(key)) errors.push(`public-research.items[${index}]: 禁止公开字段 ${key}`);
        for (const key of required) if (!(key in item)) errors.push(`public-research.items[${index}]: 缺少字段 ${key}`);
        if (item.researchStatus !== 'approved') errors.push(`public-research.items[${index}]: 只允许 approved 状态`);
        if (!['intact', 'watch', 'broken'].includes(item.thesisStatus)) errors.push(`public-research.items[${index}]: thesisStatus 无效`);
        if (!['low', 'medium', 'high'].includes(item.confidence)) errors.push(`public-research.items[${index}]: confidence 无效`);
        if (!['HKD', 'USD', 'CNY'].includes(item.valuation?.currency)) errors.push(`public-research.items[${index}].valuation.currency: 无效`);
        for (const key of ['bear', 'base', 'bull']) if (!finite(item.valuation?.[key])) errors.push(`public-research.items[${index}].valuation.${key}: 必须是有限数值`);
        for (const key of ['buyReview', 'baseValue', 'overvaluationReviewLow', 'overvaluationReviewHigh']) if (!finite(item.priceZones?.[key])) errors.push(`public-research.items[${index}].priceZones.${key}: 必须是有限数值`);
        if (finite(item.priceZones?.buyReview) && finite(item.priceZones?.baseValue) && item.priceZones.buyReview > item.priceZones.baseValue) errors.push(`public-research.items[${index}]: 买入复核价不能高于 Base`);
        if (finite(item.priceZones?.baseValue) && finite(item.priceZones?.overvaluationReviewLow) && item.priceZones.baseValue > item.priceZones.overvaluationReviewLow) errors.push(`public-research.items[${index}]: Base 不能高于高估复核下限`);
        if (finite(item.priceZones?.overvaluationReviewLow) && finite(item.priceZones?.overvaluationReviewHigh) && item.priceZones.overvaluationReviewLow > item.priceZones.overvaluationReviewHigh) errors.push(`public-research.items[${index}]: 高估复核区间顺序无效`);
        if (!Array.isArray(item.topRisks) || item.topRisks.some((risk) => typeof risk !== 'string' || !risk.trim())) errors.push(`public-research.items[${index}]: topRisks 无效`);
    }
}

if (!fs.existsSync(path.join(ROOT, 'docs/index.html'))) warnings.push('docs/index.html 不存在');
if (!fs.existsSync(path.join(ROOT, 'docs/portfolio-dashboard.html'))) warnings.push('docs/portfolio-dashboard.html 不存在');

for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const error of errors) console.error(`ERROR ${error}`);
console.log(`校验完成：${errors.length} 个错误，${warnings.length} 个警告`);
if (errors.length) process.exit(1);
