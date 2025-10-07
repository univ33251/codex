import { Router } from 'express';
import fs from 'fs';
import mime from 'mime-types';
import { AnnotationService } from '../services/annotationService';

export const createImageRouter = (service: AnnotationService) => {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { cursor, limit } = req.query;
      const result = await service.listImages(
        typeof cursor === 'string' ? cursor : undefined,
        limit ? Number(limit) : undefined
      );
      res.json({ items: result.items.map(({ path: _path, ...rest }) => rest), nextCursor: result.nextCursor });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const filePath = await service.getImagePath(req.params.id);
      const stream = fs.createReadStream(filePath);
      const stat = await fs.promises.stat(filePath);
      const range = req.headers.range;
      const contentType = mime.lookup(filePath) || 'application/octet-stream';
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
        const start = Number(startStr);
        const end = endStr ? Number(endStr) : stat.size - 1;
        res.status(206);
        res.set({
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': contentType,
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.set({
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=60',
        });
        stream.pipe(res);
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
};
