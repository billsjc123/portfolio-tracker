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
            items: [{ instrumentId: '0700.XHKG', researchStatus: 'approved', approvedAsOf: '2026-08-23', valuationFreshness: 'current' }]
        }
    });
    assert.match(html, /var RESEARCH_SUMMARIES = \{"schemaVersion":1/);
    assert.match(html, /0700\.XHKG/);
    assert.doesNotMatch(html, /privateThesis/);
});

test('template contains research tab and explicit empty-state gate', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    assert.match(template, /switchTab\('research'\)/);
    assert.match(template, /研究草稿不会自动发布/);
});

