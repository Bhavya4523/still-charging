import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import aiRouter from './routes/ai.js';

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });
const port = Number(process.env.PORT || process.env.BACKEND_PORT || 3001);
const frontendDist = path.resolve(here, '../../frontend/dist');

app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://api.groq.com'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '16kb' }));
app.get('/api/health', (_req, res) => res.json({
  ok: true,
  localAiOptional: true,
  cloudAiConfigured: Boolean(process.env.GROQ_API_KEY)
}));
app.use('/api/ai', aiRouter);

app.use(express.static(frontendDist, { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

app.listen(port, '0.0.0.0', () => console.log(`Still Charging backend listening on ${port}`));
