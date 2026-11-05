import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { asyncHandler, badRequest, ok } from '../lib/http.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  imageUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Файл не выбран');
    return ok(res, {
      url: `/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
    });
  }),
);

export default router;
