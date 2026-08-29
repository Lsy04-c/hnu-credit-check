import { parseTranscriptText } from './parse.js?v=__BUILD_VERSION__';
import { evaluatePlan } from './rules.js?v=__BUILD_VERSION__';

// 每次部署时 GitHub Actions 会把这个占位符替换成当次 commit 的哈希值，让浏览器把每次更新都当成
// 全新的文件请求，不会因为缓存了旧版数据文件而看不到最新修复（本地直接打开跑不会替换，属于预期）。
const BUILD_VERSION = '__BUILD_VERSION__';

function withVersion(path) {
  return `${path}?v=${BUILD_VERSION}`;
}

async function loadIndex() {
  const res = await fetch(withVersion('data/index.json'));
  return res.json();
}

async function loadPlanData(jsonFile) {
  const res = await fetch(withVersion(`data/plans/${encodeURIComponent(jsonFile)}`));
  return res.json();
}

async function loadJson(path) {
  const res = await fetch(withVersion(path));
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

function appendElectivePoolRow(table, pool) {
  const row = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 4;

  const takenCount = pool.courses.filter(c => c.taken).length;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = `　「${pool.group}」可选课程（共${pool.courses.length}门，已修${takenCount}门，点击展开）`;
  details.appendChild(summary);

  const list = document.createElement('ul');
  for (const c of pool.courses) {
    const li = document.createElement('li');
    li.textContent = `${c.taken ? '✓ ' : ''}${c.name}（${c.credits}学分）`;
    if (c.taken) li.className = 'taken';
    list.appendChild(li);
  }
  details.appendChild(list);
  td.appendChild(details);
  row.appendChild(td);
  table.appendChild(row);
}

// "四史"这4门课没有统一课程编号，没法靠编号匹配，但名字是确定的4个——直接在解析出来的全部课程里
// （不管最后有没有匹配上方案）找名字，找到了就能实锤"这条要求满足了"，不用只是提醒了事
function findSishiMatch(evalResult, sishiCatalog) {
  if (!sishiCatalog) return null;
  const allCourses = [
    ...evalResult.categories.flatMap(c => c.matchedCourses),
    ...evalResult.unmatchedCourses,
  ];
  return allCourses.find(c => sishiCatalog.names.includes(c.name)) || null;
}

function renderResult(evalResult, unparsedLines, sishiCatalog, nameHints) {
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

    if (category.electivePools) {
      for (const pool of category.electivePools) {
        appendElectivePoolRow(table, pool);
      }
    }

    if (category.name === '通识必修' && sishiCatalog && !findSishiMatch(evalResult, sishiCatalog)) {
      appendNoteRow(
        table,
        `　"四史"类课程（${sishiCatalog.names.join('/')}）至少选修1门，没有统一课程编号，成绩单里没找到这4个课程名，请自行确认是否已修读`,
        'warning-inline'
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
    const sishiMatch = findSishiMatch(evalResult, sishiCatalog);
    const warn = document.createElement('p');
    warn.className = 'warning';
    const names = evalResult.unmatchedCourses
      .map(c => {
        const guessedModule = nameHints && nameHints.name_to_module[c.name];
        const parts = [`${c.code} ${c.name}`];
        if (sishiMatch && c.code === sishiMatch.code) parts.push('已用于满足"四史"要求');
        if (c.category) parts.push(`成绩单标注类别：${c.category}`);
        if (guessedModule) parts.push(`按课程名推测可能属于通识选修「${guessedModule}」模块，不保证准确`);
        return parts.length > 1 ? `${parts[0]}（${parts.slice(1).join('；')}）` : parts[0];
      })
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
    loadJson('data/supplementary/tongshi_name_hints.json'),
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
      const [tongshiCatalog, innovationCatalog, sishiCatalog, nameHints] = await supplementaryPromise;
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
      renderResult(evalResult, unparsedLines, sishiCatalog, nameHints);
    } finally {
      evaluateBtn.disabled = false;
      evaluateBtn.textContent = '核算学分';
    }
  });
}

main();
