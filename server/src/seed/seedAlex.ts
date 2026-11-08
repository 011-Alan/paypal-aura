import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ensureDemoUserAlexSeeded,
  ensureDemoUserMayaSeeded,
  ensureDemoMerchantBruceSeeded,
  DEMO_ALEX_CREDENTIALS,
  DEMO_BRUCE_CREDENTIALS,
} from './seedService';

async function run() {
  await connectDatabase();
  const alexRes = await ensureDemoUserAlexSeeded(true);
  const mayaRes = await ensureDemoUserMayaSeeded(true);
  const bruceRes = await ensureDemoMerchantBruceSeeded(true);
  console.log('Seed completed:', {
    alex: { seeded: alexRes.seeded, email: DEMO_ALEX_CREDENTIALS.email },
    bruce: { seeded: bruceRes.seeded, email: DEMO_BRUCE_CREDENTIALS.email, role: DEMO_BRUCE_CREDENTIALS.role },
  });
  await disconnectDatabase();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
