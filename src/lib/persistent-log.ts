/**
 * 持久化日志系统 - 用于追踪目录切换时的所有操作
 * 日志保存在 localStorage 中，reload 后仍可查看
 */

const PERSISTENT_LOG_KEY = 'FOCUS_FLOW_PERSISTENT_LOG';

// 日志级别
type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogEntry {
  time: string;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
}

// 添加日志
export function persistentLog(source: string, message: string, level: LogLevel = 'INFO', data?: unknown) {
  const entry: LogEntry = {
    time: new Date().toISOString(),
    level,
    source,
    message,
    data
  };

  try {
    const logs = JSON.parse(localStorage.getItem(PERSISTENT_LOG_KEY) || '[]');
    logs.push(entry);
    // 只保留最近 200 条日志
    const trimmed = logs.slice(-200);
    localStorage.setItem(PERSISTENT_LOG_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // 忽略错误
  }

  // 同时输出到控制台方便调试
  const prefix = `[${entry.time.slice(11, 19)}] [${level}] [${source}]`;
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

// 获取所有日志
export function getPersistentLogs(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(PERSISTENT_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

// 清空日志
export function clearPersistentLogs() {
  localStorage.removeItem(PERSISTENT_LOG_KEY);
}

// 打印日志摘要（供控制台调用）
export function printPersistentLogs() {
  const logs = getPersistentLogs();
  if (logs.length === 0) {
    console.log('========== 持久化日志（无日志） ==========');
    return;
  }

  console.log('========== 持久化日志 ==========');
  logs.forEach((log, i) => {
    const dataStr = log.data ? ' ' + JSON.stringify(log.data).slice(0, 100) : '';
    console.log(`[${i + 1}] ${log.time.slice(11, 19)} [${log.level}] [${log.source}] ${log.message}${dataStr}`);
  });
  console.log('=========================================');
  console.log(`总计 ${logs.length} 条日志`);
}

// 导出到 window 供控制台调用
if (typeof window !== 'undefined') {
  (window as unknown as {
    printPersistentLogs: typeof printPersistentLogs;
    getPersistentLogs: typeof getPersistentLogs;
    clearPersistentLogs: typeof clearPersistentLogs;
  }).printPersistentLogs = printPersistentLogs;
  (window as unknown as { getPersistentLogs: typeof getPersistentLogs }).getPersistentLogs = getPersistentLogs;
  (window as unknown as { clearPersistentLogs: typeof clearPersistentLogs }).clearPersistentLogs = clearPersistentLogs;
}
