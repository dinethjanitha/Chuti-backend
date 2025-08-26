import express from 'express';
import { protect } from '../middleware/auth.js';
import { checkSexualContent, checkModerationHealth } from '../middleware/moderationMiddleware.js';

const router = express.Router();

// Test endpoint to check sexual content moderation
router.post('/test-sexual-content', protect, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text is required'
      });
    }

    const result = await checkSexualContent(text);
    
    res.status(200).json({
      success: true,
      message: 'Content moderation check completed',
      data: {
        text: text,
        is_sexual: result.is_sexual,
        message: result.message,
        service_response: result.raw_response
      }
    });

  } catch (error) {
    console.error('Test sexual content error:', error);
    res.status(500).json({
      success: false,
      message: 'Moderation test failed',
      error: error.message
    });
  }
});

// Health check endpoint for moderation service
router.get('/health', async (req, res) => {
  try {
    const health = await checkModerationHealth();
    
    res.status(200).json({
      success: true,
      message: 'Moderation service health check',
      data: health
    });

  } catch (error) {
    console.error('Moderation health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message
    });
  }
});

export default router;
