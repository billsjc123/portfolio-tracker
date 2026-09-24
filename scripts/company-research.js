const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.resolve(__dirname, '..', 'docs', 'research');
const REQUIRED_SECTIONS = [
    '一句话判断', '公司做什么', '业务拆解', '行业与竞争', '管理层与资本配置',
    '财务质量', '市场在定价什么', '估值与操作', '反方与风险', '观察清单', '最近变化'
];
const CURRENT_RESEARCH_STANDARD = 2;
const RESEARCH_STANDARD_ADOPTION_DATE = '2026-09-24';
const REQUIRED_STANDARD_MODULES = [
    { heading: '产销链分析', parent: '公司做什么' },
    { heading: '同业对比', parent: '行业与竞争' },
    { heading: '核心投资逻辑', parent: '市场在定价什么' }
];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function parseReport(source, filename = '<research>') {
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) throw new Error(`${filename}: 缺少 YAML-like 元数据块`);
    const metadata = {};
    const allowedMetadata = new Set(['instrumentId', 'companyName', 'updatedAt', 'researchStandard']);
    for (const line of match[1].split(/\r?\n/)) {
        const part = line.match(/^([a-zA-Z]+):\s*(.+)$/);
        if (!part) throw new Error(`${filename}: 元数据格式无效：${line}`);
        if (!allowedMetadata.has(part[1])) throw new Error(`${filename}: 不允许公开元数据 ${part[1]}`);
        if (metadata[part[1]]) throw new Error(`${filename}: 重复元数据 ${part[1]}`);
        metadata[part[1]] = part[2].trim();
    }
    for (const key of ['instrumentId', 'companyName', 'updatedAt']) {
        if (!metadata[key]) throw new Error(`${filename}: 缺少 ${key}`);
    }
    if (!/^(CN|HK|US):[A-Z0-9]+\.(XSHG|XSHE|XHKG|XNAS|XNYS)$/.test(metadata.instrumentId)) {
        throw new Error(`${filename}: instrumentId 无效`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.updatedAt)) throw new Error(`${filename}: updatedAt 无效`);
    const mustUseCurrentStandard = metadata.updatedAt >= RESEARCH_STANDARD_ADOPTION_DATE;
    if (mustUseCurrentStandard && metadata.researchStandard !== String(CURRENT_RESEARCH_STANDARD)) {
        throw new Error(`${filename}: ${RESEARCH_STANDARD_ADOPTION_DATE} 起新建或更新的研报必须使用 researchStandard: ${CURRENT_RESEARCH_STANDARD}`);
    }
    if (metadata.researchStandard && metadata.researchStandard !== String(CURRENT_RESEARCH_STANDARD)) {
        throw new Error(`${filename}: researchStandard 无效`);
    }
    const headings = [...match[2].matchAll(/^## (.+)$/gm)].map(item => item[1].trim());
    if (headings.length !== REQUIRED_SECTIONS.length || headings.some((heading, index) => heading !== REQUIRED_SECTIONS[index])) {
        throw new Error(`${filename}: 一页纸章节顺序不符合约定`);
    }
    if (metadata.researchStandard === String(CURRENT_RESEARCH_STANDARD)) {
        const body = match[2];
        for (const { heading, parent } of REQUIRED_STANDARD_MODULES) {
            const parentStart = body.indexOf(`## ${parent}`);
            const nextSection = body.indexOf('\n## ', parentStart + 1);
            const parentBody = body.slice(parentStart, nextSection === -1 ? body.length : nextSection);
            const occurrences = [...body.matchAll(new RegExp(`^### ${heading}$`, 'gm'))].length;
            if (occurrences !== 1 || !new RegExp(`^### ${heading}$`, 'm').test(parentBody)) {
                throw new Error(`${filename}: researchStandard: ${CURRENT_RESEARCH_STANDARD} 要求“### ${heading}”且必须位于“## ${parent}”内`);
            }
        }
    }
    return {
        ...metadata,
        researchStandard: Number(metadata.researchStandard || 1),
        markdown: match[2].trim()
    };
}

function readReports(directory = RESEARCH_DIR) {
    if (!fs.existsSync(directory)) throw new Error(`研报目录不存在：${directory}`);
    return fs.readdirSync(directory).filter(name => name.endsWith('.md')).sort().map(name => {
        const report = parseReport(fs.readFileSync(path.join(directory, name), 'utf8'), name);
        const expectedName = report.instrumentId.replace(/[:.]/g, '-') + '.md';
        if (name !== expectedName) throw new Error(`${name}: 文件名应为 ${expectedName}`);
        return report;
    });
}

module.exports = {
    parseReport,
    readReports,
    REQUIRED_SECTIONS,
    REQUIRED_STANDARD_MODULES,
    CURRENT_RESEARCH_STANDARD,
    RESEARCH_STANDARD_ADOPTION_DATE,
    escapeHtml
};
