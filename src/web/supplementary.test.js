import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'data/supplementary');

function load(name) {
  return JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
}

test('通识选修补充课表：每条记录都有 code/name/credits/group', () => {
  const catalog = load('tongshi_xuanxiu.json');
  assert.equal(catalog.category, '通识选修');
  assert.ok(catalog.courses.length > 0);
  for (const c of catalog.courses) {
    assert.ok(c.code);
    assert.ok(c.name);
    assert.equal(typeof c.credits, 'number');
    assert.ok(c.group);
  }
});

test('创新创业补充课表：没有重复编号', () => {
  const catalog = load('innovation.json');
  assert.equal(catalog.category, '创新创业');
  const codes = catalog.courses.map(c => c.code);
  assert.equal(codes.length, new Set(codes).size);
});

test('四史课程名单：4门课程名称都在', () => {
  const sishi = load('sishi.json');
  assert.equal(sishi.names.length, 4);
  assert.ok(sishi.names.includes('社会主义发展史'));
});

test('通识选修课程简介目录（按名字兜底匹配用）：覆盖面比编号课表更广，每条都有模块和学分，模块名合法', () => {
  const catalog = load('tongshi_name_hints.json');
  assert.ok(catalog.courses.length > 300);
  const validModules = new Set(['中华文化与世界文明', '社会科学与现代社会', '科学探索与技术创新', '艺术审美与表达沟通']);
  for (const c of catalog.courses) {
    assert.ok(c.name);
    assert.ok(validModules.has(c.module), `出现了不认识的模块名：${c.module}`);
    assert.equal(typeof c.credits, 'number');
  }
  const names = catalog.courses.map(c => c.name);
  assert.equal(new Set(names).size, names.length, '课程名不应该重复（否则按名字匹配会有歧义）');
});
