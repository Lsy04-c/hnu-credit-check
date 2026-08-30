const BUILD_VERSION = '__BUILD_VERSION__';

function withVersion(path) {
  return `${path}?v=${BUILD_VERSION}`;
}

async function loadJson(path) {
  const res = await fetch(withVersion(path));
  return res.json();
}

const CAMPUS_ORDER = ['南校区', '北校区', '科创港', '未分类'];

function flattenCourses(plans) {
  const rows = [];
  for (const plan of plans) {
    for (const course of plan.courses) {
      rows.push({
        code: course.code,
        name: course.name,
        credits: course.credits,
        group: course.group,
        examType: course.exam_type, // '考试' | '考查' | null
        season: course.season, // '秋季' | '春季' | '秋春' | null
        semester: course.semester, // 1-8（第几学期）| null
        seasonIsGuess: course.season_is_guess, // true=按学期奇偶推算，false=按实际课表匹配
        crossCollege: course.cross_college, // true=其他专业学生可选，false=表格标了"限选"，仅本专业
        recommended: course.recommended, // true=课程名带*，官方推荐优先修读的跨专业课程
        planId: plan.plan_id,
        planName: plan.plan_name,
        campus: plan.campus,
        college: plan.college,
        campusNote: plan.campus_note,
      });
    }
  }
  return rows;
}

function examLabel(examType) {
  if (examType === '考试') return '考试';
  if (examType === '考查') return '考查';
  return '未标注';
}

function examClass(examType) {
  if (examType === '考试') return 'exam-yes';
  if (examType === '考查') return 'exam-no';
  return 'exam-unknown';
}

function seasonLabel(row) {
  if (row.season === '秋春') return '秋春都开';
  if (row.season !== '秋季' && row.season !== '春季') return '未知';
  if (row.seasonIsGuess) return `推测·${row.season}`;
  return `${row.season}（据实际课表）`;
}

function seasonClass(season) {
  if (!season) return 'season-unknown';
  return 'season-known';
}

function crossCollegeLabel(row) {
  if (!row.crossCollege) return '限选·仅本专业';
  return row.recommended ? '可跨专业选·官方推荐' : '可跨专业选';
}

function crossCollegeClass(crossCollege) {
  return crossCollege ? 'cross-yes' : 'cross-no';
}

function renderTable(container, rows) {
  container.innerHTML = '';
  if (rows.length === 0) {
    const p = document.createElement('p');
    p.className = 'plan-info';
    p.textContent = '没有符合条件的课程。';
    container.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>课程名</th>
      <th>跨专业</th>
      <th>学分</th>
      <th>考核方式</th>
      <th>开课学期</th>
      <th>所属模块</th>
      <th>所属专业</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = row.name;
    tr.appendChild(nameTd);

    const crossTd = document.createElement('td');
    crossTd.textContent = crossCollegeLabel(row);
    crossTd.className = crossCollegeClass(row.crossCollege);
    tr.appendChild(crossTd);

    const creditsTd = document.createElement('td');
    creditsTd.textContent = row.credits;
    tr.appendChild(creditsTd);

    const examTd = document.createElement('td');
    examTd.textContent = examLabel(row.examType);
    examTd.className = examClass(row.examType);
    tr.appendChild(examTd);

    const seasonTd = document.createElement('td');
    seasonTd.textContent = seasonLabel(row);
    seasonTd.className = seasonClass(row.season);
    tr.appendChild(seasonTd);

    const groupTd = document.createElement('td');
    groupTd.textContent = row.group || '—';
    groupTd.className = 'note';
    tr.appendChild(groupTd);

    const planTd = document.createElement('td');
    planTd.textContent = row.planName;
    tr.appendChild(planTd);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

async function main() {
  const data = await loadJson('data/elective_browse.json');
  const campusMap = await loadJson('data/campus_map.json');
  const allRows = flattenCourses(data.plans);

  const coverageNote = document.getElementById('coverage-note');
  const totalPlans = data.plans.length;
  coverageNote.textContent =
    `共收录 ${totalPlans} 个专业、${allRows.length} 门专业选修课` +
    '（个别专业的选修课在培养方案里没有列出具体课程名单，暂时收录不到；' +
    '考核方式、开课学期都是从培养方案原文自动识别的，没有逐条人工核对，仅供参考）。';

  const campusesPresent = CAMPUS_ORDER.filter((c) => allRows.some((r) => r.campus === c));

  const tabsContainer = document.getElementById('campus-tabs');
  const creditsFilter = document.getElementById('credits-filter');
  const examFilter = document.getElementById('exam-filter');
  const collegeFilter = document.getElementById('college-filter');
  const crossFilter = document.getElementById('cross-filter');
  const keywordFilter = document.getElementById('keyword-filter');
  const resultCount = document.getElementById('result-count');
  const resultTable = document.getElementById('result-table');

  let activeCampus = '全部';

  function buildTabs() {
    tabsContainer.innerHTML = '';
    const options = ['全部', ...campusesPresent];
    for (const campus of options) {
      const btn = document.createElement('button');
      const count = campus === '全部'
        ? allRows.length
        : allRows.filter((r) => r.campus === campus).length;
      btn.textContent = `${campus}（${count}）`;
      btn.className = campus === activeCampus ? 'active' : '';
      btn.addEventListener('click', () => {
        activeCampus = campus;
        buildTabs();
        applyFilters();
      });
      tabsContainer.appendChild(btn);
    }
  }

  function rowsInActiveCampus() {
    return activeCampus === '全部' ? allRows : allRows.filter((r) => r.campus === activeCampus);
  }

  function buildCreditsOptions() {
    const rows = rowsInActiveCampus();
    const credits = [...new Set(rows.map((r) => r.credits))].sort((a, b) => a - b);
    const current = creditsFilter.value;
    creditsFilter.innerHTML = '<option value="">全部</option>';
    for (const c of credits) {
      const opt = document.createElement('option');
      opt.value = String(c);
      opt.textContent = `${c} 学分`;
      creditsFilter.appendChild(opt);
    }
    if (credits.some((c) => String(c) === current)) {
      creditsFilter.value = current;
    }
  }

  function buildCollegeOptions() {
    const rows = rowsInActiveCampus();
    const colleges = [...new Set(rows.map((r) => r.college).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'zh')
    );
    const current = collegeFilter.value;
    collegeFilter.innerHTML = '<option value="">全部</option>';
    for (const college of colleges) {
      const opt = document.createElement('option');
      opt.value = college;
      opt.textContent = college;
      collegeFilter.appendChild(opt);
    }
    if (colleges.includes(current)) {
      collegeFilter.value = current;
    }
  }

  function applyFilters() {
    buildCreditsOptions();
    buildCollegeOptions();

    let rows = rowsInActiveCampus();

    if (creditsFilter.value !== '') {
      const target = Number(creditsFilter.value);
      rows = rows.filter((r) => r.credits === target);
    }

    if (examFilter.value === '考试' || examFilter.value === '考查') {
      rows = rows.filter((r) => r.examType === examFilter.value);
    } else if (examFilter.value === 'unknown') {
      rows = rows.filter((r) => !r.examType);
    }

    if (collegeFilter.value !== '') {
      rows = rows.filter((r) => r.college === collegeFilter.value);
    }

    if (crossFilter.value === 'yes') {
      rows = rows.filter((r) => r.crossCollege);
    } else if (crossFilter.value === 'no') {
      rows = rows.filter((r) => !r.crossCollege);
    }

    const keyword = keywordFilter.value.trim();
    if (keyword) {
      rows = rows.filter(
        (r) => r.name.includes(keyword) || r.planName.includes(keyword)
      );
    }

    resultCount.textContent = `共 ${rows.length} 条`;
    renderTable(resultTable, rows);
  }

  buildTabs();
  creditsFilter.addEventListener('change', applyFilters);
  examFilter.addEventListener('change', applyFilters);
  collegeFilter.addEventListener('change', applyFilters);
  crossFilter.addEventListener('change', applyFilters);
  keywordFilter.addEventListener('input', applyFilters);

  applyFilters();
}

main();
