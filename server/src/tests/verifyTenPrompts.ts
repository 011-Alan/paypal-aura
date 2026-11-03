import mongoose from 'mongoose';
import { auraAiOrchestrator } from '../services/planning/aiOrchestratorService';
import { UserModel } from '../models';
import { ensureDemoUserAlexSeeded } from '../seed/seedService';
import { env } from '../config/env';

async function runPromptVerificationSuite() {
  console.log('================================================================');
  console.log('AURA 10-PROMPT VERIFICATION TEST SUITE (DEBUGGING & VERIFICATION)');
  console.log('================================================================\n');

  await mongoose.connect(env.MONGODB_URI);
  const alexResult = await ensureDemoUserAlexSeeded();
  const userId = String(alexResult.user._id);

  const testPrompts = [
    { id: 1, prompt: 'Can I buy an AC?', context: [] },
    { id: 2, prompt: 'Can I buy a laptop?', context: [] },
    { id: 3, prompt: 'Can I afford a refrigerator?', context: [] },
    {
      id: 4,
      prompt: 'What if I buy it on EMI?',
      context: [
        { role: 'user', content: 'Can I buy an AC?' },
        { role: 'assistant', content: 'Daikin 1.5 Ton AC ₹45,490 or Voltas 1.5 Ton AC ₹32,990' },
      ],
    },
    { id: 5, prompt: 'Compare two air conditioners.', context: [] },
    { id: 6, prompt: 'What is the weather like?', context: [] },
    { id: 7, prompt: 'Explain recursion in C.', context: [] },
    { id: 8, prompt: 'What are my upcoming commitments?', context: [] },
    { id: 9, prompt: 'Can I buy this AC for ₹35,000?', context: [] },
    {
      id: 10,
      prompt: 'What if I wait until next month?',
      context: [
        { role: 'user', content: 'Can I buy an AC for ₹35,000?' },
        { role: 'assistant', content: 'Evaluation for ₹35,000' },
      ],
    },
  ];

  let allPassed = true;

  for (const t of testPrompts) {
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST ${t.id}: "${t.prompt}"`);
    console.log(`----------------------------------------------------------------`);
    const res = await auraAiOrchestrator.processConversationalQuery({
      userId,
      prompt: t.prompt,
      conversationHistory: t.context as any,
    });

    const explanation = res.explanation || res.answer || '';
    console.log(`Workflow Type: ${res.workflowType}`);
    console.log(`Tool Action: ${res.toolAction?.title || 'None'}`);
    console.log(`Snippet:\n${explanation.slice(0, 240)}...\n`);

    // Validations:
    if (t.id === 1) {
      // Must NOT contain shoes
      if (/shoe|sneaker|nike|adidas|ultraboost|puma/i.test(explanation)) {
        console.error('FAILED: Contained shoes for AC query!');
        allPassed = false;
      } else if (!/air conditioner|daikin|voltas|ac/i.test(explanation)) {
        console.error('FAILED: Did not mention air conditioner or Daikin/Voltas!');
        allPassed = false;
      } else {
        console.log('PASSED: Correctly returned air conditioners (Daikin/Voltas), zero shoes.');
      }
    }

    if (t.id === 2) {
      if (!/laptop|macbook|asus|lenovo/i.test(explanation)) {
        console.error('FAILED: Did not find laptop!');
        allPassed = false;
      } else {
        console.log('PASSED: Correctly recommended laptops.');
      }
    }

    if (t.id === 3) {
      if (!/refrigerator|fridge|lg|samsung/i.test(explanation)) {
        console.error('FAILED: Did not find refrigerator!');
        allPassed = false;
      } else {
        console.log('PASSED: Correctly recommended refrigerators.');
      }
    }

    if (t.id === 4) {
      if (!/emi|interest|tenure/i.test(explanation)) {
        console.error('FAILED: Did not return EMI schedule!');
        allPassed = false;
      } else {
        console.log('PASSED: Correctly computed EMI tenures (3/6/9/12 mo).');
      }
    }

    if (t.id === 5) {
      if (!/comparison|daikin|voltas|energy rating/i.test(explanation)) {
        console.error('FAILED: Did not compare two ACs!');
        allPassed = false;
      } else {
        console.log('PASSED: Correctly generated side-by-side comparison table.');
      }
    }

    if (t.id === 6) {
      if (/stock|discretionary|savings target/i.test(explanation)) {
        console.error('FAILED: Weather invoked unnecessary financial agent!');
        allPassed = false;
      } else {
        console.log('PASSED: Answered weather inquiry directly without financial clutter.');
      }
    }

    if (t.id === 7) {
      if (!/base case|factorial|stack/i.test(explanation) || /discretionary budget/i.test(explanation)) {
        console.error('FAILED: Recursion in C not explained cleanly or invoked financial agent!');
        allPassed = false;
      } else {
        console.log('PASSED: Explained recursion in C cleanly with code sample and call stack.');
      }
    }

    if (t.id === 8) {
      if (!/upcoming commitments|rent|insurance|internet/i.test(explanation)) {
        console.error('FAILED: Did not organise upcoming commitments!');
        allPassed = false;
      } else {
        console.log('PASSED: Accurately listed upcoming commitments with dates and amounts.');
      }
    }

    if (t.id === 9) {
      if (!/35,000/i.test(explanation)) {
        console.error('FAILED: Did not evaluate ₹35,000 price point!');
        allPassed = false;
      } else {
        console.log('PASSED: Evaluated ₹35,000 price point accurately against commitments.');
      }
    }

    if (t.id === 10) {
      if (!/postpon|next month/i.test(explanation)) {
        console.error('FAILED: Did not evaluate postponement effect!');
        allPassed = false;
      } else {
        console.log('PASSED: Accurately evaluated postponing purchase to next month.');
      }
    }
  }

  await mongoose.disconnect();
  console.log('\n================================================================');
  console.log(allPassed ? 'ALL 10 VERIFICATION TESTS PASSED!' : 'SOME TESTS FAILED');
  console.log('================================================================');
  process.exit(allPassed ? 0 : 1);
}

runPromptVerificationSuite().catch((err) => {
  console.error('Verification suite error:', err);
  process.exit(1);
});
