import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { logger } from './config/logger';
import { connectDatabase } from './config/database';
import { apiRateLimiter } from './middleware/security';
import { apiRouter } from './routes/apiRoutes';
import { renderWorkerManager } from './workers/backgroundWorkflows';
import { logPayPalStartupDiagnostics } from './integrations/paypal/validator';

export const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (requestOrigin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!requestOrigin) return callback(null, true);
      // Allow localhost and any onrender.com origin
      if (
        requestOrigin.includes('localhost') ||
        requestOrigin.includes('127.0.0.1') ||
        requestOrigin.endsWith('.onrender.com') ||
        (env.CLIENT_ORIGIN && requestOrigin === env.CLIENT_ORIGIN)
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for hackathon sandbox demonstrations
    },
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
  logPayPalStartupDiagnostics();

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
