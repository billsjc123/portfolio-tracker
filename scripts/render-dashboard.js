#!/usr/bin/env node
/**
 * render-dashboard.js
 * 把 4 个数据块（CONFIG / HISTORY_MAIN / HISTORY_AW / TRADES）打补丁式注入到 dashboard.template.html，
 * 输出 portfolio-dashboard.html。
 *
 * 设计原则：模板是一份完整的 HTML（含所有 CSS / SVG / 交互 JS），
 *          本脚本只做字符串替换，不重建任何 DOM 结构。
 */

const fs = require('fs');
const path = require('path');

function renderDashboard({ template, config, historyMain, historyAW, trades }) {
    let html = template;
    html = html.replace(/var CONFIG = \{[\s\S]*?\};/, 'var CONFIG = ' + JSON.stringify(config) + ';');
    html = html.replace(/var HISTORY_MAIN = \{[\s\S]*?\};/, 'var HISTORY_MAIN = ' + JSON.stringify(historyMain) + ';');
    html = html.replace(/var HISTORY_AW = \{[\s\S]*?\};/, 'var HISTORY_AW = ' + JSON.stringify(historyAW) + ';');
    html = html.replace(/var TRADES = \{[\s\S]*?\};/, 'var TRADES = ' + JSON.stringify(trades) + ';');
    return html;
}

module.exports = { renderDashboard };

if (require.main === module) {
    // CLI 模式：模板在 data/，数据在 output/，渲染结果写到 output/portfolio-dashboard.html
    const ROOT = path.join(__dirname, '..');
    const DATA = path.join(ROOT, 'data');
    const OUT = path.join(ROOT, 'output');

    const tpl = fs.readFileSync(path.join(DATA, 'dashboard.template.html'), 'utf-8');
    const config = JSON.parse(fs.readFileSync(path.join(DATA, 'portfolio-config.json'), 'utf-8'));
    const historyMain = JSON.parse(fs.readFileSync(path.join(OUT, 'portfolio-history-main.json'), 'utf-8'));
    const historyAW = JSON.parse(fs.readFileSync(path.join(OUT, 'portfolio-history-aw.json'), 'utf-8'));
    const trades = JSON.parse(fs.readFileSync(path.join(DATA, 'portfolio-trades.json'), 'utf-8'));

    const html = renderDashboard({ template: tpl, config, historyMain, historyAW, trades });
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const dashPath = path.join(OUT, 'portfolio-dashboard.html');
    const indexPath = path.join(OUT, 'index.html');
    fs.writeFileSync(dashPath, html, 'utf-8');
    // 同时输出 index.html，让 GitHub Pages 根路径 / 直接可访问
    fs.writeFileSync(indexPath, html, 'utf-8');
    console.log('✅ 看板已渲染：' + dashPath + ' (' + Math.round(html.length / 1024) + ' KB)');
    console.log('   + ' + indexPath + ' (根路径入口)');
}
