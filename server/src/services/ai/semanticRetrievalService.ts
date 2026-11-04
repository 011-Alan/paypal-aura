import crypto from 'crypto';
import mongoose from 'mongoose';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { SemanticEmbeddingModel, ISemanticEmbedding } from '../../models';
import { geminiRequestManager } from '../planning/geminiRequestManager';
import { GEMINI_MODEL_REGISTRY } from '../planning/modelConfig';

export interface SemanticSearchResult {
  sourceId: string;
  sourceType: string;
  text: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Calculates cosine similarity between two numerical vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const len = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Generates a deterministic normalized embedding vector using feature hashing (word token hashing trick).
 * Produces genuine semantic proximity for texts sharing words when running offline.
 */
function generateDeterministicVector(text: string, dimensions = 64): number[] {
  const vector = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (words.length === 0) return vector;

  for (const word of words) {
    const hash = crypto.createHash('md5').update(word).digest();
    const idx = hash.readUInt16BE(0) % dimensions;
    const sign = hash[2] % 2 === 0 ? 1 : -1;
    vector[idx] += sign;
  }

  let sumSq = 0;
  for (let i = 0; i < dimensions; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1;
  return vector.map((v) => v / norm);
}

export class SemanticRetrievalService {
  private geminiClient: any = null;

  public setGeminiClient(client: any) {
    this.geminiClient = client;
  }

  /**
   * Generates vector embeddings for a given text snippet.
   * Utilizes sha256 hash checking to avoid generating embeddings repeatedly for unchanged content.
   */
  public async getEmbedding(text: string, clientOverride?: any): Promise<number[]> {
    const cleanText = text.trim();
    if (!cleanText) return [];

    const client = clientOverride || this.geminiClient;

    // Check if an existing embedding already exists for this exact text hash across cached embeddings
    const textHash = crypto.createHash('sha256').update(cleanText).digest('hex');
    const existing = await SemanticEmbeddingModel.findOne({ textHash }).lean();
    if (existing && existing.embedding && existing.embedding.length > 0) {
      logger.debug('SemanticRetrievalService', 'Reusing existing vector embedding from text hash', {
        textHash: textHash.slice(0, 10),
      });
      return existing.embedding;
    }

    // If client is unconfigured or mock client doesn't support embedContent, use deterministic offline vector
    if (!client || typeof client.models?.embedContent !== 'function') {
      return generateDeterministicVector(cleanText);
    }

    // Schedule API call through central rate limiter
    return geminiRequestManager.scheduleGeminiCall(
      'embedding',
      'generate_embedding',
      `embed-${Date.now()}`,
      async () => {
        try {
          const res = await client.models.embedContent({
            model: GEMINI_MODEL_REGISTRY.embedding.modelId,
            contents: cleanText,
          });

          const values = res.embedding?.values || res.embedding;
          if (Array.isArray(values) && values.length > 0) {
            return values;
          }
          return generateDeterministicVector(cleanText);
        } catch (err: any) {
          logger.warn('SemanticRetrievalService', 'Embedding API generation failed; falling back to deterministic vector', {
            error: err?.message,
          });
          return generateDeterministicVector(cleanText);
        }
      }
    );
  }

  /**
   * Indexes a message, document or transaction summary for a user.
   * Strictly enforces multi-user isolation by indexing with the user's ObjectId.
   */
  public async indexContent(params: {
    userId: string;
    sourceType: 'chat_message' | 'transaction' | 'document' | 'financial_note';
    sourceId: string;
    text: string;
    metadata?: Record<string, any>;
    clientOverride?: any;
  }): Promise<ISemanticEmbedding | null> {
    const { userId, sourceType, sourceId, text, metadata, clientOverride } = params;
    if (!userId || !text) return null;

    const cleanText = text.trim();
    const textHash = crypto.createHash('sha256').update(cleanText).digest('hex');

    // Avoid regenerating embedding if already indexed for this user and sourceId with matching hash
    const existing = await SemanticEmbeddingModel.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      sourceType,
      sourceId,
    });

    if (existing && existing.textHash === textHash) {
      logger.debug('SemanticRetrievalService', 'Content unchanged; skipping re-embedding', {
        sourceId,
        sourceType,
      });
      return existing;
    }

    const embedding = await this.getEmbedding(cleanText, clientOverride);
    if (!embedding || embedding.length === 0) return null;

    const record = await SemanticEmbeddingModel.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        sourceType,
        sourceId,
      },
      {
        userId: new mongoose.Types.ObjectId(userId),
        sourceType,
        sourceId,
        textHash,
        text: cleanText,
        embedding,
        metadata: metadata || {},
      },
      { upsert: true, new: true }
    );

    return record;
  }

  /**
   * Performs semantic vector search strictly within the authenticated user's records.
   * Multi-user isolation is guaranteed: query only filters by the requested userId.
   */
  public async semanticSearch(params: {
    userId: string;
    query: string;
    sourceType?: 'chat_message' | 'transaction' | 'document' | 'financial_note';
    limit?: number;
    minScore?: number;
    clientOverride?: any;
  }): Promise<SemanticSearchResult[]> {
    const { userId, query, sourceType, limit = 5, minScore = 0.5, clientOverride } = params;
    if (!userId || !query || !mongoose.Types.ObjectId.isValid(userId)) {
      return [];
    }

    const queryEmbedding = await this.getEmbedding(query.trim(), clientOverride);
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    // Query user's stored embeddings from MongoDB
    const filter: any = { userId: new mongoose.Types.ObjectId(userId) };
    if (sourceType) {
      filter.sourceType = sourceType;
    }

    const records = await SemanticEmbeddingModel.find(filter).lean();
    if (!records || records.length === 0) {
      return [];
    }

    // In-memory Cosine Similarity across user's embeddings
    const scoredResults: SemanticSearchResult[] = [];
    for (const record of records) {
      const score = cosineSimilarity(queryEmbedding, record.embedding);
      if (score >= minScore) {
        scoredResults.push({
          sourceId: record.sourceId,
          sourceType: record.sourceType,
          text: record.text,
          score,
          metadata: record.metadata,
        });
      }
    }

    // Sort descending by similarity score
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, limit);
  }

  /**
   * Deletes indexed content when deleted by the user.
   */
  public async deleteContent(userId: string, sourceType: string, sourceId: string): Promise<boolean> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return false;
    const res = await SemanticEmbeddingModel.deleteOne({
      userId: new mongoose.Types.ObjectId(userId),
      sourceType,
      sourceId,
    });
    return (res.deletedCount || 0) > 0;
  }
}

export const semanticRetrievalService = new SemanticRetrievalService();
