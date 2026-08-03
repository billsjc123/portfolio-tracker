#!/usr/bin/env node
// scripts/fetch-quote.js
// 纯 HTTP 调腾讯自选股公开接口 qt.gtimg.cn，替代 westock-data CLI
// 输入：codes 数组（如 ['sh513650','hk00700','usGOOG']）
// 输出：{ [code]: { name, price, change, changePercent, open, high, low, prevClose, time } }

const iconv = require('iconv-lite');

const ENDPOINT = 'https://qt.gtimg.cn/q=';
const TIMEOUT = 15000;

/**
 * 把 GBK 编码的 qt.gtimg.cn 返回值解析成结构化对象
 * 字段顺序（A股/港股ETF/美股大致一致）：
 * [0]   市场/未知
 * [1]   名称
 * [2]   代码
 * [3]   当前价
 * [4]   昨收
 * [5]   今开
 * [6]   成交量(手)
 * [30]  时间
 * [31]  涨跌额
 * [32]  涨跌幅%
 * [33]  最高
 * [34]  最低
 * [38]  换手率
 * [45]  市盈率(动)
 */
function parseQuoteLine(line) {
  // v_sh513650="1~标普500ETF南方~513650~1.872~...";
  const m = line.match(/^v_([^=]+)="(.+)"\s*;?\s*$/);
  if (!m) return null;
  const symbol = m[1];
  const raw = m[2];
  const parts = raw.split('~');
  if (parts.length < 35) return null;

  const toNum = (v) => {
    if (v === undefined || v === null || v === '') return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  return {
    symbol,
    name: parts[1] || '',
    price: toNum(parts[3]),
    prevClose: toNum(parts[4]),
    open: toNum(parts[5]),
    change: toNum(parts[31]),
    changePercent: toNum(parts[32]),
    high: toNum(parts[33]),
    low: toNum(parts[34]),
    volume: toNum(parts[6]),
    turnoverRate: toNum(parts[38]),
    pe: toNum(parts[39]),
    time: parts[30] || ''
  };
}

/**
 * 批量抓取行情：codes 数组 →  { [code]: parsed }
 * 失败容错：单只失败不影响其它
 */
async function fetchQuotes(codes) {
  if (!codes.length) return {};
  // 腾讯接口支持逗号分隔，100 只以内通常稳定
  const url = ENDPOINT + codes.join(',');
  let buf;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    buf = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw new Error('fetch failed: ' + e.message);
  }

  // qt.gtimg.cn 返回 GBK
  const text = iconv.decode(buf, 'gbk');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseQuoteLine(trimmed);
    if (!parsed) continue;
    out[parsed.symbol] = parsed;
  }
  return out;
}

/**
 * 抓东方财富官方基金净值（api.fund.eastmoney.com/f10/lsjz）
 * 输入：fundCode 6 位数字字符串
 * 输出：{ nav: 1.3239, navDate: '2026-07-01', name: '...' } 或 null
 *
 * 注意：旧实现用 fundgz.1234567.com.cn（盘中估值接口），对部分基金返回 404
 * "页面未找到"，导致净值长期取不到。官方 lsjz 接口稳定覆盖全部基金，
 * 且净值一般 19:00-21:00 发布，晚间可拿到当日官方收盘净值。
 */
async function fetchFundNav(fundCode) {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${fundCode}&pageIndex=1&pageSize=1&startDate=&endDate=`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    // 官方接口要求 Referer 头，否则返回 -1 Unauthorized
    const res = await fetch(url, { signal: ctrl.signal, headers: { Referer: 'https://fundf10.eastmoney.com/' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    const list = j?.Data?.LSJZList;
    if (!Array.isArray(list) || !list.length) return null;
    const rec = list[0];
    return {
      nav: parseFloat(rec.DWJZ) || 0,
      navDate: rec.FSRQ || '',
      name: rec.FUND_NAME || '',
      yesterdayNav: 0 // lsjz 接口不含昨日净值字段，净值涨幅由 navDate/历史记录推算
    };
  } catch (e) {
    return null;
  }
}

/**
 * 抓 USD/CNY 汇率（open.er-api.com）
 * 输出：{ USD_CNY: 6.801054, ... }
 */
async function fetchUsdCny() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.result !== 'success') return null;
    return {
      USD_CNY: j.rates?.CNY || 0,
      HKD_CNY: 0, // er-api 不直接给 HKD，下面单独兜底
      base: 'USD',
      asOf: j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString() : ''
    };
  } catch (e) {
    return null;
  }
}

/**
 * 兜底 HKD/CNY 汇率
 * 用 USD/CNY * (USD/HKD) 换算
 * USD/HKD ≈ 7.80 区间，可以写死近似值（误差 < 0.1%）
 */
function deriveHkdCny(usdCny) {
  if (!usdCny) return 0;
  return +(usdCny / 7.80).toFixed(6);
}

module.exports = { fetchQuotes, fetchFundNav, fetchUsdCny, deriveHkdCny };

// CLI: node fetch-quote.js sh513650,hk00700
if (require.main === module) {
  const codes = (process.argv[2] || '').split(',').filter(Boolean);
  fetchQuotes(codes).then(r => console.log(JSON.stringify(r, null, 2)));
}
