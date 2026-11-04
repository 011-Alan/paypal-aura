import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { geminiRequestManager } from '../planning/geminiRequestManager';
import { GEMINI_MODEL_REGISTRY } from '../planning/modelConfig';

export interface TransactionCategoryResult {
  category: string;
  subcategory: string;
  merchant: string;
  confidence: number;
  isSubscription: boolean;
  tags: string[];
}

export interface ExtractedFinancialEntities {
  date: string | null;
  amount: number | null;
  currency: string | null;
  recipient: string | null;
  purpose: string | null;
}

export class LightweightProcessingService {
  private geminiClient: any = null;

  public setGeminiClient(client: any) {
    this.geminiClient = client;
  }

  /**
   * Categorizes a transaction description using Gemini 3.1 Flash Lite.
   * Lightweight structured task suitable for the lightweight model.
   */
  public async categorizeTransaction(params: {
    description: string;
    amount?: number;
    currency?: string;
    clientOverride?: any;
  }): Promise<TransactionCategoryResult> {
    const { description, amount, currency = 'INR', clientOverride } = params;
    const client = clientOverride || this.geminiClient;

    if (!client) {
      return this.deterministicCategorization(description);
    }

    const prompt = `Analyze this transaction and return JSON with keys: category, subcategory, merchant, confidence (0-1), isSubscription (boolean), tags (array of strings).
Description: "${description}"
Amount: ${amount !== undefined ? amount : 'unknown'} ${currency}

Standard categories: Dining, Groceries, Utilities, Shopping, Transportation, Entertainment, Healthcare, Investment, Income, Other.
Return ONLY valid JSON without markdown wrapping.`;

    try {
      const response = await geminiRequestManager.scheduleGeminiCall(
        'lightweight',
        'transaction_categorization',
        `cat-${Date.now()}`,
        async () => {
          return await client.models.generateContent({
            model: GEMINI_MODEL_REGISTRY.lightweight.modelId,
            contents: prompt,
            config: {
              temperature: 0.1,
            },
          });
        }
      );

      const text = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        category: parsed.category || 'Other',
        subcategory: parsed.subcategory || 'General',
        merchant: parsed.merchant || description.split(/\s+/)[0],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        isSubscription: Boolean(parsed.isSubscription),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      };
    } catch (err: any) {
      logger.warn('LightweightProcessingService', 'Flash Lite categorization failed; using deterministic fallback', {
        error: err?.message,
      });
      return this.deterministicCategorization(description);
    }
  }

  /**
   * Extracts dates, amounts, and entities from unstructured text using Gemini 3.1 Flash Lite.
   */
  public async extractStructuredEntities(params: {
    text: string;
    clientOverride?: any;
  }): Promise<ExtractedFinancialEntities> {
    const { text, clientOverride } = params;
    const client = clientOverride || this.geminiClient;

    if (!client) {
      return this.deterministicEntityExtraction(text);
    }

    const prompt = `Extract financial entities from this text and return JSON with keys: date (ISO string or null), amount (number or null), currency (string or null), recipient (string or null), purpose (string or null).
Text: "${text}"
Return ONLY valid JSON without markdown wrapping.`;

    try {
      const response = await geminiRequestManager.scheduleGeminiCall(
        'lightweight',
        'structured_entity_extraction',
        `extract-${Date.now()}`,
        async () => {
          return await client.models.generateContent({
            model: GEMINI_MODEL_REGISTRY.lightweight.modelId,
            contents: prompt,
            config: {
              temperature: 0.1,
            },
          });
        }
      );

      const resText = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanJson = resText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);

      return {
        date: parsed.date || null,
        amount: typeof parsed.amount === 'number' ? parsed.amount : null,
        currency: parsed.currency || 'INR',
        recipient: parsed.recipient || null,
        purpose: parsed.purpose || null,
      };
    } catch (err: any) {
      logger.warn('LightweightProcessingService', 'Flash Lite entity extraction failed; using deterministic fallback', {
        error: err?.message,
      });
      return this.deterministicEntityExtraction(text);
    }
  }

  private deterministicCategorization(desc: string): TransactionCategoryResult {
    const lower = desc.toLowerCase();
    let category = 'Other';
    let subcategory = 'General';
    let isSubscription = false;

    if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('restaurant') || lower.includes('cafe')) {
      category = 'Dining';
      subcategory = 'Food Delivery';
    } else if (lower.includes('supermarket') || lower.includes('grocery') || lower.includes('blinkit') || lower.includes('zepto')) {
      category = 'Groceries';
      subcategory = 'Daily Needs';
    } else if (lower.includes('uber') || lower.includes('ola') || lower.includes('metro') || lower.includes('petrol')) {
      category = 'Transportation';
      subcategory = 'Commute';
    } else if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('prime')) {
      category = 'Entertainment';
      subcategory = 'Streaming';
      isSubscription = true;
    } else if (lower.includes('electricity') || lower.includes('water') || lower.includes('wifi') || lower.includes('broadband')) {
      category = 'Utilities';
      subcategory = 'Bills';
      isSubscription = true;
    }

    return {
      category,
      subcategory,
      merchant: desc.split(/[\s-]+/)[0] || desc,
      confidence: 0.85,
      isSubscription,
      tags: [category.toLowerCase()],
    };
  }

  private deterministicEntityExtraction(text: string): ExtractedFinancialEntities {
    const amountMatch = text.match(/(?:₹|rs\.?|inr|\$)\s*([\d,]+(?:\.\d+)?)/i) || text.match(/([\d,]+(?:\.\d+)?)\s*(?:rupees|inr|usd)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

    const toMatch = text.match(/(?:to|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    const recipient = toMatch ? toMatch[1].trim() : null;

    return {
      date: null,
      amount,
      currency: 'INR',
      recipient,
      purpose: null,
    };
  }
}

export const lightweightProcessingService = new LightweightProcessingService();
