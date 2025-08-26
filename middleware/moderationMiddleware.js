import axios from 'axios';

/**
 * Custom Content Moderation Service Client
 * Communicates with your custom sexual content detection server
 */
class ContentModerationService {
  constructor() {
    this.baseUrl = process.env.CONTENT_MODERATION_URL || 'http://127.0.0.1:5005';
    this.timeout = 3000; // 3 seconds timeout for fast response
    
    console.log('🔧 ContentModerationService initialized with baseUrl:', this.baseUrl);
  }

  /**
   * Check if the moderation service is healthy
   */
  async healthCheck() {
    try {
      const response = await axios.get(`${this.baseUrl}/health`, {
        timeout: this.timeout
      });
      return response.data;
    } catch (error) {
      console.error('❌ Content moderation service health check failed:', error.message);
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Check if text contains sexual content
   * @param {string} text - The text to check
   * @returns {Promise<Object>} Moderation result
   */
  async checkSexualContent(text) {
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return {
          is_sexual: false,
          message: 'Empty text - approved',
          error: null
        };
      }

      console.log(`🔍 Checking sexual content: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

      const response = await axios.post(`${this.baseUrl}/v1/api/check-mzg`, {
        text: text.trim()
      }, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = response.data;
      const is_sexual = result.result === true;
      
      console.log(`${is_sexual ? '❌' : '✅'} Sexual content check result:`, {
        is_sexual,
        original_result: result.result
      });

      return {
        is_sexual,
        message: is_sexual ? 'Sexual content detected - blocked' : 'Content approved',
        raw_response: result
      };

    } catch (error) {
      console.error('❌ Sexual content check error:', error.message);
      
      // If moderation service is down, log but don't block the message (fail-safe)
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        console.warn('⚠️ Content moderation service unavailable - allowing message');
        return {
          is_sexual: false,
          message: 'Moderation service unavailable - approved',
          error: 'service_unavailable'
        };
      }

      // For other errors, also allow but log
      return {
        is_sexual: false,
        message: 'Moderation error - approved',
        error: error.message
      };
    }
  }
}

// Create a singleton instance
const contentModerationService = new ContentModerationService();

/**
 * Express middleware for sexual content moderation
 */
export const sexualContentMiddleware = async (req, res, next) => {
  try {
    const { content } = req.body;
    
    // Skip moderation if no content or not a string
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return next();
    }
    
    console.log('🛡️ Running sexual content moderation middleware...');
    
    // Check for sexual content using your custom service
    const moderation = await contentModerationService.checkSexualContent(content);
    
    if (moderation.is_sexual) {
      console.log('❌ Sexual content detected and blocked:', {
        text: content.substring(0, 50) + '...',
        service_response: moderation.raw_response
      });
      
      return res.status(400).json({
        success: false,
        message: 'Your message contains inappropriate content and has been blocked. Please keep conversations appropriate.',
        moderation: {
          blocked: true,
          reason: 'sexual_content',
          detected: true
        }
      });
    }
    
    console.log('✅ Content approved - no sexual content detected');
    
    // Add moderation result to request for logging
    req.moderation = moderation;
    next();
    
  } catch (error) {
    console.error('⚠️ Sexual content moderation middleware error:', error.message);
    
    // In case of moderation service failure, log the error but allow the content (fail-safe)
    // This ensures your app doesn't break if the moderation service is down
    console.warn('⚠️ Allowing content due to moderation service error');
    next();
  }
};

/**
 * Socket.IO sexual content moderation helper
 * Can be used in socket event handlers for real-time checking
 */
export const moderateSocketMessage = async (content) => {
  try {
    return await contentModerationService.checkSexualContent(content);
  } catch (error) {
    console.error('❌ Socket sexual content moderation error:', error.message);
    
    // Return safe default
    return {
      is_sexual: false,
      message: 'Moderation error - approved',
      error: error.message
    };
  }
};

/**
 * Quick check function for sexual content
 */
export const checkSexualContent = async (text) => {
  try {
    return await contentModerationService.checkSexualContent(text);
  } catch (error) {
    console.error('❌ Sexual content check error:', error.message);
    return {
      is_sexual: false,
      message: 'Check failed - approved',
      error: error.message
    };
  }
};

/**
 * Health check function for monitoring your moderation service
 */
export const checkModerationHealth = async () => {
  try {
    return await contentModerationService.healthCheck();
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Legacy exports for backward compatibility
export const moderateText = checkSexualContent;
export const textModerationMiddleware = sexualContentMiddleware;
export const checkModerationService = checkModerationHealth;

export default contentModerationService;
