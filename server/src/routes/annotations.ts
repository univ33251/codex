import { Router } from 'express';
import { AnnotationService } from '../services/annotationService';
import { logger } from '../utils/logger';

export const createAnnotationRouter = (service: AnnotationService) => {
  const router = Router();

  router.get('/:imageId', async (req, res, next) => {
    try {
      const data = await service.getAnnotation(req.params.imageId);
      if (!data) {
        res.json(null);
      } else {
        res.json(data);
      }
    } catch (error) {
      next(error);
    }
  });

  const handleSave = async (req: any, res: any, next: any, autosave = false) => {
    try {
      await service.saveAnnotation(req.params.imageId, req.body);
      logger.info({ imageId: req.params.imageId, autosave, user: req.auth?.userId }, 'annotation saved');
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  router.post('/:imageId', async (req, res, next) => {
    await handleSave(req, res, next, false);
  });

  router.post('/:imageId/autosave', async (req, res, next) => {
    await handleSave(req, res, next, true);
  });

  return router;
};
