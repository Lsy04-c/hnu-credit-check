import { parseTranscriptText } from './parse.js';
import { evaluatePlan } from './rules.js';

async function loadPlanData() {
  const res = await fetch('data/plan_chem_qiangji_2022.json');
  return res.json();
}

function appendCell(row, text) {
  const td = document.createElement('td');
  td.textContent = text;
  row.appendChild(td);
}

function renderResult(evalResult, unparsedLines) {
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
      if (rule.type === 'remainder_open') continue;
      const ruleRow = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      const label = rule.type === 'min_credits_in_group' ? rule.group : rule.groups.join('/');
      td.textContent = `　规则：${label} 至少 ${rule.min} 学分，已修 ${rule.achieved} 学分 —— ${rule.met ? '已达标' : '未达标'}`;
      ruleRow.appendChild(td);
      table.appendChild(ruleRow);
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
    const names = evalResult.unmatchedCourses.map(c => `${c.code} ${c.name}`).join('、');
    warn.textContent = `以下课程未能在培养方案里找到对应类别，可能属于通识选修或跨院系选课，请自行确认归类：${names}`;
    container.appendChild(warn);
  }
}

async function main() {
  const planData = await loadPlanData();
  document.getElementById('evaluate-btn').addEventListener('click', () => {
    const text = document.getElementById('transcript-input').value;
    const { courses, unparsedLines } = parseTranscriptText(text);
    const evalResult = evaluatePlan(planData, courses);
    renderResult(evalResult, unparsedLines);
  });
}

main();
