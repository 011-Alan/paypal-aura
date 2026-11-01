import { Client } from '@elastic/elasticsearch';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  TransactionModel,
  FinancialPlanModel,
  AuditLogModel,
  ITransaction,
  IFinancialPlan,
} from '../../models';

/**
 * Sponsor 6: Elastic — Financial Memory and Intelligent Retrieval
 *
 * Role: Provides natural-language transaction search, historical spending retrieval,
 * financial plan & recommendation search, audit record search (with strict user ownership
 * and family privacy boundaries), and semantic/hybrid context retrieval for AI conversations.
 *
 * Architectural Rule: MongoDB remains the authoritative source of truth. Every record retrieved
 * from Elasticsearch is validated against MongoDB before balances or totals are calculated.
 */
export interface ElasticSyncQueueItem {
  id: string;
  indexName: string;
  docId: string;
  payload: Record<string, any>;
  attempts: number;
  lastError?: string;
  queuedAt: string;
}

export class ElasticFinancialMemoryService {
  private client: Client | null = null;
  private isClusterReachable = false;
  private lastHealthCheckAt: Date | null = null;
  private syncRetryQueue: ElasticSyncQueueItem[] = [];
  private totalDocumentsSynced = 0;

  constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      const auth = env.ELASTICSEARCH_API_KEY
        ? { apiKey: env.ELASTICSEARCH_API_KEY }
        : env.ELASTICSEARCH_USERNAME && env.ELASTICSEARCH_PASSWORD
        ? { username: env.ELASTICSEARCH_USERNAME, password: env.ELASTICSEARCH_PASSWORD }
        : undefined;

      this.client = new Client({
        node: env.ELASTICSEARCH_URL,
        ...(auth ? { auth } : {}),
        maxRetries: 0,
        requestTimeout: 800,
      });
    } catch (err: any) {
      logger.warn('ElasticIntegration', 'Could not initialize Elasticsearch client', { error: err?.message });
      this.client = null;
    }
  }

  async checkClusterConnectivity(force = false): Promise<boolean> {
    if (!this.client) return false;
    if (!force && this.lastHealthCheckAt && Date.now() - this.lastHealthCheckAt.getTime() < 60000) {
      return this.isClusterReachable;
    }
    try {
      await this.client.ping({}, { requestTimeout: 600 });
      this.isClusterReachable = true;
      this.lastHealthCheckAt = new Date();
      return true;
    } catch {
      this.isClusterReachable = false;
      this.lastHealthCheckAt = new Date();
      return false;
    }
  }

  async getHealthStatus() {
    const reachable = await this.checkClusterConnectivity();
    return {
      technology: 'Elastic (Elasticsearch)',
      intendedResponsibility: 'Financial memory, natural-language transaction search, hybrid retrieval & MongoDB sync',
      status: reachable ? 'connected_cluster' : 'degraded_mongodb_hybrid_fallback',
      clusterReachable: reachable,
      nodeUrl: env.ELASTICSEARCH_URL,
      indexPrefix: env.ELASTICSEARCH_INDEX_PREFIX,
      totalDocumentsSynced: this.totalDocumentsSynced,
      pendingRetryQueueSize: this.syncRetryQueue.length,
      lastHealthCheckAt: this.lastHealthCheckAt?.toISOString() || null,
      authoritativeTruthStore: 'MongoDB (Verified before analytics calculation)',
    };
  }

  /**
   * Idempotently indexes or updates a Transaction document in Elasticsearch,
   * with retry queueing and sync status updates in MongoDB.
   */
  async syncTransaction(tx: ITransaction): Promise<boolean> {
    const indexName = `${env.ELASTICSEARCH_INDEX_PREFIX}_transactions`;
    const docId = String(tx._id);
    const payload = {
      userId: String(tx.userId),
      accountId: String(tx.accountId),
      accountName: tx.accountName,
      date: tx.date.toISOString(),
      merchant: tx.merchant,
      description: tx.description,
      category: tx.category,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      paymentMethod: tx.paymentMethod,
      isRecurring: tx.isRecurring,
      isUnusual: tx.isUnusual,
      unusualReason: tx.unusualReason || '',
      isSharedFamilyTransaction: tx.isSharedFamilyTransaction,
      tags: tx.tags || [],
      semanticText: `${tx.merchant} ${tx.description} ${tx.category} ${tx.paymentMethod} ${tx.tags?.join(' ') || ''}`,
    };

    const reachable = await this.checkClusterConnectivity();
    if (reachable && this.client) {
      try {
        await this.client.index({
          index: indexName,
          id: docId,
          document: payload,
          refresh: true,
        });
        await TransactionModel.updateOne(
          { _id: tx._id },
          { $set: { elasticSynced: true, elasticSyncedAt: new Date() } }
        );
        this.totalDocumentsSynced += 1;
        return true;
      } catch (err: any) {
        this.enqueueRetry(indexName, docId, payload, err?.message);
        return false;
      }
    } else {
      // Mark synced to local hybrid memory index & queue for cluster sync when online
      this.enqueueRetry(indexName, docId, payload, 'Elasticsearch cluster offline; queued for background sync');
      return false;
    }
  }

  /**
   * Idempotently indexes or updates a FinancialPlan document in Elasticsearch.
   */
  async syncFinancialPlan(plan: IFinancialPlan): Promise<boolean> {
    const indexName = `${env.ELASTICSEARCH_INDEX_PREFIX}_plans`;
    const docId = String(plan._id);
    const payload = {
      userId: String(plan.userId),
      month: plan.month,
      title: plan.title,
      totalIncome: plan.totalIncome,
      totalCommitments: plan.totalCommitments,
      totalDiscretionaryBudget: plan.totalDiscretionaryBudget,
      totalSavingsTarget: plan.totalSavingsTarget,
      aiSummary: plan.aiSummary,
      recoveryRecommendations: plan.recoveryRecommendations,
      updatedAt: new Date().toISOString(),
    };

    const reachable = await this.checkClusterConnectivity();
    if (reachable && this.client) {
      try {
        await this.client.index({
          index: indexName,
          id: docId,
          document: payload,
          refresh: true,
        });
        await FinancialPlanModel.updateOne({ _id: plan._id }, { $set: { elasticSynced: true } });
        this.totalDocumentsSynced += 1;
        return true;
      } catch (err: any) {
        this.enqueueRetry(indexName, docId, payload, err?.message);
        return false;
      }
    } else {
      this.enqueueRetry(indexName, docId, payload, 'Elasticsearch cluster offline');
      return false;
    }
  }

  private enqueueRetry(indexName: string, docId: string, payload: Record<string, any>, errorMsg?: string) {
    const existingIdx = this.syncRetryQueue.findIndex((i) => i.indexName === indexName && i.docId === docId);
    if (existingIdx >= 0) {
      this.syncRetryQueue[existingIdx].payload = payload;
      this.syncRetryQueue[existingIdx].attempts += 1;
      this.syncRetryQueue[existingIdx].lastError = errorMsg;
    } else {
      this.syncRetryQueue.push({
        id: `${indexName}:${docId}`,
        indexName,
        docId,
        payload,
        attempts: 1,
        lastError: errorMsg,
        queuedAt: new Date().toISOString(),
      });
      if (this.syncRetryQueue.length > 200) {
        this.syncRetryQueue.shift();
      }
    }
  }

  /**
   * Background retry worker method to flush queued documents when Elasticsearch is reachable.
   */
  async processRetryQueue(): Promise<{ processed: number; remaining: number }> {
    const reachable = await this.checkClusterConnectivity();
    if (!reachable || !this.client || this.syncRetryQueue.length === 0) {
      return { processed: 0, remaining: this.syncRetryQueue.length };
    }

    let processed = 0;
    const remainingItems: ElasticSyncQueueItem[] = [];

    for (const item of this.syncRetryQueue) {
      try {
        await this.client.index({
          index: item.indexName,
          id: item.docId,
          document: item.payload,
        });
        processed += 1;
        this.totalDocumentsSynced += 1;
      } catch (err: any) {
        if (item.attempts < 5) {
          remainingItems.push({ ...item, attempts: item.attempts + 1, lastError: err?.message });
        }
      }
    }
    this.syncRetryQueue = remainingItems;
    return { processed, remaining: this.syncRetryQueue.length };
  }

  /**
   * Searches authorised user financial memory (transactions, plans, recommendations, audit logs)
   * using natural language and semantic keyword expansion, then validates all transaction records
   * against MongoDB before returning totals.
   *
   * Privacy Invariant: Strictly scopes queries to `userId` so another family member's private
   * financial records are NEVER exposed.
   */
  async searchFinancialMemory(params: {
    userId: string;
    query: string;
    scope?: 'all' | 'transactions' | 'plans' | 'audit';
    limit?: number;
  }) {
    const userObjId = new mongoose.Types.ObjectId(params.userId);
    const limit = params.limit || 25;
    const rawQuery = (params.query || '').trim();
    const lowerQ = rawQuery.toLowerCase();

    // Semantic expansion for natural-language financial queries (e.g. "holiday", "vacation", "trip" -> Travel)
    const expandedKeywords = new Set<string>(
      lowerQ
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !['how', 'much', 'did', 'spend', 'during', 'last', 'the', 'show', 'find', 'what', 'was', 'for'].includes(w))
    );

    if (lowerQ.includes('holiday') || lowerQ.includes('vacation') || lowerQ.includes('trip') || lowerQ.includes('flight') || lowerQ.includes('hotel')) {
      expandedKeywords.add('travel');
      expandedKeywords.add('holiday');
      expandedKeywords.add('trip');
      expandedKeywords.add('goa');
      expandedKeywords.add('flight');
      expandedKeywords.add('hotel');
    }
    if (lowerQ.includes('dining') || lowerQ.includes('restaurant') || lowerQ.includes('food') || lowerQ.includes('dinner')) {
      expandedKeywords.add('dining');
      expandedKeywords.add('restaurant');
      expandedKeywords.add('swiggy');
      expandedKeywords.add('zomato');
    }
    if (lowerQ.includes('laptop') || lowerQ.includes('electronics') || lowerQ.includes('gadget')) {
      expandedKeywords.add('electronics');
      expandedKeywords.add('shopping');
    }

    const keywordsArray = Array.from(expandedKeywords);
    let elasticHitIds: string[] = [];
    let usedElasticCluster = false;

    const reachable = await this.checkClusterConnectivity();
    if (reachable && this.client && rawQuery) {
      try {
        const esResp = await this.client.search({
          index: `${env.ELASTICSEARCH_INDEX_PREFIX}_transactions`,
          size: limit,
          query: {
            bool: {
              must: [{ term: { userId: params.userId } }],
              should: [
                {
                  multi_match: {
                    query: keywordsArray.join(' ') || rawQuery,
                    fields: ['merchant^3', 'category^3', 'description^2', 'tags^2', 'semanticText'],
                    fuzziness: 'AUTO',
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        });
        elasticHitIds = esResp.hits.hits.map((h) => String(h._id));
        usedElasticCluster = true;
      } catch (err: any) {
        logger.warn('ElasticIntegration', 'Elasticsearch query failed; validating directly against MongoDB', {
          error: err?.message,
        });
      }
    }

    // Authoritative validation & retrieval from MongoDB (scoped strictly to userId)
    let matchedTransactions: ITransaction[] = [];
    if (elasticHitIds.length > 0) {
      matchedTransactions = await TransactionModel.find({
        _id: { $in: elasticHitIds },
        userId: userObjId,
      }).sort({ date: -1 });
    } else {
      // Hybrid semantic + regex search on MongoDB strictly scoped to userId
      if (keywordsArray.length > 0) {
        const regexes = keywordsArray.map((k) => new RegExp(k, 'i'));
        matchedTransactions = await TransactionModel.find({
          userId: userObjId,
          $or: [
            { category: { $in: regexes } },
            { merchant: { $in: regexes } },
            { description: { $in: regexes } },
            { tags: { $in: regexes } },
          ],
        })
          .sort({ date: -1 })
          .limit(limit);
      } else {
        matchedTransactions = await TransactionModel.find({ userId: userObjId })
          .sort({ date: -1 })
          .limit(limit);
      }
    }

    // Search financial plans & previous recovery recommendations (scoped to userId)
    const matchedPlans =
      params.scope === 'transactions'
        ? []
        : await FinancialPlanModel.find({ userId: userObjId }).sort({ createdAt: -1 }).limit(5);

    // Search authorised audit logs (scoped to userId)
    const matchedAuditLogs =
      params.scope === 'transactions'
        ? []
        : await AuditLogModel.find({ userId: userObjId }).sort({ createdAt: -1 }).limit(10);

    // Calculate verified totals from MongoDB authoritative records
    const verifiedTotalExpense = matchedTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const verifiedTotalIncome = matchedTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      query: rawQuery,
      expandedSemanticTerms: keywordsArray,
      engineMode: usedElasticCluster ? 'elasticsearch_cluster_verified_with_mongodb' : 'hybrid_semantic_mongodb_verified',
      validatedAgainstMongoDB: true,
      privacyScope: 'strict_user_ownership_enforced',
      summary: {
        matchedTransactionCount: matchedTransactions.length,
        verifiedTotalExpense: Math.round(verifiedTotalExpense * 100) / 100,
        verifiedTotalIncome: Math.round(verifiedTotalIncome * 100) / 100,
      },
      transactions: matchedTransactions,
      plans: matchedPlans,
      auditLogs: matchedAuditLogs,
    };
  }
}

export const elasticIntegration = new ElasticFinancialMemoryService();
