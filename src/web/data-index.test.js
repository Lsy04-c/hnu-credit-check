import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const index = JSON.parse(readFileSync(path.join(dataDir, 'index.json'), 'utf8'));

test('index.json 至少包含86份2024版培养方案', () => {
  assert.ok(index.length >= 86);
});

test('index.json 每一条引用的 json_file 和 pdf_file 都真实存在', () => {
  for (const entry of index) {
    const jsonPath = path.join(dataDir, 'plans', entry.json_file);
    const pdfPath = path.join(dataDir, 'pdf', entry.pdf_file);
    assert.ok(existsSync(jsonPath), `缺少 JSON 文件：${entry.json_file}（${entry.plan_name}）`);
    assert.ok(existsSync(pdfPath), `缺少 PDF 文件：${entry.pdf_file}（${entry.plan_name}）`);
  }
});

test('index.json 里没有重复的 plan_id', () => {
  const ids = index.map(e => e.plan_id);
  assert.equal(ids.length, new Set(ids).size);
});

test('每份 plan JSON 的 plan_id 与 index.json 里记录的一致', () => {
  for (const entry of index) {
    const planData = JSON.parse(readFileSync(path.join(dataDir, 'plans', entry.json_file), 'utf8'));
    assert.equal(planData.plan_id, entry.plan_id, `${entry.json_file} 内容的 plan_id 与 index.json 不一致`);
  }
});
