import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, isOriginAllowed } from './config';
import { helmetOptions, globalLimiter, authLimiter } from './config/security';
import { supabaseAdmin } from './config/supabase';
import authRouter from './routers/authRouter';
import adminRouter from './routers/adminRouter';
import studentRouter from './routers/studentRouter';
import instructorRouter from './routers/instructorRouter';

const app = express();

// Detrás de un proxy (Railway): confiar solo en el primer salto para obtener
// la IP real del cliente (necesario para que el rate limiting cuente por IP).
app.set('trust proxy', 1);

// Sprint 2 · capas 1-2: cabeceras de seguridad endurecidas (HSTS, CSP, referrer).
// Reemplaza helmet() por defecto con opciones explícitas y trazables (riesgo R2).
app.use(helmet(helmetOptions));
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, origin ?? true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));

// Sprint 2 · capa 3: rate limiting global 60 req/min/IP (riesgo R3).
app.use(globalLimiter);

// Límite estricto adicional en autenticación para frenar fuerza bruta (DoD #2).
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/student', studentRouter);
app.use('/api/instructor', instructorRouter);

/** Endpoint público para keep-alive: que un cron externo llame cada 10 min para que backend y Supabase no se duerman. */
app.get('/health', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  let db = 'unknown';
  try {
    await supabaseAdmin.from('user_profiles').select('id').limit(1).maybeSingle();
    db = 'ok';
  } catch {
    db = 'error';
  }
  res.json({ status: 'ok', timestamp, db });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(config.port, () => {
  console.log(`Colorados Drive API running on port ${config.port}`);
});
