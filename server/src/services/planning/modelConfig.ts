import { env } from '../../config/env';
import { logger } from '../../config/logger';

export type GeminiModelRole = 'primary' | 'lightweight' | 'embedding';

export interface ModelSpecification {
  role: GeminiModelRole;
  modelId: string;
  displayName: string;
  description: string;
  rpmTarget: number;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedCapabilities: string[];
}

export const GEMINI_MODEL_REGISTRY: Record<GeminiModelRole, ModelSpecification> = {
  primary: {
    role: 'primary',
    modelId: env.GEMINI_PRIMARY_MODEL,
    displayName: 'Gemini 3.8 Flash',
    description: 'Primary conversational intelligence, multi-turn reasoning, complex financial planning & function calling',
    rpmTarget: env.GEMINI_PRIMARY_RPM_LIMIT,
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedCapabilities: [
      'general_conversation',
      'reasoning',
      'coding',
      'financial_advisory',
      'function_calling',
      'structured_output',
    ],
  },
  lightweight: {
    role: 'lightweight',
    modelId: env.GEMINI_LIGHTWEIGHT_MODEL,
    displayName: 'Gemini 3.1 Flash Lite',
    description: 'Lightweight categorization, structured entity extraction, and controlled fallback',
    rpmTarget: env.GEMINI_LIGHTWEIGHT_RPM_LIMIT,
    inputTokenLimit: 1048576,
    outputTokenLimit: 65536,
    supportedCapabilities: [
      'transaction_categorization',
      'entity_extraction',
      'lightweight_classification',
      'conversational_fallback',
      'function_calling',
    ],
  },
  embedding: {
    role: 'embedding',
    modelId: env.GEMINI_EMBEDDING_MODEL,
    displayName: 'Gemini Embedding 2',
    description: 'Semantic search, contextual retrieval, and cross-modal embedding representations',
    rpmTarget: env.GEMINI_EMBEDDING_RPM_LIMIT,
    inputTokenLimit: 8192,
    outputTokenLimit: 3072, // embedding vector dimensions
    supportedCapabilities: [
      'text_embedding',
      'semantic_search',
      'contextual_retrieval',
    ],
  },
};

export interface ModelDiagnosticResult {
  role: GeminiModelRole;
  modelId: string;
  displayName: string;
  available: boolean;
  latencyMs?: number;
  error?: string;
  testedAt: string;
}

/**
 * Validates configured models by executing a minimal ping against the Gemini API client.
 * Does not silently substitute unverified models; returns clear diagnostic output.
 */
export async function validateModelAvailability(client: any): Promise<Record<GeminiModelRole, ModelDiagnosticResult>> {
  const now = new Date().toISOString();
  const results: Record<GeminiModelRole, ModelDiagnosticResult> = {
    primary: {
      role: 'primary',
      modelId: GEMINI_MODEL_REGISTRY.primary.modelId,
      displayName: GEMINI_MODEL_REGISTRY.primary.displayName,
      available: false,
      testedAt: now,
    },
    lightweight: {
      role: 'lightweight',
      modelId: GEMINI_MODEL_REGISTRY.lightweight.modelId,
      displayName: GEMINI_MODEL_REGISTRY.lightweight.displayName,
      available: false,
      testedAt: now,
    },
    embedding: {
      role: 'embedding',
      modelId: GEMINI_MODEL_REGISTRY.embedding.modelId,
      displayName: GEMINI_MODEL_REGISTRY.embedding.displayName,
      available: false,
      testedAt: now,
    },
  };

  if (!client) {
    const errorMsg = 'Gemini client is uninitialized. GEMINI_API_KEY is not configured.';
    results.primary.error = errorMsg;
    results.lightweight.error = errorMsg;
    results.embedding.error = errorMsg;
    return results;
  }

  // 1. Primary Model Check
  try {
    const t0 = Date.now();
    await client.models.generateContent({
      model: GEMINI_MODEL_REGISTRY.primary.modelId,
      contents: 'ping',
    });
    results.primary.available = true;
    results.primary.latencyMs = Date.now() - t0;
  } catch (err: any) {
    results.primary.available = false;
    results.primary.error = err?.message || 'Primary model ping failed';
    logger.warn('ModelConfig', `Diagnostic: Primary model (${GEMINI_MODEL_REGISTRY.primary.modelId}) ping failed`, {
      error: results.primary.error,
    });
  }

  // 2. Lightweight Model Check
  try {
    const t0 = Date.now();
    await client.models.generateContent({
      model: GEMINI_MODEL_REGISTRY.lightweight.modelId,
      contents: 'ping',
    });
    results.lightweight.available = true;
    results.lightweight.latencyMs = Date.now() - t0;
  } catch (err: any) {
    results.lightweight.available = false;
    results.lightweight.error = err?.message || 'Lightweight model ping failed';
    logger.warn('ModelConfig', `Diagnostic: Lightweight model (${GEMINI_MODEL_REGISTRY.lightweight.modelId}) ping failed`, {
      error: results.lightweight.error,
    });
  }

  // 3. Embedding Model Check
  try {
    const t0 = Date.now();
    if (typeof client.models?.embedContent === 'function') {
      await client.models.embedContent({
        model: GEMINI_MODEL_REGISTRY.embedding.modelId,
        contents: 'test',
      });
      results.embedding.available = true;
      results.embedding.latencyMs = Date.now() - t0;
    } else {
      results.embedding.available = false;
      results.embedding.error = 'embedContent method not available on client';
    }
  } catch (err: any) {
    results.embedding.available = false;
    results.embedding.error = err?.message || 'Embedding model ping failed';
    logger.warn('ModelConfig', `Diagnostic: Embedding model (${GEMINI_MODEL_REGISTRY.embedding.modelId}) ping failed`, {
      error: results.embedding.error,
    });
  }

  return results;
}
