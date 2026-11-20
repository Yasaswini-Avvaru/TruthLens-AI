import 'dotenv/config';
import app from './app.js';
import mongoose from 'mongoose';
import { connectDatabase } from './config/db.js';

const port = Number(process.env.PORT) || 5000;

if (process.env.MONGODB_URI) {
  try {
    await connectDatabase();
  } catch {
    console.warn('MongoDB is unavailable; starting the API in degraded mode. Database-backed features and saved history will be unavailable until the database reconnects.');
  }
} else {
  console.warn('MONGODB_URI is not configured; starting without database access.');
}

const server = app.listen(port, () => console.log(`TRUTHLENS API listening on port ${port}`));
server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other backend process or set a different PORT in backend/.env and the matching VITE_API_BASE_URL in frontend/.env.`);
  } else {
    console.error(`Backend could not listen on port ${port}: ${error.message}`);
  }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
