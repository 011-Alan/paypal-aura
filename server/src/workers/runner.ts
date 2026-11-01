import { connectDatabase, disconnectDatabase } from '../config/database';
import { renderWorkerManager } from './backgroundWorkflows';
import { logger } from '../config/logger';

async function main() {
  await connectDatabase();
  logger.info('RenderWorkerCLI', 'Executing scheduled Render background workflow check...');
  const result = await renderWorkerManager.runDailyCommitmentsWorkflow();
  logger.info('RenderWorkerCLI', 'Completed background workflow check', result.details);
  await disconnectDatabase();
}

main().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
