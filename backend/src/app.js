import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { errorHandler, notFoundHandler } from './middleware/errorMiddleware.js';
import verificationRoutes from './routes/verificationRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import schemeRoutes from './routes/schemeRoutes.js';
import { verificationRateLimit } from './middleware/rateLimit.js';
import { languageCapabilities } from './services/languageService.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'truth-lens-ai-hhnl.vercel.app')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    const localDevelopmentOrigin = process.env.NODE_ENV !== 'production'
      && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || '');
    callback(null, !origin || allowedOrigins.includes(origin) || localDevelopmentOrigin);
  },
}));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.json({
    success: true,
    status: databaseConnected ? 'ok' : 'degraded',
    service: 'truthlens-api',
    database: databaseConnected ? 'connected' : 'disconnected',
  });
});

app.get('/api/languages', (req, res) => {
  res.json({ success: true, ...languageCapabilities() });
});

app.use('/api/verification', verificationRateLimit, verificationRoutes);
app.use('/api/voice', verificationRateLimit, voiceRoutes);
app.use('/api/schemes', verificationRateLimit, schemeRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
