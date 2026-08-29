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
