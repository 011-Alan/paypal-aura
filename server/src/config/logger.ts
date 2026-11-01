export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  meta?: Record<string, unknown>;
}

const recentLogs: LogEntry[] = [];
const MAX_RECENT_LOGS = 250;

function formatLog(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(meta ? { meta } : {}),
  };
  recentLogs.unshift(entry);
  if (recentLogs.length > MAX_RECENT_LOGS) {
    recentLogs.pop();
  }

  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  const line = `[${entry.timestamp}] [${level.toUpperCase()}] [${component}] ${message}${metaStr}`;
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (component: string, message: string, meta?: Record<string, unknown>) =>
    formatLog('info', component, message, meta),
  warn: (component: string, message: string, meta?: Record<string, unknown>) =>
    formatLog('warn', component, message, meta),
  error: (component: string, message: string, meta?: Record<string, unknown>) =>
    formatLog('error', component, message, meta),
  debug: (component: string, message: string, meta?: Record<string, unknown>) =>
    formatLog('debug', component, message, meta),
  getRecentLogs: (limit = 50): LogEntry[] => recentLogs.slice(0, limit),
};
