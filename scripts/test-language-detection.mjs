#!/usr/bin/env node
/**
 * 语言检测逻辑测试脚本
 * 验证保底策略：英文默认，只有明确中文才使用中文
 */

// 模拟 normalizeLanguage 函数
function normalizeLanguage(lang) {
  try {
    if (!lang || typeof lang !== 'string') {
      return 'en';
    }
    
    const normalized = lang.toLowerCase().trim();
    if (normalized.startsWith('zh')) {
      return 'zh';
    }
    
    return 'en';
  } catch (error) {
    return 'en';
  }
}

// 测试用例
const testCases = [
  // [输入, 预期输出, 描述]
  ['zh-CN', 'zh', '简体中文'],
  ['zh-TW', 'zh', '繁体中文（台湾）'],
  ['zh-HK', 'zh', '繁体中文（香港）'],
  ['zh-SG', 'zh', '简体中文（新加坡）'],
  ['zh-MO', 'zh', '繁体中文（澳门）'],
  ['zh', 'zh', '通用中文'],
  ['ZH-CN', 'zh', '大写中文'],
  ['Zh-Tw', 'zh', '混合大小写中文'],
  
  ['en-US', 'en', '美式英语'],
  ['en-GB', 'en', '英式英语'],
  ['en', 'en', '通用英语'],
  ['English', 'en', '英文单词'],
  
  ['ja-JP', 'en', '日语'],
  ['ko-KR', 'en', '韩语'],
  ['fr-FR', 'en', '法语'],
  ['de-DE', 'en', '德语'],
  ['es-ES', 'en', '西班牙语'],
  ['ru-RU', 'en', '俄语'],
  ['ar-SA', 'en', '阿拉伯语'],
  ['hi-IN', 'en', '印地语'],
  
  ['', 'en', '空字符串'],
  [null, 'en', 'null'],
  [undefined, 'en', 'undefined'],
  ['invalid', 'en', '无效语言代码'],
  ['x-custom', 'en', '自定义语言代码'],
  ['123', 'en', '数字'],
  ['zh ', 'zh', '带空格的中文'],
  [' zh', 'zh', '前导空格的中文'],
];

console.log('\n=== 语言检测保底策略测试 ===\n');
console.log('输入'.padEnd(15), '→', '输出'.padEnd(5), '|', '预期'.padEnd(5), '|', '结果', '|', '描述');
console.log('─'.repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach(([input, expected, description]) => {
  const result = normalizeLanguage(input);
  const isPass = result === expected;
  const icon = isPass ? '✅' : '❌';
  
  console.log(
    icon,
    String(input).padEnd(15),
    '→',
    result.padEnd(5),
    '|',
    expected.padEnd(5),
    '|',
    isPass ? '通过' : '失败',
    '|',
    description
  );
  
  if (isPass) passed++;
  else failed++;
});

console.log('─'.repeat(80));
console.log(`\n总计: ${testCases.length} 个测试`);
console.log(`✅ 通过: ${passed} 个`);
console.log(`❌ 失败: ${failed} 个`);

// 验证保底策略
console.log('\n=== 保底策略验证 ===\n');

const conservativeTests = [
  { input: 'zh-CN', expected: 'zh', desc: '明确中文 → 中文' },
  { input: 'en-US', expected: 'en', desc: '明确英文 → 英文' },
  { input: 'ja-JP', expected: 'en', desc: '其他语言 → 英文（保底）' },
  { input: '', expected: 'en', desc: '空值 → 英文（保底）' },
  { input: null, expected: 'en', desc: 'null → 英文（保底）' },
  { input: 'invalid', expected: 'en', desc: '无效值 → 英文（保底）' },
];

let conservativePassed = 0;
conservativeTests.forEach(({ input, expected, desc }) => {
  const result = normalizeLanguage(input);
  const isPass = result === expected;
  console.log(isPass ? '✅' : '❌', desc, ':', result);
  if (isPass) conservativePassed++;
});

console.log(`\n保底策略: ${conservativePassed}/${conservativeTests.length} 通过`);

if (failed === 0 && conservativePassed === conservativeTests.length) {
  console.log('\n✅ 所有测试通过！保底策略正确。\n');
  process.exit(0);
} else {
  console.log('\n❌ 存在失败的测试，请检查代码。\n');
  process.exit(1);
}
