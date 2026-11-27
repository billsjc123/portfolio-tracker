const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchUsdCny } = require('../scripts/fetch-quote');
const { calculateRealizedPnLCNY } = require('../scripts/update-portfolio');

test('HKD/CNY uses the live USD/HKD cross rate', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            result: 'success',
            rates: { CNY: 6.674963, HKD: 7.837296 },
            time_last_update_unix: 1795737751
        })
    });
    try {
        const rates = await fetchUsdCny();
        assert.equal(rates.USD_CNY, 6.674963);
        assert.equal(rates.HKD_CNY, 0.851692);
    } finally {
        global.fetch = originalFetch;
    }
});

test('realized profit summary does not duplicate closed positions', () => {
    const trades = {
        closedPositions: [
            { date: '2026-11-19', realizedPnL_CNY: -100 },
            { date: '2026-11-20', realizedPnL_USD: 2 },
            { date: '2026-11-28', realizedPnL_CNY: 20 }
        ],
        realizedPnLSummary: { mainCNY: -80 }
    };
    assert.equal(calculateRealizedPnLCNY(trades, '2026-11-27', 6.7), -86.6);
});
