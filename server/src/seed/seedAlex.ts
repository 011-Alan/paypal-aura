import { connectDatabase, disconnectDatabase } from '../config/database';
import { ensureDemoUserAlexSeeded, DEMO_ALEX_CREDENTIALS } from './seedService';

async function run() {
  await connectDatabase();
  const res = await ensureDemoUserAlexSeeded(true);
  console.log('Seed completed:', {
    seeded: res.seeded,
    email: DEMO_ALEX_CREDENTIALS.email,
    pin: DEMO_ALEX_CREDENTIALS.pin,
  });
  await disconnectDatabase();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
