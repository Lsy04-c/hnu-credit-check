import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluatePlan } from './rules.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planData = JSON.parse(readFileSync(path.join(__dirname, 'data/plans/plan_chem_qiangji_2022.json'), 'utf8'));

test('未在方案中找到的课程编号会被记录为未匹配，不静默丢弃', () => {
  const result = evaluatePlan(planData, [{ code: 'ZZ99999', name: '某跨院系选修课', credits: 2 }]);
  assert.equal(result.unmatchedCourses.length, 1);
  assert.equal(result.unmatchedCourses[0].code, 'ZZ99999');
});

test('通识必修类别按匹配到的课程学分求和，并算出缺口', () => {
  const transcript = [
    { code: 'GE01150', name: '毛泽东思想和中国特色社会主义理论体系概论', credits: 3 },
    { code: 'GE01185', name: '思想道德与法治', credits: 3 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '通识必修');
  assert.equal(category.achieved, 6);
  assert.equal(category.required, 30);
  assert.equal(category.gap, 24);
});

test('个性培养-特色课程规则：只修满必选课共7学分时未达标（要求9学分）', () => {
  const transcript = [
    { code: 'CH10044', name: '科学研究训练实践（1）', credits: 1 },
    { code: 'CH10045', name: '科学研究训练实践（2）', credits: 1 },
    { code: 'CH10046', name: '科学研究训练实践（3）', credits: 1 },
    { code: 'CH05077', name: '化学基础科学问题研讨', credits: 2 },
    { code: 'CH06058', name: '计算化学', credits: 2 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_group' && r.group === '特色课程');
  assert.equal(rule.achieved, 7);
  assert.equal(rule.met, false);
});

test('个性培养-特色课程规则：加修一门选修课凑满9学分后达标', () => {
  const transcript = [
    { code: 'CH10044', name: '科学研究训练实践（1）', credits: 1 },
    { code: 'CH10045', name: '科学研究训练实践（2）', credits: 1 },
    { code: 'CH10046', name: '科学研究训练实践（3）', credits: 1 },
    { code: 'CH05077', name: '化学基础科学问题研讨', credits: 2 },
    { code: 'CH06058', name: '计算化学', credits: 2 },
    { code: 'CH06106', name: '化学与生活', credits: 2 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_group' && r.group === '特色课程');
  assert.equal(rule.achieved, 9);
  assert.equal(rule.met, true);
});

test('个性培养-模块1至5规则：跨模块组合刚好凑够6学分即达标', () => {
  const transcript = [
    { code: 'CH06062', name: '化学前沿', credits: 2 },
    { code: 'CH06089', name: '药物化学', credits: 2 },
    { code: 'CH06102', name: '材料化学', credits: 2 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_groups');
  assert.equal(rule.achieved, 6);
  assert.equal(rule.met, true);
});

test('个性培养-模块1至5规则：差0.5学分未达标（边界情况）', () => {
  const transcript = [
    { code: 'CH06062', name: '化学前沿', credits: 2 },
    { code: 'CH06089', name: '药物化学', credits: 2 },
    { code: 'CH05072', name: '高分子化学实验', credits: 0.5 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '个性培养');
  const rule = category.rules.find(r => r.type === 'min_credits_in_groups');
  assert.equal(rule.achieved, 4.5);
  assert.equal(rule.met, false);
});

test('同一门课程重复出现时学分只计一次，不会翻倍', () => {
  const transcript = [
    { code: 'CH04057', name: '无机化学（1）', credits: 3 },
    { code: 'CH04057', name: '无机化学（1）', credits: 3 },
  ];
  const result = evaluatePlan(planData, transcript);
  const category = result.categories.find(c => c.name === '学类核心');
  assert.equal(category.achieved, 3);
});
