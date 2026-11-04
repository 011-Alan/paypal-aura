import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { GEMINI_MODEL_REGISTRY, GeminiModelRole } from './modelConfig';

export type ModelTaskType =
  | 'conversational_general'
  | 'financial_advisory'
  | 'payment_preparation'
  | 'transaction_categorization'
  | 'structured_entity_extraction'
  | 'semantic_search';

export interface ModelRouteDecision {
  taskType: ModelTaskType;
  modelRole: GeminiModelRole;
  modelId: string;
  canFallback: boolean;
  reason: string;
}

/**
 * ModelRouter: Central deterministic routing engine for AURA.
 * All Gemini model selections pass through this service.
 *
 * STRICT ARCHITECTURAL PRINCIPLES:
 * 1. ZERO PRE-CLASSIFICATION CALLS: Uses deterministic backend logic and request context.
 *    Never invokes an AI model merely to decide which model to call.
 * 2. PRIMARY FIRST: General conversation, reasoning, code, and financial intelligence
 *    are handled by Gemini 3.8 Flash.
 * 3. SELECTIVE LIGHTWEIGHT: Gemini 3.1 Flash Lite is used strictly for structured extraction,
 *    categorization, and controlled conversational fallback.
 * 4. FINANCIAL SECURITY: Payment preparation and sensitive authorization decisions NEVER
 *    fall back to Flash Lite.
 */
export class ModelRouter {
  /**
   * Deterministically routes a task to the appropriate Gemini model.
   */
  public route(taskType: ModelTaskType): ModelRouteDecision {
    switch (taskType) {
      case 'transaction_categorization':
        return {
          taskType,
          modelRole: 'lightweight',
          modelId: GEMINI_MODEL_REGISTRY.lightweight.modelId,
          canFallback: false,
          reason: 'Lightweight structured transaction categorization assigned to Gemini 3.1 Flash Lite',
        };

      case 'structured_entity_extraction':
        return {
          taskType,
          modelRole: 'lightweight',
          modelId: GEMINI_MODEL_REGISTRY.lightweight.modelId,
          canFallback: false,
          reason: 'Lightweight entity extraction assigned to Gemini 3.1 Flash Lite',
        };

      case 'semantic_search':
        return {
          taskType,
          modelRole: 'embedding',
          modelId: GEMINI_MODEL_REGISTRY.embedding.modelId,
          canFallback: false,
          reason: 'Vector embedding generation assigned to Gemini Embedding 2',
        };

      case 'payment_preparation':
        return {
          taskType,
          modelRole: 'primary',
          modelId: GEMINI_MODEL_REGISTRY.primary.modelId,
          canFallback: false, // STRICT SECURITY: Never fall back for payment preparation
          reason: 'Payment preparation requires primary model reasoning and strict security controls',
        };

      case 'financial_advisory':
      case 'conversational_general':
      default:
        return {
          taskType,
          modelRole: 'primary',
          modelId: GEMINI_MODEL_REGISTRY.primary.modelId,
          canFallback: true, // Controlled fallback permitted on transient failures
          reason: 'Primary conversational intelligence and multi-turn reasoning assigned to Gemini 3.8 Flash',
        };
    }
  }

  /**
   * Evaluates whether a failed primary-model request is eligible for fallback to Gemini 3.1 Flash Lite.
   *
   * Fallback is permitted ONLY when:
   * 1. The task is conversational / general knowledge / non-sensitive financial advisory.
   * 2. The task is NOT payment preparation or financial movement.
   * 3. The error is transient (HTTP 503, temporary network failure, or HTTP 429).
   * 4. The error is NOT permanent (invalid API key 401, bad request 400).
   * 5. Backend tools were not already executed.
   */
  public isFallbackPermitted(params: {
    taskType: ModelTaskType;
    isTransientError: boolean;
    isPermanentError: boolean;
    hasExecutedTools: boolean;
  }): boolean {
    const { taskType, isTransientError, isPermanentError, hasExecutedTools } = params;

    // Permanent errors (invalid API key, bad format) must fail fast without useless fallback
    if (isPermanentError) {
      return false;
    }

    // Payment operations must NEVER fall back
    if (taskType === 'payment_preparation') {
      logger.warn('ModelRouter', 'Fallback denied: Payment operations cannot fall back to lightweight models');
      return false;
    }

    // If tools were already executed before failure, do not re-execute or risk double execution
    if (hasExecutedTools) {
      logger.warn('ModelRouter', 'Fallback denied: Backend tools were already executed during primary turn');
      return false;
    }

    // Must be a transient error (503, 429, network)
    if (!isTransientError) {
      return false;
    }

    return true;
  }
}

export const modelRouter = new ModelRouter();
