import assert from 'assert';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  UserModel,
  AccountModel,
  MandateModel,
  GoalModel,
  FamilyGroupModel,
} from '../models';
import { coreFinancialService } from '../services/financial/financialService';
import { hashSecretArgon2id } from '../middleware/security';

async function runUserDataIsolationVerification() {
  console.log('================================================================');
  console.log('AURA USER DATA ISOLATION & PRIVACY VERIFICATION SUITE');
  console.log('================================================================\n');

  await connectDatabase();

  const timestamp = Date.now();
  const userAlphaEmail = `alpha-${timestamp}@aura-isolation.test`;
  const userBetaEmail = `beta-${timestamp}@aura-isolation.test`;

  try {
    const passwordHash = await hashSecretArgon2id('SecurePass123!');
    const pinHash = await hashSecretArgon2id('1234');

    // 1. Create User Alpha
    const userAlpha = await UserModel.create({
      name: 'User Alpha',
      email: userAlphaEmail,
      passwordHash,
      pinHash,
      role: 'user',
      currency: 'INR',
      monthlyIncome: 100000,
    });
    console.log(`[PASS] Created User Alpha (${userAlpha._id})`);

    // 2. Create User Beta (No family group linked initially)
    const userBeta = await UserModel.create({
      name: 'User Beta',
      email: userBetaEmail,
      passwordHash,
      pinHash,
      role: 'user',
      currency: 'INR',
      monthlyIncome: 65000,
    });
    console.log(`[PASS] Created User Beta (${userBeta._id})`);

    // 3. User Alpha creates financial assets
    const alphaAccount = await AccountModel.create({
      userId: userAlpha._id,
      name: 'Primary Alpha Account',
      institution: 'HDFC Private Banking',
      type: 'savings',
      accountNumberMasked: 'XXXX4321',
      balance: 250000,
      currency: 'INR',
      lastSyncedAt: new Date(),
    });

    const alphaMandate = await MandateModel.create({
      userId: userAlpha._id,
      title: 'Alpha Penthouse Rent',
      merchant: 'Alpha Landlord Properties',
      amount: 45000,
      dueDayOfMonth: 1,
      nextDueDate: new Date(Date.now() + 86400000 * 15),
      category: 'Rent',
      status: 'confirmed',
      confidenceScore: 1.0,
    });

    const alphaGoal = await GoalModel.create({
      userId: userAlpha._id,
      title: 'Alpha Emergency Fund',
      category: 'Emergency Fund',
      targetAmount: 300000,
      currentAmount: 150000,
      monthlyContribution: 25000,
      deadline: new Date(Date.now() + 86400000 * 180),
      isSharedWithFamily: false,
    });

    console.log('[PASS] Populated User Alpha financial assets (Account, Mandate, Goal)');

    // 4. Test User Beta Data Isolation - Accounts
    const betaAccounts = await AccountModel.find({ userId: userBeta._id });
    assert.strictEqual(betaAccounts.length, 0, 'User Beta must see 0 accounts');
    const alphaAccounts = await AccountModel.find({ userId: userAlpha._id });
    assert.strictEqual(alphaAccounts.length, 1, 'User Alpha sees their own account');
    assert.strictEqual(alphaAccounts[0].institution, 'HDFC Private Banking');
    console.log('[PASS] Test 1: Accounts are strictly isolated by userId');

    // 5. Test User Beta Data Isolation - Mandates
    const betaMandates = await MandateModel.find({ userId: userBeta._id });
    assert.strictEqual(betaMandates.length, 0, 'User Beta must have 0 recurring mandates');
    const alphaMandates = await MandateModel.find({ userId: userAlpha._id });
    assert.strictEqual(alphaMandates.length, 1, 'User Alpha sees their own mandate');
    console.log('[PASS] Test 2: Mandates & outflows are strictly isolated by userId');

    // 6. Test User Beta Data Isolation - Family Finance (Zero Data Leakage Check)
    const betaFamilyOverview = await coreFinancialService.getPrivacyPreservingFamilyOverview(userBeta._id.toString());
    assert.strictEqual(betaFamilyOverview.hasHousehold, false, 'User Beta has no linked household initially');
    assert.strictEqual(betaFamilyOverview.familyGroup, null, 'familyGroup must be null for unlinked user');
    assert.strictEqual(betaFamilyOverview.sharedGoals.length, 0, 'No shared goals should be visible');
    assert.strictEqual(betaFamilyOverview.sharedCommitments.length, 0, 'No shared commitments should be visible');
    assert.strictEqual(betaFamilyOverview.sharedTransactions.length, 0, 'No shared transactions should be visible');
    assert.strictEqual(betaFamilyOverview.sharedSummary.sharedMonthlyBudget, 0, 'Household total budget must be 0, not ₹40,000');
    assert.strictEqual(betaFamilyOverview.sharedSummary.sharedSpentThisMonth, 0, 'Household total spent must be 0');

    // Confirm that NO Sharma-Verma data leaked
    const serializedOverview = JSON.stringify(betaFamilyOverview);
    assert(
      !serializedOverview.includes('Sharma') && !serializedOverview.includes('Verma'),
      'CRITICAL: No Sharma-Verma strings may appear in User Beta family response'
    );
    assert(
      !serializedOverview.includes('aura-family-alex') && !serializedOverview.includes('aura-family-sharma'),
      'CRITICAL: No legacy Sharma family IDs may leak to User Beta'
    );
    console.log('[PASS] Test 3: Zero household data leakage verified (No Sharma/Verma leak for new users)');

    // 7. Test User Beta Household Creation
    const betaFamilyGroupId = `fam-beta-${timestamp}`;
    const newHousehold = await FamilyGroupModel.create({
      familyGroupId: betaFamilyGroupId,
      name: 'The Beta Household',
      createdBy: userBeta._id,
      sharedMonthlyBudget: 55000,
      members: [
        {
          userId: userBeta._id,
          name: 'User Beta',
          email: userBetaEmail,
          relationship: 'Self',
          role: 'admin',
          privacyLevel: 'shared_budgets',
          monthlySharedContribution: 55000,
        },
      ],
      sharedSpentThisMonth: 0,
      sharedCategories: ['Housing', 'Groceries', 'Utilities'],
    });

    userBeta.familyGroupId = betaFamilyGroupId;
    await userBeta.save();

    const betaUpdatedOverview = await coreFinancialService.getPrivacyPreservingFamilyOverview(userBeta._id.toString());
    assert.strictEqual(betaUpdatedOverview.hasHousehold, true, 'User Beta now has an active household');
    assert.strictEqual(betaUpdatedOverview.familyGroup?.name, 'The Beta Household');
    assert.strictEqual(betaUpdatedOverview.sharedSummary.sharedMonthlyBudget, 55000);

    // Ensure User Alpha still cannot see User Beta's family
    const alphaFamilyOverview = await coreFinancialService.getPrivacyPreservingFamilyOverview(userAlpha._id.toString());
    assert.strictEqual(alphaFamilyOverview.hasHousehold, false, 'User Alpha must not see User Beta household');
    console.log('[PASS] Test 4: Private household creation & cross-user family isolation verified');

    // 8. Test Goals isolation
    const betaGoals = await GoalModel.find({ userId: userBeta._id });
    assert.strictEqual(betaGoals.length, 0, 'User Beta must see 0 goals initially');
    const alphaGoals = await GoalModel.find({ userId: userAlpha._id });
    assert.strictEqual(alphaGoals.length, 1, 'User Alpha sees 1 goal');
    console.log('[PASS] Test 5: Goals are strictly isolated by userId');

    console.log('\n================================================================');
    console.log('ALL USER DATA ISOLATION & PRIVACY VERIFICATION TESTS PASSED (5/5)');
    console.log('================================================================\n');
  } finally {
    // Cleanup test data
    console.log('Cleaning up test isolation fixtures...');
    const users = await UserModel.find({ email: { $in: [userAlphaEmail, userBetaEmail] } });
    const userIds = users.map((u) => u._id);
    await UserModel.deleteMany({ _id: { $in: userIds } });
    await AccountModel.deleteMany({ userId: { $in: userIds } });
    await MandateModel.deleteMany({ userId: { $in: userIds } });
    await GoalModel.deleteMany({ userId: { $in: userIds } });
    await FamilyGroupModel.deleteMany({ familyGroupId: `fam-beta-${timestamp}` });
    await disconnectDatabase();
    console.log('Test cleanup complete.');
  }
}

runUserDataIsolationVerification().catch((err) => {
  console.error('[FAIL] User data isolation verification failed:', err);
  process.exit(1);
});
