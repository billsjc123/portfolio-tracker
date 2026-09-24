const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    parseReport,
    readReports,
    REQUIRED_SECTIONS,
    CURRENT_RESEARCH_STANDARD
} = require('../scripts/company-research');

const body = '# 公司标题\n\n' + REQUIRED_SECTIONS.map(section => `## ${section}\n\n内容。`).join('\n\n');
const standardBody = '# 公司标题\n\n' + REQUIRED_SECTIONS.map(section => {
    if (section === '公司做什么') return `## ${section}\n\n内容。\n\n### 产销链分析\n\n上游输入到下游客户及报表传导。`;
    if (section === '行业与竞争') return `## ${section}\n\n内容。\n\n### 同业对比\n\n比较经济机制、关键指标和优劣。`;
    if (section === '市场在定价什么') return `## ${section}\n\n内容。\n\n### 核心投资逻辑\n\n短期验证与长期价值创造。`;
    return `## ${section}\n\n内容。`;
}).join('\n\n');

test('一页纸必须有固定章节，但正文可以因公司而异', () => {
    const report = parseReport(`---\ninstrumentId: HK:00506.XHKG\ncompanyName: 中国食品\nupdatedAt: 2026-08-26\n---\n${body}`);
    assert.equal(report.companyName, '中国食品');
    assert.match(report.markdown, /## 观察清单/);
    assert.throws(() => parseReport(`---\ninstrumentId: HK:00506.XHKG\ncompanyName: 中国食品\nupdatedAt: 2026-08-26\n---\n# 标题\n## 一句话判断`), /章节顺序/);
    assert.throws(() => parseReport(`---\ninstrumentId: HK:00506.XHKG\ncompanyName: 中国食品\nupdatedAt: 2026-08-26\nprivateToken: secret\n---\n${body}`), /不允许公开元数据/);
});

test('新建或更新的一页纸必须采用统一研究标准', () => {
    const frontmatter = `---\ninstrumentId: US:INTU.XNAS\ncompanyName: 财捷\nupdatedAt: 2026-09-24\nresearchStandard: ${CURRENT_RESEARCH_STANDARD}\n---\n`;
    const report = parseReport(frontmatter + standardBody);
    assert.equal(report.researchStandard, CURRENT_RESEARCH_STANDARD);
    assert.throws(() => parseReport(frontmatter + body), /产销链分析/);
    assert.throws(() => parseReport(frontmatter + standardBody.replace('### 产销链分析', '### 产销链分析\n\n重复内容。\n\n### 产销链分析')), /产销链分析/);
    assert.throws(() => parseReport(frontmatter + standardBody.replace('### 同业对比', '### 同业比较')), /同业对比/);
    assert.throws(() => parseReport(frontmatter + standardBody.replace('### 核心投资逻辑', '### 投资逻辑')), /核心投资逻辑/);
    assert.throws(() => parseReport(`---\ninstrumentId: US:INTU.XNAS\ncompanyName: 财捷\nupdatedAt: 2026-09-24\n---\n${standardBody}`), /必须使用 researchStandard/);
});

test('统一研究模块必须位于指定父章节', () => {
    const misplaced = standardBody
        .replace('\n\n### 产销链分析\n\n上游输入到下游客户及报表传导。', '')
        .replace('## 业务拆解\n\n内容。', '## 业务拆解\n\n内容。\n\n### 产销链分析\n\n上游输入到下游客户及报表传导。');
    assert.throws(() => parseReport(`---\ninstrumentId: US:INTU.XNAS\ncompanyName: 财捷\nupdatedAt: 2026-09-24\nresearchStandard: 2\n---\n${misplaced}`), /必须位于“## 公司做什么”内/);
});

test('目录扫描保留超过常见规模的全部一页纸', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-pages-'));
    try {
        for (let index = 1; index <= 120; index++) {
            const instrumentId = `US:T${index}.XNAS`;
            const filename = instrumentId.replace(/[:.]/g, '-') + '.md';
            fs.writeFileSync(path.join(directory, filename), `---\ninstrumentId: ${instrumentId}\ncompanyName: 测试 ${index}\nupdatedAt: 2026-09-24\nresearchStandard: 2\n---\n${standardBody}`);
        }
        assert.equal(readReports(directory).length, 120);
    } finally {
        fs.rmSync(directory, { recursive: true });
    }
});

test('看板只读取唯一研报源', () => {
    const reports = readReports();
    const chinaFood = reports.find(report => report.instrumentId === 'HK:00506.XHKG');
    assert.ok(chinaFood);
    assert.match(chinaFood.markdown, /2026-08-25｜2026 年中期业绩/);
    assert.match(chinaFood.markdown, /2026082500238_c\.pdf/);
    assert.match(chinaFood.markdown, /\*\*影响\*\*/);
    assert.match(chinaFood.markdown, /\*\*研究处理\*\*/);
});

test('唯一研报源完整保留表格、观察清单和最近变化供不同视图读取', () => {
    const richBody = '# 公司标题\n\n' + REQUIRED_SECTIONS.map(section => {
        if (section === '业务拆解') return `## ${section}\n\n| 业务 | 收入 |\n|---|---:|\n| 核心 | 100 |`;
        if (section === '观察清单') return `## ${section}\n\n- 客户增速低于 4% 时复核 Base。`;
        if (section === '最近变化') return `## ${section}\n\n- **2026-09-23｜财报**：更新经营指引。**影响**：改变收入锚点。**研究处理**：重估。`;
        return `## ${section}\n\n内容。`;
    }).join('\n\n');
    const report = parseReport(`---\ninstrumentId: US:INTU.XNAS\ncompanyName: 财捷\nupdatedAt: 2026-09-23\n---\n${richBody}`);
    assert.match(report.markdown, /\| 业务 \| 收入 \|/);
    assert.match(report.markdown, /## 观察清单\n\n- 客户增速低于 4%/);
    assert.match(report.markdown, /## 最近变化\n\n- \*\*2026-09-23｜财报\*\*/);
    assert.match(report.markdown, /\*\*影响\*\*/);
    assert.match(report.markdown, /\*\*研究处理\*\*/);
});
