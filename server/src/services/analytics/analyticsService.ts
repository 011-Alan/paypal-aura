import { spawn } from 'child_process';
import path from 'path';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export class PythonAnalyticsService {
  private readonly scriptPath = path.resolve(process.cwd(), 'python/analytics_engine.py');
  private cache = new Map<string, { timestamp: number; data: any }>();

  /**
   * Invokes the Python (Pandas + NumPy + Scikit-Learn) analytics engine over stdin/stdout JSON pipe.
   */
  async runPythonTask(payload: Record<string, any>): Promise<any> {
    const txs = Array.isArray(payload.transactions) ? payload.transactions : [];
    const cacheKey = `${payload.task || 'analyze'}:${payload.monthlyIncome || 0}:${txs.length}:${txs[0]?._id || ''}:${txs[0]?.amount || ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdoutData = '';
      let stderrData = '';

      try {
        const child = spawn(env.PYTHON_EXECUTABLE, [this.scriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const timeout = setTimeout(() => {
          child.kill();
          logger.warn('PythonAnalytics', 'Python analytics process timed out; using deterministic fallback');
          const fallback = this.fallbackCompute(payload);
          this.cache.set(cacheKey, { timestamp: Date.now(), data: fallback });
          resolve(fallback);
        }, 1500);

        child.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
          stderrData += chunk.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timeout);
          logger.warn('PythonAnalytics', 'Failed to spawn Python process; using deterministic fallback', {
            error: err.message,
          });
          resolve(this.fallbackCompute(payload));
        });

        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0 && stdoutData.trim()) {
            try {
              const parsed = JSON.parse(stdoutData.trim());
              if (!parsed.error) {
                logger.info('PythonAnalytics', `Completed Python task "${payload.task}" in ${Date.now() - startTime}ms`);
                this.cache.set(cacheKey, { timestamp: Date.now(), data: parsed });
                resolve(parsed);
                return;
              }
            } catch (parseErr: any) {
              logger.warn('PythonAnalytics', 'Failed to parse Python JSON output', { error: parseErr?.message });
            }
          } else if (stderrData) {
            logger.warn('PythonAnalytics', 'Python stderr warning', { stderr: stderrData.slice(0, 300) });
          }
          resolve(this.fallbackCompute(payload));
        });

        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
      } catch (err: any) {
        logger.warn('PythonAnalytics', 'Exception invoking Python process', { error: err?.message });
        resolve(this.fallbackCompute(payload));
      }
    });
  }

  private fallbackCompute(payload: Record<string, any>): any {
    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    const monthlyIncome = Number(payload.monthlyIncome || 95000);

    if (payload.task === 'calculate_plan') {
      const mandates = Array.isArray(payload.mandates) ? payload.mandates : [];
      const totalCommitments = mandates
        .filter((m: any) => m.category !== 'Salary')
        .reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
      const totalSavingsTarget = Math.round(monthlyIncome * 0.2);
      const remaining = Math.max(0, monthlyIncome - totalCommitments - totalSavingsTarget);
      return {
        engine: 'typescript-fallback',
        totalIncome: monthlyIncome,
        totalCommitments,
        totalEssentialBudget: Math.round(remaining * 0.55),
        totalDiscretionaryBudget: Math.round(remaining * 0.45),
        totalSavingsTarget,
        unallocatedBuffer: 0,
        allocations: [],
        recoveryRecommendations: [],
      };
    }

    const income =
      transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount || 0), 0) ||
      monthlyIncome;
    const expense = transactions
      .filter((t: any) => t.type === 'expense')
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);

    return {
      engine: 'typescript-fallback',
      totalIncome: income,
      totalExpense: expense,
      netCashflow: income - expense,
      savingsRatePercent: income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0,
      categoryBreakdown: [],
      monthlyTrends: [],
      unusualTransactions: transactions.filter((t: any) => t.isUnusual),
      forecastNextMonthExpense: expense,
      forecastConfidence: 0.8,
    };
  }
}

export const pythonAnalyticsService = new PythonAnalyticsService();
