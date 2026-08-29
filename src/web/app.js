import { parseTranscriptText } from './parse.js';
import { evaluatePlan } from './rules.js';

async function loadIndex() {
  const res = await fetch('data/index.json');
  return res.json();
}

async function loadPlanData(jsonFile) {
  const res = await fetch(`data/plans/${encodeURIComponent(jsonFile)}`);
  return res.json();
}

async function loadJson(path) {
  const res = await fetch(path);
  return res.json();
}

function pdfUrl(pdfFile) {
  return `data/pdf/${pdfFile.split('/').map(encodeURIComponent).join('/')}`;
}

function appendCell(row, text) {
  const td = document.createElement('td');
  td.textContent = text;
  row.appendChild(td);
}

function appendNoteRow(table, text, className) {
  const row = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 4;
  if (className) td.className = className;
  td.textContent = text;
  row.appendChild(td);
  table.appendChild(row);
}

function renderResult(evalResult, unparsedLines, sishiCatalog) {
  const container = document.getElementById('result');
  container.innerHTML = '';

  const summary = document.createElement('p');
  summary.textContent = `培养方案要求总学分 ${evalResult.totalRequired}，本次匹配到已修学分 ${evalResult.totalAchieved}`;
  container.appendChild(summary);

  const table = document.createElement('table');
  const header = document.createElement('tr');
  ['类别', '要求学分', '已修学分', '缺口'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    header.appendChild(th);
  });
  table.appendChild(header);

  for (const category of evalResult.categories) {
    const row = document.createElement('tr');
    [category.name, category.required, category.achieved, category.gap].forEach(v => appendCell(row, v));
    table.appendChild(row);

    for (const rule of category.rules) {
      const label = rule.type === 'min_credits_in_group' ? rule.group
        : rule.type === 'min_credits_in_groups' ? rule.groups.join('/')
        : null;
      if (label) {
        appendNoteRow(table, `　规则：${label} 至少 ${rule.min} 学分，已修 ${rule.achieved} 学分 —— ${rule.met ? '已达标' : '未达标'}`);
      } else if (rule.note) {
        appendNoteRow(table, `　说明：${rule.note}`, 'note');
      }
    }

    if (category.groupBreakdown) {
      for (const g of category.groupBreakdown) {
        appendNoteRow(table, `　模块「${g.group}」已修 ${g.achieved} 学分`);
      }
      if (category.usedSupplementary) {
        appendNoteRow(table, '　（以上模块数据只能核实到补充课表覆盖的学期，历史学期修读的课程可能无法识别，不代表没修）', 'note');
      }
    }

    if (category.missingRequiredCourses.length > 0) {
      const names = category.missingRequiredCourses.map(c => c.name).join('、');
      appendNoteRow(table, `　还没修的必修课程：${names}`, 'warning-inline');
    }

    if (category.name === '通识必修' && sishiCatalog) {
      appendNoteRow(
        table,
        `　"四史"类课程（${sishiCatalog.names.join('/')}）至少选修1门，无统一课程编号，本工具无法自动核实，请自行确认`,
        'note'
      );
    }
  }
  container.appendChild(table);

  if (unparsedLines.length > 0) {
    const warn = document.createElement('p');
    warn.className = 'warning';
    warn.textContent = `以下 ${unparsedLines.length} 行未能识别（可能是表头或格式不规则的行），已跳过：${unparsedLines.join(' / ')}`;
    container.appendChild(warn);
  }

  if (evalResult.unmatchedCourses.length > 0) {
    const warn = document.createElement('p');
    warn.className = 'warning';
    const names = evalResult.unmatchedCourses
      .map(c => c.category ? `${c.code} ${c.name}（成绩单标注类别：${c.category}）` : `${c.code} ${c.name}`)
      .join('、');
    warn.textContent = `以下课程未能在培养方案里找到对应记录（可能是新版课程编号、通识选修或跨院系选课），请自行确认归类：${names}`;
    container.appendChild(warn);
  }
}

async function main() {
  const select = document.getElementById('plan-select');
  const planInfo = document.getElementById('plan-info');
  const evaluateBtn = document.getElementById('evaluate-btn');

  select.disabled = true;
  select.options[0].textContent = '加载专业列表中...';

  // 补充课表（通识选修/创新创业本学期课表）在后台加载，不卡住页面变得可操作——
  // 只有真正点"核算学分"、且这些数据确实要用到的时候才去等它加载完
  const supplementaryPromise = Promise.all([
    loadJson('data/supplementary/tongshi_xuanxiu.json'),
    loadJson('data/supplementary/innovation.json'),
    loadJson('data/supplementary/sishi.json'),
  ]);

  const index = await loadIndex();
  select.disabled = false;
  select.options[0].textContent = '请选择...';
  index.forEach((entry, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = entry.plan_name;
    select.appendChild(option);
  });

  let planData = null;

  select.addEventListener('change', async () => {
    document.getElementById('result').innerHTML = '';
    if (select.value === '') {
      planInfo.innerHTML = '';
      evaluateBtn.disabled = true;
      planData = null;
      return;
    }
    const entry = index[Number(select.value)];
    planInfo.innerHTML = '';
    const link = document.createElement('a');
    link.href = pdfUrl(entry.pdf_file);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '查看原始培养方案 PDF';
    planInfo.appendChild(link);
    planInfo.append(`　｜　毕业最低学分：${entry.total_required_credits}`);

    evaluateBtn.disabled = true;
    evaluateBtn.textContent = '加载中...';
    planData = await loadPlanData(entry.json_file);
    evaluateBtn.disabled = false;
    evaluateBtn.textContent = '核算学分';
  });

  evaluateBtn.addEventListener('click', async () => {
    if (!planData) return;
    evaluateBtn.disabled = true;
    evaluateBtn.textContent = '核算中...';
    try {
      const [tongshiCatalog, innovationCatalog, sishiCatalog] = await supplementaryPromise;
      const supplementaryCatalogs = [tongshiCatalog, innovationCatalog];

      const text = document.getElementById('transcript-input').value;
      const openPoolCategoryNames = new Set(planData.categories.filter(c => c.open_pool).map(c => c.name));
      const supplementaryCodes = supplementaryCatalogs
        .filter(catalog => openPoolCategoryNames.has(catalog.category))
        .flatMap(catalog => catalog.courses.map(course => course.code));
      const validCodes = [
        ...planData.categories.flatMap(c => c.courses.map(course => course.code)).filter(Boolean),
        ...supplementaryCodes,
      ];
      const categoryNames = planData.categories.map(c => c.name);
      const { courses, unparsedLines } = parseTranscriptText(text, validCodes, categoryNames);
      const evalResult = evaluatePlan(planData, courses, supplementaryCatalogs);
      renderResult(evalResult, unparsedLines, sishiCatalog);
    } finally {
      evaluateBtn.disabled = false;
      evaluateBtn.textContent = '核算学分';
    }
  });
}

main();
