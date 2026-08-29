// 兜底正则：没有提供已知编号清单时才会用到。培养方案课程编号格式五花八门（字母数字混排、
// 带罗马数字后缀等），靠正则猜测远不如直接比对已知编号清单可靠，所以只作为兜底。
const FALLBACK_CODE_RE = /^(?=.*[A-Za-z])(?=.*[0-9ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])[A-Za-z0-9ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{4,20}$/;
const CREDIT_RE = /^\d+(\.\d+)?$/;
// 湖南大学教务系统"已修课程"页面框选整页复制时，每个字段单独一行（不是一行一条记录），
// 但每条记录里"学年学期"这一行的格式非常固定（如 2023-2024-1），可以拿来当记录边界的锚点。
const TERM_RE = /^\d{4}-\d{4}-[123]$/;

function splitLine(line) {
  if (line.includes('\t')) {
    return line.split('\t').map(s => s.trim()).filter(Boolean);
  }
  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  }
  return line.split(',').map(s => s.trim()).filter(Boolean);
}

function parseDelimitedRows(lines, codeSet) {
  const courses = [];
  const unparsedLines = [];

  for (const line of lines) {
    const tokens = splitLine(line);
    const codeToken = codeSet
      ? tokens.find(t => codeSet.has(t))
      : tokens.find(t => FALLBACK_CODE_RE.test(t));
    if (!codeToken) {
      unparsedLines.push(line);
      continue;
    }
    const creditsToken = tokens.find(t => t !== codeToken && CREDIT_RE.test(t));
    if (!creditsToken) {
      unparsedLines.push(line);
      continue;
    }
    const nameTokens = tokens.filter(t => t !== codeToken && t !== creditsToken && !CREDIT_RE.test(t));
    const name = nameTokens.sort((a, b) => b.length - a.length)[0] || '';

    courses.push({ code: codeToken, name, credits: parseFloat(creditsToken) });
  }

  return { courses, unparsedLines };
}

// 每条记录形如：序号 / 学年学期 / 课程编号 / 课程名称 / 开课单位 / 成绩 / 学分 / 学时 / 绩点 /
// 考核方式 / 主修 / 考试性质 / 必选修 / 课程类别 /（可能有）模块备注。字段数量会因为成绩是"缺考"
// "优秀"这种非数字、或者有没有模块备注而变化，所以只锚定"学年学期"行的固定格式，编号紧跟其后，
// 名称紧跟编号之后——这个位置关系是可靠的，不需要靠已知编号清单来判断"这是不是编号"；这里只管把
// 记录切出来，"这个编号在不在培养方案里"完全交给下游 evaluatePlan 的 unmatchedCourses 去判断，
// 不在这一步预先过滤，否则"记录识别对了、只是方案里没有这门课"会被误报成"格式看不懂"。
// 学分和课程类别这两项不影响核算（核算学分以培养方案里登记的为准），只做展示用，尽量合理提取即可。
function parseVertical(lines, categoryNames) {
  const courses = [];
  const unparsedLines = [];
  const anchors = [];
  lines.forEach((l, i) => { if (TERM_RE.test(l)) anchors.push(i); });

  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;
    const codeLine = lines[start + 1];
    const nameLine = lines[start + 2];
    if (!codeLine) {
      unparsedLines.push(lines[start]);
      continue;
    }

    const body = lines.slice(start + 3, end);
    const numericTokens = body.filter(t => CREDIT_RE.test(t));
    const credits = numericTokens.length >= 2 ? parseFloat(numericTokens[1])
      : numericTokens.length === 1 ? parseFloat(numericTokens[0]) : 0;
    const category = categoryNames ? body.find(t => categoryNames.includes(t)) : undefined;

    const course = { code: codeLine, name: nameLine || '', credits };
    if (category) course.category = category;
    courses.push(course);
  }

  return { courses, unparsedLines };
}

/**
 * @param {string} text 粘贴的原始表格文本
 * @param {Set<string>|string[]} [validCodes] 当前培养方案里所有合法的课程编号；提供时按精确匹配识别编号，
 *   比正则猜测可靠得多（能处理各种奇怪格式）。不提供时退回正则兜底猜测。
 * @param {string[]} [categoryNames] 当前培养方案的类别名称列表，仅用于"教务系统竖排导出"格式下
 *   提取每条记录自带的课程类别标注（展示用，不参与核算判断）。
 */
export function parseTranscriptText(text, validCodes, categoryNames) {
  const codeSet = validCodes ? new Set(validCodes) : null;
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const hasTermAnchor = lines.some(l => TERM_RE.test(l));
  if (hasTermAnchor) {
    return parseVertical(lines, categoryNames);
  }
  return parseDelimitedRows(lines, codeSet);
}
