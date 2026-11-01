import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase } from './config/database';
import { apiRateLimiter } from './middleware/security';
import { apiRouter } from './routes/apiRoutes';
import { ensureDemoUserAlexSeeded } from './seed/seedService';
import { renderWorkerManager } from './workers/backgroundWorkflows';

export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: env.NODE_ENV === 'production' ? [env.CLIENT_ORIGIN] : true,
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiRateLimiter, apiRouter);

// Serve static production frontend build if available
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
app.use(express.static(clientDistPath));

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('ExpressErrorHandler', 'Unhandled request error', { error: err?.message });
  res.status(err?.status || 500).json({
    success: false,
    error: err?.message || 'Internal server error',
  });
});

export async function startServer() {
  await connectDatabase();
  await ensureDemoUserAlexSeeded(false);

  const server = app.listen(env.PORT, () => {
    logger.info('Server', `PROJECT AURA Backend API listening on http://localhost:${env.PORT}`);
  });

  if (env.ENABLE_BACKGROUND_WORKERS) {
    // Run initial background commitment check on startup
    setTimeout(() => {
      renderWorkerManager.runDailyCommitmentsWorkflow().catch((err) => {
        logger.warn('Server', 'Background worker startup check warning', { error: err?.message });
      });
    }, 1500);
  }

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    logger.error('Server', 'Fatal error during startup', { error: err?.message });
    process.exit(1);
  });
}
