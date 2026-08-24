const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { renderDashboard } = require('../scripts/render-dashboard');

const ROOT = path.resolve(__dirname, '..');

test('renderer injects only the supplied public research payload', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    const html = renderDashboard({
        template,
        config: { holdings: { cn: [], hk: [], us: [] } },
        historyMain: { snapshots: [] },
        historyAW: { snapshots: [] },
        trades: { trades: [] },
        researchSummaries: {
            schemaVersion: 1,
            generatedAt: '2026-08-23T00:00:00Z',
            items: [{
                instrumentId: 'HK:00700.XHKG', companyName: '腾讯控股', researchStatus: 'approved', approvedAsOf: '2026-08-23',
                thesisStatus: 'intact', confidence: 'medium', valuationFreshness: 'current',
                valuation: { currency: 'HKD', bear: 275.69, base: 491.98, bull: 805.45 },
                priceZones: { buyReview: 393.58, baseValue: 491.98, overvaluationReviewLow: 590.38, overvaluationReviewHigh: 639.57 },
                topRisks: ['自由现金流低于阈值']
            }]
        }
    });
    assert.match(html, /var RESEARCH_SUMMARIES = \{"schemaVersion":1/);
    assert.match(html, /HK:00700\.XHKG/);
    assert.match(html, /腾讯控股/);
    assert.match(html, /393\.58/);
    assert.doesNotMatch(html, /privateThesis/);
});

test('template links holdings to company details and turns research into a watchlist', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    assert.match(template, /switchTab\('research'\)/);
    assert.match(template, /观察池/);
    assert.match(template, /openCompanyDetail/);
    assert.match(template, /id="page-company"/);
    assert.match(template, /关键价位/);
    assert.match(template, /买入.*高估/);
    assert.match(template, /filter\(function\(item\)\{return !researchPosition\(item\);\}\)/);
    assert.match(template, /研究草稿不会公开/);
    assert.match(template, /进入买入复核区/);
    assert.match(template, /持仓数量/);
    assert.match(template, /价格区间仅触发复核/);
    assert.match(template, /逻辑完整/);
});
