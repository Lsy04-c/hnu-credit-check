const CODE_RE = /^[A-Za-z]{2,4}\d{4,6}$/;
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

export function parseTranscriptText(text) {
  const courses = [];
  const unparsedLines = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const tokens = splitLine(line);
    const codeToken = tokens.find(t => CODE_RE.test(t));
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
