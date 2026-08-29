import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planData = JSON.parse(readFileSync(path.join(__dirname, 'data/plans/plan_chem_qiangji_2022.json'), 'utf8'));

test('各类别学分要求合计等于毕业总学分', () => {
  const sum = planData.categories.reduce((total, category) => total + category.required_credits, 0);
  assert.equal(sum, planData.total_required_credits);
  assert.equal(planData.total_required_credits, 140);
});

test('个性培养类别包含特色课程和模块1-5两条特殊规则', () => {
  const category = planData.categories.find(c => c.name === '个性培养');
  const ruleTypes = category.rules.map(r => r.type);
  assert.ok(ruleTypes.includes('min_credits_in_group'));
  assert.ok(ruleTypes.includes('min_credits_in_groups'));
});

test('每门课程编号在同一份培养方案里只出现一次（避免匹配时产生歧义）', () => {
  const codes = planData.categories.flatMap(c => c.courses.map(course => course.code));
  const uniqueCodes = new Set(codes);
  assert.equal(codes.length, uniqueCodes.size);
});
