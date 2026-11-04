import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface GeminiRequestMetrics {
  totalInteractions: number;
  totalGeminiApiCalls: number;
  initialTurnCalls: number;
  followUpCalls: number;
  followUpCallsAvoided: number;
  cachedResponsesServed: number;
  deduplicatedSubmissions: number;
  queueWaitTimeMsTotal: number;
  avgQueueWaitTimeMs: number;
  currentRpmLimit: number;
  activeInFlight: number;
  currentQueueLength: number;
}

export interface QueuedGeminiTask<T> {
  id: string;
  userId: string;
  operationName: string;
  enqueuedAt: number;
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class GeminiRequestManager {
  private rpmLimit: number;
  private queueTimeoutMs: number;
  private enableCache: boolean;

  // Rate Limiting Sliding Window
  private requestTimestamps: number[] = [];
  private taskQueue: QueuedGeminiTask<any>[] = [];
  private processingQueue: boolean = false;

  // In-flight Deduplication
  private inFlightPromises: Map<string, Promise<any>> = new Map();

  // Safe General Knowledge Cache (Non-personal queries only)
  private cache: Map<string, { result: any; expiresAt: number }> = new Map();
  private maxCacheEntries: number = 100;
  private cacheTtlMs: number = 15 * 60 * 1000; // 15 minutes

  // Metrics
  private totalInteractions: number = 0;
  private totalGeminiApiCalls: number = 0;
  private initialTurnCalls: number = 0;
  private followUpCalls: number = 0;
  private followUpCallsAvoided: number = 0;
  private cachedResponsesServed: number = 0;
  private deduplicatedSubmissions: number = 0;
  private queueWaitTimeMsTotal: number = 0;
  private activeInFlight: number = 0;

  // Personal keywords that must NEVER be cached
  private static readonly PERSONAL_KEYWORDS = new Set([
    'balance',
    'account',
    'my',
    'me',
    'pay',
    'payment',
    'transfer',
    'spend',
    'spent',
    'spending',
    'save',
    'saving',
    'savings',
    'goal',
    'goals',
    'mandate',
    'subscription',
    'bill',
    'bills',
    'rent',
    'salary',
    'income',
    'family',
    'setting',
    'settings',
    'currency',
    'calendar',
    'schedule',
    'reminder',
    'remind',
  ]);

  constructor(options?: { rpmLimit?: number; queueTimeoutMs?: number; enableCache?: boolean }) {
    this.rpmLimit = options?.rpmLimit ?? env.GEMINI_RPM_LIMIT;
    this.queueTimeoutMs = options?.queueTimeoutMs ?? env.GEMINI_QUEUE_TIMEOUT_MS;
    this.enableCache = options?.enableCache ?? env.GEMINI_ENABLE_SAFE_CACHE;
  }

  public setRpmLimitForTesting(limit: number) {
    this.rpmLimit = limit;
  }

  public resetMetrics() {
    this.totalInteractions = 0;
    this.totalGeminiApiCalls = 0;
    this.initialTurnCalls = 0;
    this.followUpCalls = 0;
    this.followUpCallsAvoided = 0;
    this.cachedResponsesServed = 0;
    this.deduplicatedSubmissions = 0;
    this.queueWaitTimeMsTotal = 0;
    this.activeInFlight = 0;
    this.requestTimestamps = [];
    this.inFlightPromises.clear();
    this.cache.clear();
  }

  public recordInteraction() {
    this.totalInteractions++;
  }

  public recordFollowUpAvoided() {
    this.followUpCallsAvoided++;
  }

  public getMetrics(): GeminiRequestMetrics {
    const totalQueuedWaiters = this.taskQueue.length;
    const completedCalls = this.totalGeminiApiCalls;
    const avgWait = completedCalls > 0 ? Math.round(this.queueWaitTimeMsTotal / completedCalls) : 0;

    return {
      totalInteractions: this.totalInteractions,
      totalGeminiApiCalls: this.totalGeminiApiCalls,
      initialTurnCalls: this.initialTurnCalls,
      followUpCalls: this.followUpCalls,
      followUpCallsAvoided: this.followUpCallsAvoided,
      cachedResponsesServed: this.cachedResponsesServed,
      deduplicatedSubmissions: this.deduplicatedSubmissions,
      queueWaitTimeMsTotal: this.queueWaitTimeMsTotal,
      avgQueueWaitTimeMs: avgWait,
      currentRpmLimit: this.rpmLimit,
      activeInFlight: this.activeInFlight,
      currentQueueLength: totalQueuedWaiters,
    };
  }

  // --------------------------------------------------------------------------
  // 1. IN-FLIGHT DEDUPLICATION
  // --------------------------------------------------------------------------
  public async executeWithDeduplication<T>(
    userId: string,
    prompt: string,
    executor: () => Promise<T>
  ): Promise<T> {
    const normPrompt = prompt.trim().toLowerCase();
    const dedupKey = `${userId}:${normPrompt}`;

    const existingPromise = this.inFlightPromises.get(dedupKey);
    if (existingPromise) {
      this.deduplicatedSubmissions++;
      logger.info('GeminiRequestManager', 'Duplicate in-flight submission detected. Sharing in-flight response.', {
        userId,
        prompt: prompt.slice(0, 50),
      });
      return existingPromise as Promise<T>;
    }

    const taskPromise = (async () => {
      try {
        return await executor();
      } finally {
        // Keep in dedup map for a brief window (2s) to prevent immediate double-tap
        setTimeout(() => {
          this.inFlightPromises.delete(dedupKey);
        }, 2000);
      }
    })();

    this.inFlightPromises.set(dedupKey, taskPromise);
    return taskPromise;
  }

  // --------------------------------------------------------------------------
  // 2. SAFE GENERAL-KNOWLEDGE CACHE
  // --------------------------------------------------------------------------
  public getCachedResponse(prompt: string): any | null {
    if (!this.enableCache) return null;
    if (this.isPersonalOrFinancialPrompt(prompt)) return null;

    const cacheKey = prompt.trim().toLowerCase();
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }

    this.cachedResponsesServed++;
    logger.info('GeminiRequestManager', 'Serving response from safe general-knowledge cache (0 tokens)', {
      prompt: prompt.slice(0, 50),
    });
    return entry.result;
  }

  public setCachedResponse(prompt: string, result: any): void {
    if (!this.enableCache) return;
    if (this.isPersonalOrFinancialPrompt(prompt)) return;
    if (!result || !result.success || result.workflowType !== 'general_knowledge') return;

    // Prune if full
    if (this.cache.size >= this.maxCacheEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const cacheKey = prompt.trim().toLowerCase();
    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private isPersonalOrFinancialPrompt(prompt: string): boolean {
    const words = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    for (const w of words) {
      if (GeminiRequestManager.PERSONAL_KEYWORDS.has(w)) {
        return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // 3. QUEUED RATE-LIMITED GEMINI EXECUTION
  // --------------------------------------------------------------------------
  public async scheduleGeminiCall<T>(
    operationName: string,
    userId: string,
    execute: () => Promise<T>
  ): Promise<T> {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const enqueuedAt = Date.now();

    return new Promise<T>((resolve, reject) => {
      // Check maximum queue length (reject if severely backlogged)
      if (this.taskQueue.length >= 25) {
        logger.warn('GeminiRequestManager', 'Gemini request queue full. Rejecting request to protect quota.', {
          queueLength: this.taskQueue.length,
          operationName,
        });
        reject(
          new Error(
            'The AI request queue is currently busy to respect free-tier rate limits. Please try again in a few moments.'
          )
        );
        return;
      }

      this.taskQueue.push({
        id: taskId,
        userId,
        operationName,
        enqueuedAt,
        execute,
        resolve,
        reject,
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    try {
      while (this.taskQueue.length > 0) {
        const now = Date.now();

        // 1. Clean timestamps older than 60 seconds
        this.requestTimestamps = this.requestTimestamps.filter((t) => now - t < 60000);

        // 2. Check if we reached the configured RPM limit
        if (this.requestTimestamps.length >= this.rpmLimit) {
          const oldest = this.requestTimestamps[0];
          const timeToWaitMs = Math.max(100, 60000 - (now - oldest) + 50); // slight buffer

          logger.info(
            'GeminiRequestManager',
            `Rate limit active (${this.requestTimestamps.length}/${this.rpmLimit} RPM). Queueing next request for ${timeToWaitMs}ms.`,
            { queueLength: this.taskQueue.length }
          );

          await new Promise((r) => setTimeout(r, timeToWaitMs));
          continue;
        }

        const task = this.taskQueue.shift();
        if (!task) break;

        // 3. Check queue timeout
        const waitDurationMs = Date.now() - task.enqueuedAt;
        if (waitDurationMs > this.queueTimeoutMs) {
          logger.warn('GeminiRequestManager', 'Task exceeded queue wait timeout', {
            taskId: task.id,
            waitDurationMs,
            timeoutMs: this.queueTimeoutMs,
          });
          task.reject(
            new Error(
              'Your request waited in the AI processing queue for too long. Your data is safe. Please retry now.'
            )
          );
          continue;
        }

        // 4. Record timestamp and track wait time
        this.requestTimestamps.push(Date.now());
        this.queueWaitTimeMsTotal += waitDurationMs;
        this.totalGeminiApiCalls++;

        if (task.operationName.includes('initial')) {
          this.initialTurnCalls++;
        } else if (task.operationName.includes('follow_up')) {
          this.followUpCalls++;
        }

        this.activeInFlight++;

        // Execute task asynchronously so queue processor isn't blocked on the API latency
        (async () => {
          try {
            const result = await task.execute();
            task.resolve(result);
          } catch (err) {
            task.reject(err);
          } finally {
            this.activeInFlight--;
          }
        })();

        // Provide minor spacing (250ms) between dispatched requests to prevent network stampedes
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      this.processingQueue = false;
    }
  }
}

export const geminiRequestManager = new GeminiRequestManager();
