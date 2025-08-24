import express from 'express';
import { uploadImage, getImage } from '../Controllers/imageController.js';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Upload image
router.post('/upload', protect, upload.single('image'), uploadImage);

// Get image
router.get('/:filename', getImage);

export default router;
