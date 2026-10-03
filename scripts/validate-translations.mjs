#!/usr/bin/env node
/**
 * 翻译文件完整性验证脚本
 * 对比 en.json 和 zh.json 的 key 是否一致
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取翻译文件
const enPath = join(__dirname, '../src/locales/en.json');
const zhPath = join(__dirname, '../src/locales/zh.json');

const en = JSON.parse(readFileSync(enPath, 'utf-8'));
const zh = JSON.parse(readFileSync(zhPath, 'utf-8'));

// 递归获取所有 key（扁平化）
function flattenKeys(obj, prefix = '') {
  const keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  
  return keys;
}

// 获取所有 key
const enKeys = flattenKeys(en).sort();
const zhKeys = flattenKeys(zh).sort();

// 统计
console.log('\n=== 翻译文件统计 ===');
console.log(`英文 keys: ${enKeys.length}`);
console.log(`中文 keys: ${zhKeys.length}`);

// 找出差异
const missingInZh = enKeys.filter(k => !zhKeys.includes(k));
const missingInEn = zhKeys.filter(k => !enKeys.includes(k));

console.log('\n=== 差异分析 ===');
console.log(`英文有但中文没有: ${missingInZh.length} 个`);
console.log(`中文有但英文没有: ${missingInEn.length} 个`);

// 详细列表
if (missingInZh.length > 0) {
  console.log('\n❌ 中文缺失的 keys:');
  missingInZh.forEach(k => console.log(`  - ${k}`));
}

if (missingInEn.length > 0) {
  console.log('\n❌ 英文缺失的 keys:');
  missingInEn.forEach(k => console.log(`  - ${k}`));
}

// 检查顶层结构
console.log('\n=== 顶层结构对比 ===');
const enTopLevel = Object.keys(en).sort();
const zhTopLevel = Object.keys(zh).sort();
console.log('英文顶层 keys:', enTopLevel.join(', '));
console.log('中文顶层 keys:', zhTopLevel.join(', '));

// 检查是否有顶层 key 差异
const topLevelDiff = enTopLevel.filter(k => !zhTopLevel.includes(k))
  .concat(zhTopLevel.filter(k => !enTopLevel.includes(k)));

if (topLevelDiff.length > 0) {
  console.log('\n⚠️ 顶层 key 差异:', topLevelDiff.join(', '));
}

// 总结
console.log('\n=== 验证结果 ===');
if (missingInZh.length === 0 && missingInEn.length === 0 && topLevelDiff.length === 0) {
  console.log('✅ 翻译文件完整！所有 keys 一致。');
  process.exit(0);
} else {
  console.log('❌ 翻译文件不完整，存在差异。');
  console.log(`\n总计差异: ${missingInZh.length + missingInEn.length + topLevelDiff.length} 处`);
  process.exit(1);
}
