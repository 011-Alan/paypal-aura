import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    logger.info('Database', `Connected to MongoDB primary store at ${env.MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
  } catch (err: any) {
    logger.error('Database', 'Failed to connect to MongoDB', { error: err?.message });
    throw err;
  }
}

export function getDatabaseHealth() {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const state = mongoose.connection.readyState;
  return {
    status: state === 1 ? 'healthy' : 'unhealthy',
    state: states[state] || 'unknown',
    databaseName: mongoose.connection.name || 'aura_fintech',
    host: mongoose.connection.host || '127.0.0.1',
  };
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Database', 'Disconnected from MongoDB');
  }
}
