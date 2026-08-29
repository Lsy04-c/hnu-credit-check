// 兜底正则：没有提供已知编号清单时才会用到。培养方案课程编号格式五花八门（字母数字混排、
// 带罗马数字后缀等），靠正则猜测远不如直接比对已知编号清单可靠，所以只作为兜底。
const FALLBACK_CODE_RE = /^(?=.*[A-Za-z])(?=.*[0-9ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])[A-Za-z0-9ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{4,20}$/;
const CREDIT_RE = /^\d+(\.\d+)?$/;

function splitLine(line) {
  if (line.includes('\t')) {
    return line.split('\t').map(s => s.trim()).filter(Boolean);
  }
  if (/\s{2,}/.test(line)) {
    return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  }
  return line.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * @param {string} text 粘贴的原始表格文本
 * @param {Set<string>|string[]} [validCodes] 当前培养方案里所有合法的课程编号；提供时按精确匹配识别编号，
 *   比正则猜测可靠得多（能处理各种奇怪格式）。不提供时退回正则兜底猜测。
 */
export function parseTranscriptText(text, validCodes) {
  const codeSet = validCodes ? new Set(validCodes) : null;
  const courses = [];
  const unparsedLines = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

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
