import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { createFsAdapter } from './adapters/fsAdapter';
import { AnnotationService } from './services/annotationService';
import { createImageRouter } from './routes/images';
import { createAnnotationRouter } from './routes/annotations';
import { attachAuth } from './middleware/auth';
import { logger } from './utils/logger';
import fs from "fs";
console.log("CWD=", process.cwd());
console.log("IMAGE_ROOT(.env)=", process.env.IMAGE_ROOT);
console.log("IMAGE_EXTS(.env)=", process.env.IMAGE_EXTS);

try {
  const files = fs.readdirSync(process.env.IMAGE_ROOT || "");
  console.log("readdir(IMAGE_ROOT) =>", files);
} catch (e) {
  console.error("readdir failed:", e);
}

const PORT = Number(process.env.PORT ?? 4000);
const IMAGE_ROOT = process.env.IMAGE_ROOT ?? path.resolve(process.cwd(), 'mock-data/images');
const ANNOTATION_ROOT = process.env.ANNOTATION_ROOT ?? path.resolve(process.cwd(), 'mock-data/annotations');
const READ_ONLY = process.env.READ_ONLY === 'true';

async function bootstrap() {
  const app = express();
  const adapter = createFsAdapter({ imageRoot: IMAGE_ROOT, annotationRoot: ANNOTATION_ROOT, readOnly: READ_ONLY });
  await adapter.ensureReady();
  const service = new AnnotationService(adapter);

  app.disable('x-powered-by');
  app.use(morgan('tiny'));
  app.use(express.json({ limit: '5mb' }));
  app.use(attachAuth);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/images', createImageRouter(service));
  app.use('/api/annotations', createAnnotationRouter(service));

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(err.status || 500).json({ message: 'Internal Server Error' });
  });

  app.listen(PORT, () => {
    logger.info({ port: PORT, imageRoot: IMAGE_ROOT, annotationRoot: ANNOTATION_ROOT }, 'server listening');
  });
}

bootstrap().catch((error) => {
  logger.error(error, 'Failed to start server');
  process.exit(1);
});
