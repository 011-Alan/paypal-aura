import mongoose from 'mongoose';
import { auraAiOrchestratorService } from '../services/planning/aiOrchestratorService';
import { ensureDemoUserAlexSeeded } from '../seed/seedService';
import { env } from '../config/env';

interface TestCase {
  id: number;
  prompt: string;
  expectedToolActionType: string;
  forbiddenStrings?: string[];
  requiredStrings?: string[];
  validate: (result: any) => boolean;
}

const testCases: TestCase[] = [
  {
    id: 1,
    prompt: 'Can I buy a bottle?',
    expectedToolActionType: 'clarification_needed',
    forbiddenStrings: ['Financial Summary', 'Discretionary Budget', 'Affordability Score', 'Nike', 'Shoes'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'clarification_needed' &&
             text.toLowerCase().includes('what kind of bottle') &&
             !res.purchaseCompanion;
    }
  },
  {
    id: 2,
    prompt: 'What kind of bottles are available?',
    expectedToolActionType: 'product_discovery',
    forbiddenStrings: ['Financial Health Score', 'Discretionary Budget'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'product_discovery' &&
             (text.toLowerCase().includes('bottle') || text.toLowerCase().includes('milton')) &&
             !res.purchaseCompanion?.affordabilityEvaluation;
    }
  },
  {
    id: 3,
    prompt: 'Can I buy a water bottle for ₹1,500?',
    expectedToolActionType: 'purchase_evaluated',
    requiredStrings: ['1,500', 'Affordability'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      return toolType === 'purchase_evaluated' &&
             res.purchaseCompanion !== null;
    }
  },
  {
    id: 4,
    prompt: 'Can I afford a ₹35,000 AC?',
    expectedToolActionType: 'purchase_evaluated',
    requiredStrings: ['35,000', 'Affordability'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      return toolType === 'purchase_evaluated' &&
             res.purchaseCompanion !== null;
    }
  },
  {
    id: 5,
    prompt: 'Explain quantum computing.',
    expectedToolActionType: 'general_knowledge',
    forbiddenStrings: ['discretionary budget', 'financial health', 'bank balance'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'general_knowledge' &&
             text.toLowerCase().includes('qubit') &&
             !res.purchaseCompanion;
    }
  },
  {
    id: 6,
    prompt: 'Write a Python program for factorial.',
    expectedToolActionType: 'general_knowledge',
    forbiddenStrings: ['discretionary budget', 'financial health'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'general_knowledge' &&
             text.includes('def factorial') &&
             text.includes('```python');
    }
  },
  {
    id: 7,
    prompt: 'Explain this code line by line.',
    expectedToolActionType: 'general_knowledge',
    forbiddenStrings: ['financial summary', 'upcoming commitments'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'general_knowledge' &&
             text.length > 50 &&
             !res.purchaseCompanion;
    }
  },
  {
    id: 8,
    prompt: 'Tell me about Australia.',
    expectedToolActionType: 'general_knowledge',
    forbiddenStrings: ['discretionary budget', 'financial health', 'bank balance'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'general_knowledge' &&
             text.toLowerCase().includes('canberra') &&
             !res.purchaseCompanion;
    }
  },
  {
    id: 9,
    prompt: 'What are my upcoming commitments?',
    expectedToolActionType: 'financial_intelligence',
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return (toolType === 'financial_intelligence' || toolType === 'upcoming_commitments') &&
             text.toLowerCase().includes('commitment');
    }
  },
  {
    id: 10,
    prompt: 'Remind me to pay rent next Monday.',
    expectedToolActionType: 'reminder_scheduled',
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'reminder_scheduled' &&
             text.toLowerCase().includes('rent');
    }
  },
  {
    id: 11,
    prompt: 'What is PayPal?',
    expectedToolActionType: 'general_knowledge',
    forbiddenStrings: ['Your current balance is', 'Discretionary budget is'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'general_knowledge' &&
             text.toLowerCase().includes('payment') &&
             !res.purchaseCompanion;
    }
  },
  {
    id: 12,
    prompt: 'Can you help me prepare for an interview?',
    expectedToolActionType: 'general_knowledge',
    forbiddenStrings: ['discretionary budget', 'financial health score'],
    validate: (res) => {
      const toolType = res.toolAction?.type;
      const text = res.explanation || res.answer || '';
      return toolType === 'general_knowledge' &&
             text.toLowerCase().includes('interview') &&
             !res.purchaseCompanion;
    }
  }
];

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING SECTION 12 CONVERSATIONAL CAPABILITY VERIFICATION SUITE');
  console.log('================================================================\n');

  let userId = 'alex_sharma';
  try {
    await mongoose.connect(env.MONGODB_URI);
    const alex = await ensureDemoUserAlexSeeded();
    userId = String(alex.user._id);
  } catch (err: any) {
    console.warn('Note: Running with simulated user context:', err?.message || err);
  }

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`[Test ${tc.id}/12] Prompt: "${tc.prompt}"`);
    try {
      const result = await auraAiOrchestratorService.processConversationalQuery({
        prompt: tc.prompt,
        userId,
        conversationHistory: []
      });

      let check = tc.validate(result);
      let errorReason = '';

      if (tc.forbiddenStrings) {
        const fullOutput = JSON.stringify(result);
        for (const forb of tc.forbiddenStrings) {
          if (fullOutput.toLowerCase().includes(forb.toLowerCase())) {
            check = false;
            errorReason = `Output contained forbidden string "${forb}"`;
            break;
          }
        }
      }

      if (tc.requiredStrings) {
        const fullOutput = JSON.stringify(result);
        for (const req of tc.requiredStrings) {
          if (!fullOutput.toLowerCase().includes(req.toLowerCase())) {
            check = false;
            errorReason = `Output missing required string "${req}"`;
            break;
          }
        }
      }

      if (check) {
        console.log(`  -> [PASS] Action Type: ${result.toolAction?.type || 'none'}`);
        const preview = (result.explanation || result.answer || '').slice(0, 90).replace(/\n/g, ' ');
        console.log(`     Preview: "${preview}..."\n`);
        passed++;
      } else {
        console.error(`  -> [FAIL] Expected toolAction ${tc.expectedToolActionType}, got ${result.toolAction?.type}. Reason: ${errorReason}`);
        const preview = (result.explanation || result.answer || '').slice(0, 150).replace(/\n/g, ' ');
        console.error(`     Response: ${preview}\n`);
        failed++;
      }
    } catch (err: any) {
      console.error(`  -> [ERROR] Failed to run test ${tc.id}:`, err?.message || err);
      failed++;
    }
  }

  console.log('================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED / ${failed} FAILED (TOTAL: 12)`);
  console.log('================================================================');

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
