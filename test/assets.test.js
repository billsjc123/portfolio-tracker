const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { renderDashboard } = require('../scripts/render-dashboard');

const ROOT = path.resolve(__dirname, '..');

test('asset overview includes external balance once without changing portfolio performance', () => {
    const template = fs.readFileSync(path.join(ROOT, 'data/dashboard.template.html'), 'utf8');
    // Fixtures are independent of the daily updater's mutable config and latest snapshots.
    const config = {
        holdings: { cn: [{ code: 'sh600036', name: '招商银行', qty: 100, cost: 35 }], hk: [], us: [] },
        cash: { usd: 4978.71, hkd: 12572.74, rmb: 96161.6 },
        cashManagement: { asOf: '2026-10-10', usd: '美元货基', hkd: '港元货基', rmb: '券商备用金', policy: '新增交易在富途' },
        externalAssets: [{ name: '微众备用金', balance: 130680, asOf: '2026-10-10', source: '测试样本', liquidity: '较快转回银行卡', reconciliation: 'confirmed' }],
        bondReserve: {
            name: '独立债基', asOf: '2026-10-10', source: '测试样本', note: '独立于全天候', cashManagementResidualCNY: 0.04,
            holdings: [
                { name: '中期债基', valueCNY: 151253.07, holdingPnlCNY: 1037.11 },
                { name: '长期债基', valueCNY: 101108.03, holdingPnlCNY: 1108.03 }
            ]
        },
        allweather: {
            holdings: [], cash: { rmb: 30992.4 },
            funds: [
                { code: '009803', name: '长债', shares: 19348.95, cost: 1.3019, costBasisCNY: 25190.07, reportedValueCNY: 25668.32, reportedNAV: 1.3266, navAsOf: '2026-10-09' },
                { code: '001512', name: '中债', shares: 6058.71, cost: 1.3864, costBasisCNY: 8400, reportedValueCNY: 8494.31, reportedNAV: 1.402, navAsOf: '2026-10-09' }
            ],
            fundReconciliation: {
                asOf: '2026-10-10', previousFunds: [
                    { code: '009803', name: '长债', shares: 15609.43, cost: 1.3063 },
                    { code: '001512', name: '中债', shares: 5203.11, cost: 1.3838 }
                ]
            }
        }
    };
    const rates = { USD_CNY: 6.7, HKD_CNY: 0.86 };
    const historyMain = { snapshots: [{
        date: '2026-10-09', rates, prices: { sh600036: 40 }, changePct: {}, realizedPnL_CNY: 0,
        portfolioState: { holdings: structuredClone(config.holdings), cash: { usd: 3077.268, hkd: 850, rmb: 96161.6 } }
    }] };
    const historyAW = { snapshots: [{ date: '2026-10-09', rates, prices: {}, funds: { '009803': 1.3266, '001512': 1.402 } }] };
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
    assert.match(elements['assets-external'].textContent, /130,680/);
    assert.match(elements['assets-detail'].innerHTML, /2026-10-10/);
    assert.doesNotMatch(elements['assets-note'].textContent, /待确认与原账户现金/);
    assert.match(elements['assets-detail'].innerHTML, /长桥现金：0/);
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
    assert.match(elements['assets-detail'].innerHTML, /非年化/);
    assert.match(elements['assets-detail'].innerHTML, /不再加一次收益/);
    const negative = vm.runInContext('calcBondReserve({holdings:[{name:"test",valueCNY:90,holdingPnlCNY:-10}]})', context);
    assert.equal(negative.pct, -10);
    assert.equal(vm.runInContext('calcBondReserve().pct', context), null);
    assert.match(elements['assets-aw-date'].textContent, /包含全天候账户现金/);
    // Reproduce update-data.yml: append a new snapshot with reconciled balances and newer NAVs.
    const refreshed = vm.runInContext(`(function(){
        var originalMain=JSON.stringify(calcMain(HISTORY_MAIN.snapshots[0]));
        var originalAW=JSON.stringify(calcAW(HISTORY_AW.snapshots[0]));
        var mainSnap=JSON.parse(JSON.stringify(HISTORY_MAIN.snapshots[0]));
        mainSnap.date='2026-10-12'; mainSnap.portfolioState.cash=JSON.parse(JSON.stringify(CONFIG.cash));
        HISTORY_MAIN.snapshots.push(mainSnap);
        HISTORY_AW.snapshots.push({date:'2026-10-12',rates:mainSnap.rates,prices:{},
            funds:{'009803':1.3283,'001512':1.4026},portfolioState:{funds:JSON.parse(JSON.stringify(CONFIG.allweather.funds))}});
        renderAssetOverview();
        var main=calcMain(mainSnap),aw=calcAW(HISTORY_AW.snapshots[1],true);
        return {historicalMainUnchanged:originalMain===JSON.stringify(calcMain(HISTORY_MAIN.snapshots[0])),
            historicalAWUnchanged:originalAW===JSON.stringify(calcAW(HISTORY_AW.snapshots[0])),
            usd:main.cash.usd,long:aw.stocks.find(function(h){return h.code==='009803';}),
            medium:aw.stocks.find(function(h){return h.code==='001512';})};
    })()`, context);
    assert.equal(refreshed.usd, 4978.71);
    assert.equal(refreshed.historicalMainUnchanged, true);
    assert.equal(refreshed.historicalAWUnchanged, true);
    assert.equal(refreshed.long.qty, 19348.95);
    assert.ok(Math.abs(refreshed.long.mv_cny - 19348.95 * 1.3283) < 1e-8);
    assert.ok(Math.abs(refreshed.medium.mv_cny - 6058.71 * 1.4026) < 1e-8);
    assert.match(elements['assets-main-date'].textContent, /2026-10-12/);
});
