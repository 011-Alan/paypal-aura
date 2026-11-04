import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { GeminiModelRole } from './modelConfig';

export interface GeminiRequestMetrics {
  totalInteractions: number;
  totalGeminiApiCalls: number;
  primaryApiCalls: number;
  lightweightApiCalls: number;
  embeddingApiCalls: number;
  fallbacksTriggered: number;
  initialTurnCalls: number;
  followUpCalls: number;
  followUpCallsAvoided: number;
  cachedResponsesServed: number;
  deduplicatedSubmissions: number;
  queueWaitTimeMsTotal: number;
  avgQueueWaitTimeMs: number;
  rpmLimits: Record<GeminiModelRole, number>;
  activeInFlight: number;
  queueLengths: Record<GeminiModelRole, number>;
  // Backwards compatibility fields
  currentRpmLimit: number;
  currentQueueLength: number;
}

export interface QueuedGeminiTask<T> {
  id: string;
  modelRole: GeminiModelRole;
  userId: string;
  operationName: string;
  enqueuedAt: number;
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export class GeminiRequestManager {
  private rpmLimits: Record<GeminiModelRole, number>;
  private queueTimeoutMs: number;
  private enableCache: boolean;

  // Rate Limiting Sliding Windows per Model
  private requestTimestamps: Record<GeminiModelRole, number[]> = {
    primary: [],
    lightweight: [],
    embedding: [],
  };

  // Dedicated Queues per Model
  private taskQueues: Record<GeminiModelRole, QueuedGeminiTask<any>[]> = {
    primary: [],
    lightweight: [],
    embedding: [],
  };

  private processingQueue: Record<GeminiModelRole, boolean> = {
    primary: false,
    lightweight: false,
    embedding: false,
  };

  // In-flight Deduplication
  private inFlightPromises: Map<string, Promise<any>> = new Map();

  // Safe General Knowledge Cache (Non-personal queries only)
  private cache: Map<string, { result: any; expiresAt: number }> = new Map();
  private maxCacheEntries: number = 100;
  private cacheTtlMs: number = 15 * 60 * 1000; // 15 minutes

  // Multi-Model Observability Metrics
  private totalInteractions: number = 0;
  private primaryApiCalls: number = 0;
  private lightweightApiCalls: number = 0;
  private embeddingApiCalls: number = 0;
  private fallbacksTriggered: number = 0;
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

  constructor(options?: {
    primaryRpm?: number;
    lightweightRpm?: number;
    embeddingRpm?: number;
    queueTimeoutMs?: number;
    enableCache?: boolean;
  }) {
    this.rpmLimits = {
      primary: options?.primaryRpm ?? env.GEMINI_PRIMARY_RPM_LIMIT,
      lightweight: options?.lightweightRpm ?? env.GEMINI_LIGHTWEIGHT_RPM_LIMIT,
      embedding: options?.embeddingRpm ?? env.GEMINI_EMBEDDING_RPM_LIMIT,
    };
    this.queueTimeoutMs = options?.queueTimeoutMs ?? env.GEMINI_QUEUE_TIMEOUT_MS;
    this.enableCache = options?.enableCache ?? env.GEMINI_ENABLE_SAFE_CACHE;
  }

  public setRpmLimitForTesting(roleOrLimit: GeminiModelRole | number, maybeLimit?: number) {
    if (typeof roleOrLimit === 'number') {
      this.rpmLimits.primary = roleOrLimit;
      this.rpmLimits.lightweight = roleOrLimit;
      this.rpmLimits.embedding = roleOrLimit;
    } else if (typeof maybeLimit === 'number') {
      this.rpmLimits[roleOrLimit] = maybeLimit;
    }
  }

  public resetMetrics() {
    this.totalInteractions = 0;
    this.primaryApiCalls = 0;
    this.lightweightApiCalls = 0;
    this.embeddingApiCalls = 0;
    this.fallbacksTriggered = 0;
    this.initialTurnCalls = 0;
    this.followUpCalls = 0;
    this.followUpCallsAvoided = 0;
    this.cachedResponsesServed = 0;
    this.deduplicatedSubmissions = 0;
    this.queueWaitTimeMsTotal = 0;
    this.activeInFlight = 0;
    this.requestTimestamps.primary = [];
    this.requestTimestamps.lightweight = [];
    this.requestTimestamps.embedding = [];
    this.taskQueues.primary = [];
    this.taskQueues.lightweight = [];
    this.taskQueues.embedding = [];
    this.inFlightPromises.clear();
    this.cache.clear();
  }

  public recordInteraction() {
    this.totalInteractions++;
  }

  public recordFallbackTriggered() {
    this.fallbacksTriggered++;
    logger.info('GeminiRequestManager', 'Model fallback triggered from Primary to Lightweight', {
      totalFallbacks: this.fallbacksTriggered,
    });
  }

  public recordFollowUpAvoided() {
    this.followUpCallsAvoided++;
  }

  public getMetrics(): GeminiRequestMetrics {
    const totalCalls = this.primaryApiCalls + this.lightweightApiCalls + this.embeddingApiCalls;
    const avgWait = totalCalls > 0 ? Math.round(this.queueWaitTimeMsTotal / totalCalls) : 0;
    const queueLengths = {
      primary: this.taskQueues.primary.length,
      lightweight: this.taskQueues.lightweight.length,
      embedding: this.taskQueues.embedding.length,
    };
    const totalQueueLength = queueLengths.primary + queueLengths.lightweight + queueLengths.embedding;

    return {
      totalInteractions: this.totalInteractions,
      totalGeminiApiCalls: totalCalls,
      primaryApiCalls: this.primaryApiCalls,
      lightweightApiCalls: this.lightweightApiCalls,
      embeddingApiCalls: this.embeddingApiCalls,
      fallbacksTriggered: this.fallbacksTriggered,
      initialTurnCalls: this.initialTurnCalls,
      followUpCalls: this.followUpCalls,
      followUpCallsAvoided: this.followUpCallsAvoided,
      cachedResponsesServed: this.cachedResponsesServed,
      deduplicatedSubmissions: this.deduplicatedSubmissions,
      queueWaitTimeMsTotal: this.queueWaitTimeMsTotal,
      avgQueueWaitTimeMs: avgWait,
      rpmLimits: { ...this.rpmLimits },
      activeInFlight: this.activeInFlight,
      queueLengths,
      currentRpmLimit: this.rpmLimits.primary,
      currentQueueLength: totalQueueLength,
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
        setTimeout(() => {
          this.inFlightPromises.delete(dedupKey);
        }, 1500);
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
  // 3. MULTI-MODEL QUEUED RATE-LIMITED GEMINI EXECUTION
  // --------------------------------------------------------------------------
  public async scheduleGeminiCall<T>(
    roleOrOp: GeminiModelRole | string,
    opOrReq: string,
    reqOrExec: string | (() => Promise<T>),
    maybeExec?: () => Promise<T>
  ): Promise<T> {
    let modelRole: GeminiModelRole = 'primary';
    let operationName: string;
    let requestId: string;
    let execute: () => Promise<T>;

    if (roleOrOp === 'primary' || roleOrOp === 'lightweight' || roleOrOp === 'embedding') {
      modelRole = roleOrOp;
      operationName = opOrReq;
      requestId = reqOrExec as string;
      execute = maybeExec as () => Promise<T>;
    } else {
      modelRole = 'primary';
      operationName = roleOrOp;
      requestId = opOrReq;
      execute = reqOrExec as () => Promise<T>;
    }

    const taskId = `task-${modelRole}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const enqueuedAt = Date.now();
    const queue = this.taskQueues[modelRole];

    return new Promise<T>((resolve, reject) => {
      // Check maximum queue length per model (reject if severely backlogged)
      if (queue.length >= 30) {
        logger.warn('GeminiRequestManager', `Gemini ${modelRole} request queue full. Rejecting request to protect quota.`, {
          queueLength: queue.length,
          modelRole,
          operationName,
        });
        reject(
          new Error(
            `The AI request queue for ${modelRole} is currently busy to protect rate limits. Please try again in a few moments.`
          )
        );
        return;
      }

      queue.push({
        id: taskId,
        modelRole,
        userId: requestId,
        operationName,
        enqueuedAt,
        execute,
        resolve,
        reject,
      });

      this.processQueue(modelRole);
    });
  }

  private async processQueue(modelRole: GeminiModelRole) {
    if (this.processingQueue[modelRole]) return;
    this.processingQueue[modelRole] = true;

    const queue = this.taskQueues[modelRole];
    const rpmLimit = this.rpmLimits[modelRole];

    try {
      while (queue.length > 0) {
        const now = Date.now();

        // 1. Clean timestamps older than 60 seconds
        this.requestTimestamps[modelRole] = this.requestTimestamps[modelRole].filter((t) => now - t < 60000);

        // 2. Check if we reached the configured RPM limit for this model
        if (this.requestTimestamps[modelRole].length >= rpmLimit) {
          const oldest = this.requestTimestamps[modelRole][0];
          const timeToWaitMs = Math.max(100, 60000 - (now - oldest) + 50);

          logger.info(
            'GeminiRequestManager',
            `Rate limit active for ${modelRole} (${this.requestTimestamps[modelRole].length}/${rpmLimit} RPM). Queueing next request for ${timeToWaitMs}ms.`,
            { queueLength: queue.length, modelRole }
          );

          await new Promise((r) => setTimeout(r, timeToWaitMs));
          continue;
        }

        const task = queue.shift();
        if (!task) break;

        // 3. Check queue timeout
        const waitDurationMs = Date.now() - task.enqueuedAt;
        if (waitDurationMs > this.queueTimeoutMs) {
          logger.warn('GeminiRequestManager', `Task exceeded queue wait timeout for ${modelRole}`, {
            taskId: task.id,
            modelRole,
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

        // 4. Record execution timestamp
        this.requestTimestamps[modelRole].push(Date.now());
        this.queueWaitTimeMsTotal += waitDurationMs;
        this.activeInFlight++;

        // Track model calls
        if (modelRole === 'primary') {
          this.primaryApiCalls++;
          if (task.operationName === 'initial_conversational_turn') {
            this.initialTurnCalls++;
          } else if (task.operationName === 'follow_up_tool_synthesis') {
            this.followUpCalls++;
          }
        } else if (modelRole === 'lightweight') {
          this.lightweightApiCalls++;
        } else if (modelRole === 'embedding') {
          this.embeddingApiCalls++;
        }

        logger.debug('GeminiRequestManager', `Executing queued task for ${modelRole}`, {
          taskId: task.id,
          operationName: task.operationName,
          waitDurationMs,
          currentMinuteCalls: this.requestTimestamps[modelRole].length,
          modelRole,
        });

        // 5. Execute task
        try {
          const result = await task.execute();
          task.resolve(result);
        } catch (execErr: any) {
          task.reject(execErr);
        } finally {
          this.activeInFlight = Math.max(0, this.activeInFlight - 1);
        }
      }
    } finally {
      this.processingQueue[modelRole] = false;
    }
  }
}

export const geminiRequestManager = new GeminiRequestManager();
