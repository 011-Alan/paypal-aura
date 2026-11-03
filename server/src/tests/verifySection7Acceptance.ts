import mongoose from 'mongoose';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { ensureDemoUserAlexSeeded } from '../seed/seedService';
import { env } from '../config/env';

async function runSection7AcceptanceTests() {
  console.log('================================================================');
  console.log('AURA SECTION 7: 10 CONTEXT-AWARE RENDERING ACCEPTANCE TESTS');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  const alexResult = await ensureDemoUserAlexSeeded();
  const userId = String(alexResult.user._id);

  const testCases = [
    {
      id: 1,
      title: 'General knowledge response',
      prompt: 'What is quantum computing?',
      validate: (exp: string) => exp.includes('superposition') && exp.includes('Qubit'),
    },
    {
      id: 2,
      title: 'Python code generation',
      prompt: 'Write python code to generate fibonacci sequence',
      validate: (exp: string) => exp.includes('```python') && exp.includes('def fibonacci'),
    },
    {
      id: 3,
      title: 'Code explanation',
      prompt: 'Explain recursion in C.',
      validate: (exp: string) => exp.includes('```c') && exp.includes('Base Case') && exp.includes('factorial'),
    },
    {
      id: 4,
      title: 'Email drafting',
      prompt: 'Draft an email update to my team about our financial plan',
      validate: (exp: string) => exp.includes('Subject:') && exp.includes('Dear Team') && exp.includes('Best regards'),
    },
    {
      id: 5,
      title: 'Mathematical explanation',
      prompt: 'What is compounding interest and how does it help me save?',
      validate: (exp: string) => exp.includes('Compound interest') && exp.includes('8%') && exp.includes('₹1,00,000'),
    },
    {
      id: 6,
      title: 'Table generation',
      prompt: 'Compare two air conditioners.',
      validate: (exp: string) => exp.includes('| Feature |') && exp.includes('Daikin') && exp.includes('Voltas'),
    },
    {
      id: 7,
      title: 'Product recommendations',
      prompt: 'Can I buy an AC?',
      validate: (exp: string, res: any) =>
        !/shoe|sneaker|nike|adidas/i.test(exp) &&
        res.purchaseCompanion?.evaluatedProducts?.length > 0 &&
        res.toolAction?.type === 'purchase_evaluated',
    },
    {
      id: 8,
      title: 'Financial analysis',
      prompt: 'Show me my current balance.',
      validate: (exp: string, res: any) =>
        exp.includes('available balance') &&
        res.toolAction?.type === 'financial_intelligence' &&
        res.toolAction?.details?.totalBalance > 0,
    },
    {
      id: 9,
      title: 'Payment preparation with strict security',
      prompt: 'I need to pay Rahul ₹5,000.',
      validate: (exp: string, res: any) =>
        res.toolAction?.type === 'payment_prepared' &&
        res.toolAction?.status === 'awaiting_approval' &&
        res.toolAction?.requiresUserPaymentApproval === true &&
        exp.includes('PIN to authorise'),
    },
    {
      id: 10,
      title: 'Long response containing Markdown and code',
      prompt: 'Explain recursion in C with code and step-by-step call stack',
      validate: (exp: string) =>
        exp.includes('```c') && exp.includes('Call Stack') && exp.length > 300,
    },
  ];

  let passedCount = 0;

  for (const tc of testCases) {
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST ${tc.id}: ${tc.title}`);
    console.log(`Prompt: "${tc.prompt}"`);
    console.log(`----------------------------------------------------------------`);

    const result = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: tc.prompt,
    });

    const exp = result.explanation || result.answer || '';
    const passed = tc.validate(exp, result);

    if (passed) {
      console.log(`[PASS] Correctly structured & rendered`);
      console.log(`Snippet: ${exp.slice(0, 160).replace(/\n/g, ' ')}...`);
      passedCount++;
    } else {
      console.error(`[FAIL] Verification criteria failed for test ${tc.id}`);
      console.error(`Explanation output:\n${exp}`);
    }
  }

  await mongoose.disconnect();
  console.log('\n================================================================');
  console.log(`Acceptance Test Summary: ${passedCount}/${testCases.length} Passed`);
  console.log('================================================================');

  process.exit(passedCount === testCases.length ? 0 : 1);
}

runSection7AcceptanceTests().catch((err) => {
  console.error('Acceptance suite error:', err);
  process.exit(1);
});
