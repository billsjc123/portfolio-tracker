const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { renderDashboard } = require('../scripts/render-dashboard');

const ROOT = path.resolve(__dirname, '..');

test('asset overview includes external balance once without changing portfolio performance', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/portfolio-config.json'), 'utf8'));
    const historyMain = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/portfolio-history-main.json'), 'utf8'));
    const historyAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/portfolio-history-aw.json'), 'utf8'));
    const html = renderDashboard({ template, config, historyMain, historyAW, trades: { trades: [], closedPositions: [] }, researchPages: [] });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ==================== 启动 ====================')[0];
    const elements = {};
    const context = vm.createContext({ window: {}, document: { getElementById: id => elements[id] ||= {} }, console });
    vm.runInContext(script, context);
    const result = vm.runInContext(`(function(){
        var main=calcMain(HISTORY_MAIN.snapshots[HISTORY_MAIN.snapshots.length-1]);
        var aw=calcAW(HISTORY_AW.snapshots[HISTORY_AW.snapshots.length-1]);
        var original=JSON.stringify(main);
        var before=calcAssetOverview(main,aw,[]);
        var after=calcAssetOverview(main,aw,CONFIG.externalAssets);
        renderAssetOverview();
        renderAssetOverview();
        return {difference:after.total-before.total,external:after.external,
            unchanged:original===JSON.stringify(calcMain(HISTORY_MAIN.snapshots[HISTORY_MAIN.snapshots.length-1])),
            missing:calcAssetOverview(null,aw,CONFIG.externalAssets).total,
            empty:calcAssetOverview(main,aw).external,pending:after.pending};
    })()`, context);
    assert.ok(Math.abs(result.difference - 130680) < 0.000001);
    assert.equal(result.external, 130680);
    assert.equal(result.unchanged, true);
    assert.equal(result.missing, null);
    assert.equal(result.empty, 0);
    assert.equal(result.pending, false);
    assert.equal(elements['assets-external'].textContent, '¥130,680.04');
    assert.match(elements['assets-note'].textContent, /余款 ¥0\.04/);
    const chart = elements['assets-chart'].innerHTML;
    const widths = [...chart.matchAll(/style="width:([\d.]+)%"/g)].map(match => Number(match[1]));
    assert.equal(widths.length, 4);
    assert.ok(Math.abs(widths.reduce((sum, width) => sum + width, 0) - 100) < 1e-8);
    assert.match(elements['assets-main-share'].textContent, /%$/);
    assert.doesNotMatch(html, /id="assets-detail"/);
    assert.doesNotMatch(elements['assets-note'].textContent, /待确认与原账户现金/);
    const supplemental = vm.runInContext('renderSupplementalAssetTables()', context);
    const cashNote = vm.runInContext('renderCashManagementNote()', context);
    assert.match(supplemental, /账户外现金管理/);
    assert.match(supplemental, /130,680\.00/);
    assert.match(supplemental, /2026-10-10/);
    assert.match(cashNote, /长桥现金：0\.00/);
    const balances = vm.runInContext(`(function(){
        var snap=HISTORY_MAIN.snapshots[HISTORY_MAIN.snapshots.length-1];
        var old=calcMain(snap),current=calcMain(snap,true);
        return {oldUSD:old.cash.usd,currentUSD:current.cash.usd,currentHKD:current.cash.hkd,
            pnlSame:old.cumulativePnLCNY===current.cumulativePnLCNY};
    })()`, context);
    assert.equal(balances.oldUSD, 3077.268);
    assert.equal(balances.currentUSD, 4978.71);
    assert.equal(balances.currentHKD, 12572.74);
    assert.equal(balances.pnlSame, true);
    const funds = vm.runInContext(`(function(){
        var snap=HISTORY_AW.snapshots[HISTORY_AW.snapshots.length-1];
        var old=calcAW(snap),current=calcAW(snap,true);
        var long=current.stocks.find(function(h){return h.code==='009803';});
        var medium=current.stocks.find(function(h){return h.code==='001512';});
        var before=calcAssetOverview(null,current,[]);
        var main=calcMain(HISTORY_MAIN.snapshots[HISTORY_MAIN.snapshots.length-1],true);
        var base=calcAssetOverview(main,current,CONFIG.externalAssets);
        var full=calcAssetOverview(main,current,CONFIG.externalAssets,CONFIG.bondReserve);
        return {long:long,medium:medium,oldShares:old.stocks.find(function(h){return h.code==='009803';}).qty,
            cash:current.cashCNY,extra:full.total-base.total,bonds:full.bonds};
    })()`, context);
    assert.equal(funds.long.qty, 19348.95);
    assert.equal(funds.medium.qty, 6058.71);
    assert.equal(funds.long.mv_cny, 25668.32);
    assert.equal(funds.medium.mv_cny, 8494.31);
    assert.ok(Math.abs(funds.long.pnl_cny - 478.25) < 1e-8);
    assert.ok(Math.abs(funds.medium.pnl_cny - 94.31) < 1e-8);
    assert.equal(funds.oldShares, 15609.43);
    assert.equal(funds.cash, 30992.4);
    assert.ok(Math.abs(funds.bonds - 252361.10) < 1e-8);
    assert.ok(Math.abs(funds.extra - 252361.14) < 1e-8);
    const bonds = vm.runInContext('calcBondReserve(CONFIG.bondReserve)', context);
    assert.ok(Math.abs(bonds.pnl - 2145.14) < 1e-8);
    assert.ok(Math.abs(bonds.cost - 250215.96) < 1e-8);
    assert.ok(Math.abs(bonds.pct - 2145.14 / 250215.96 * 100) < 1e-8);
    assert.match(elements['assets-bonds-pnl'].textContent, /2,145.14/);
    assert.match(elements['assets-bonds-pnl'].textContent, /0.86%/);
    assert.match(supplemental, /非年化/);
    assert.match(supplemental, /不再加一次收益/);
    assert.match(supplemental, /252,361\.10/);
    const negative = vm.runInContext('calcBondReserve({holdings:[{name:"test",valueCNY:90,holdingPnlCNY:-10}]})', context);
    assert.equal(negative.pct, -10);
    assert.equal(vm.runInContext('calcBondReserve().pct', context), null);
    assert.match(elements['assets-aw-date'].textContent, /包含全天候账户现金/);
});

test('supplemental asset tables render every configured row without truncation', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/portfolio-config.json'), 'utf8'));
    const html = renderDashboard({ template, config, historyMain: { snapshots: [] }, historyAW: { snapshots: [] }, trades: { trades: [], closedPositions: [] }, researchPages: [] });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// ==================== 启动 ====================')[0];
    const context = vm.createContext({ window: {}, document: {}, console });
    vm.runInContext(script, context);
    const tables = vm.runInContext(`(function(){
        CONFIG.externalAssets=Array.from({length:120},function(_,i){return {
            name:'备用资金 '+i,balance:i+1,asOf:'2026-10-10',liquidity:'手工记录',source:'测试数据'
        };});
        return renderSupplementalAssetTables();
    })()`, context);
    assert.match(tables, /备用资金 0/);
    assert.match(tables, /备用资金 119/);
    assert.equal((tables.match(/<tr><td><div class="stock-name">备用资金 /g) || []).length, 120);
});
