const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { renderDashboard } = require('../scripts/render-dashboard');

const ROOT = path.resolve(__dirname, '..');

test('renderer injects the one-page source without a second research summary', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    const html = renderDashboard({
        template,
        config: { holdings: { cn: [], hk: [], us: [] } },
        historyMain: { snapshots: [] },
        historyAW: { snapshots: [] },
        trades: { trades: [] },
        researchPages: [{ instrumentId: 'HK:00700.XHKG', companyName: '腾讯控股', updatedAt: '2026-09-22', markdown: '## 估值与操作\n\nBase 491.98 港元' }]
    });
    assert.match(html, /var RESEARCH_PAGES = \[/);
    assert.match(html, /HK:00700\.XHKG/);
    assert.match(html, /腾讯控股/);
    assert.match(html, /491\.98/);
    assert.doesNotMatch(html, /RESEARCH_SUMMARIES/);
    assert.throws(() => renderDashboard({ template: '<html></html>', config: {}, historyMain: {}, historyAW: {}, trades: {}, researchPages: [] }), /缺少研报注入位置/);
    const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(inlineScript);
    assert.doesNotThrow(() => new vm.Script(inlineScript[1]));
});

test('template links holdings to company details and turns research into a watchlist', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    assert.match(template, /switchTab\('research'\)/);
    assert.match(template, /观察仓/);
    assert.match(template, /openCompanyDetail/);
    assert.match(template, /id="page-company"/);
    assert.doesNotMatch(template, /关键价位/);
    assert.match(template, /查看完整一页纸、估值与观察清单/);
    assert.match(template, /RESEARCH_PAGES\.filter\(function\(page\)\{return !researchPosition\(page\);\}\)/);
    assert.match(template, /未持有 · 研报更新于/);
    assert.match(template, /快照价 · /);
    assert.match(template, /researchReader\(page\)/);
    assert.match(template, /三个视图均来自同一份研报正文/);
    assert.match(template, /暂无一页纸研报/);
    assert.match(template, /持仓数量/);
    assert.match(template, /renderOnePageMarkdown/);
    assert.match(template, /function researchSection/);
    assert.match(template, /function researchReader/);
    assert.match(template, /公司一页纸/);
    assert.match(template, /观察清单/);
    assert.match(template, /最近变化/);
    assert.match(template, /research-toc/);
    assert.match(template, /research-reader-standalone/);
    assert.match(template, /one-page-watch/);
    assert.match(template, /one-page-changes/);
    assert.match(template, /<table><thead><tr>/);
    assert.match(template, /三个视图均来自同一份研报正文/);
});
