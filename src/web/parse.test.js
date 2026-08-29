import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscriptText } from './parse.js';

test('解析 Tab 分隔的一行（课程编号/课程名/学分/成绩）', () => {
  const { courses, unparsedLines } = parseTranscriptText('CH04057\t无机化学（1）\t3\t85');
  assert.equal(courses.length, 1);
  assert.deepEqual(courses[0], { code: 'CH04057', name: '无机化学（1）', credits: 3 });
  assert.equal(unparsedLines.length, 0);
});

test('解析逗号分隔的一行', () => {
  const { courses } = parseTranscriptText('CH04058,无机化学（2）,2');
  assert.deepEqual(courses[0], { code: 'CH04058', name: '无机化学（2）', credits: 2 });
});

test('解析多空格对齐的一行', () => {
  const { courses } = parseTranscriptText('CH04059   有机化学（1）   2   良好');
  assert.deepEqual(courses[0], { code: 'CH04059', name: '有机化学（1）', credits: 2 });
});

test('解析多行，且没有课程编号的表头行会被跳过并记录', () => {
  const text = [
    '课程编号\t课程名称\t学分\t成绩',
    'CH04057\t无机化学（1）\t3\t85',
    'CH04058\t无机化学（2）\t2\t90',
  ].join('\n');
  const { courses, unparsedLines } = parseTranscriptText(text);
  assert.equal(courses.length, 2);
  assert.equal(unparsedLines.length, 1);
  assert.equal(unparsedLines[0], '课程编号\t课程名称\t学分\t成绩');
});

test('小数学分能正确解析', () => {
  const { courses } = parseTranscriptText('CH04065\t基础无机化学实验（1）\t1.5\t合格');
  assert.equal(courses[0].credits, 1.5);
});

test('空行会被忽略，不计入 unparsedLines', () => {
  const { courses, unparsedLines } = parseTranscriptText('CH04057\t无机化学（1）\t3\n\n\nCH04058\t无机化学（2）\t2');
  assert.equal(courses.length, 2);
  assert.equal(unparsedLines.length, 0);
});

test('提供已知编号清单时，按精确匹配识别编号（不依赖正则猜测格式）', () => {
  const validCodes = ['TB001MY24', 'ZJ001SX24AⅠ'];
  const text = 'TB001MY24\t马克思主义基本原理\t3\t90\nZJ001SX24AⅠ\t高等数学AⅠ\t5\t85';
  const { courses, unparsedLines } = parseTranscriptText(text, validCodes);
  assert.equal(courses.length, 2);
  assert.deepEqual(courses[0], { code: 'TB001MY24', name: '马克思主义基本原理', credits: 3 });
  assert.deepEqual(courses[1], { code: 'ZJ001SX24AⅠ', name: '高等数学AⅠ', credits: 5 });
  assert.equal(unparsedLines.length, 0);
});

test('已知编号清单里带内部空格的编号也能整体识别（Tab分隔时空格是编号的一部分）', () => {
  const validCodes = ['TB001TY24 Ⅱ'];
  const { courses } = parseTranscriptText('TB001TY24 Ⅱ\t体育Ⅱ\t1\t合格', validCodes);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].code, 'TB001TY24 Ⅱ');
});

test('提供已知编号清单时，不在清单里的编号样式文本不会被误认成课程', () => {
  const validCodes = ['TB001MY24'];
  const { courses, unparsedLines } = parseTranscriptText('ZZ99999\t某门不存在的课\t2\t90', validCodes);
  assert.equal(courses.length, 0);
  assert.equal(unparsedLines.length, 1);
});
