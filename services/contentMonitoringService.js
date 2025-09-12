import User from '../Models/User.js';
import Chat from '../Models/Chat.js';
import { sendParentContentAlert } from './emailService.js';
import { checkSexualContent } from '../middleware/moderationMiddleware.js';


class ContentMonitoringService {
  constructor() {
    console.log('Content Monitoring Service initialized');
  }

  /**
   * Quick content check - Returns immediately without sending emails
   * @param {string} content - The text content to monitor
   * @param {string} senderId - ID of the user sending the content
   * @returns {Promise<Object>} Quick moderation result
   */
  async quickContentCheck(content, senderId) {
    try {
      console.log('Quick content check for immediate UI response...');
      
      // Check for sexual content using fast moderation
      const moderationResult = await checkSexualContent(content);
      
      if (moderationResult.is_sexual) {
        console.log('Sexual content detected - blocking immediately');
        
        return {
          blocked: true,
          reason: 'sexual_content',
          message: 'Your message contains inappropriate content and has been blocked. Please keep conversations appropriate.'
        };
      }

      console.log('Content approved in quick check');
      return { blocked: false, approved: true };

    } catch (error) {
      console.error('Error in quick content check:', error);
      return { blocked: false, error: error.message };
    }
  }

  /**
   * Send parent notification asynchronously (runs in background)
   * @param {string} content - The blocked content
   * @param {string} senderId - ID of the user who sent content
   * @param {string} chatId - ID of the chat
   * @param {string} contentType - Type of content ('text' or 'image')
   */
  async sendParentNotificationAsync(content, senderId, chatId, contentType = 'text') {
    // Run this asynchronously without blocking the main flow
    setImmediate(async () => {
      try {
        console.log('📧 Sending parent notification asynchronously...');
        
        // Get sender information
        const sender = await User.findById(senderId).select('username email fullName parentEmail age');
        if (!sender) {
          console.error('❌ Sender not found for parent notification');
          return;
        }

        // Only send notification if user has parent email (children under 13)
        if (!sender.parentEmail) {
          console.log('ℹ️ No parent email found - notification skipped');
          return;
        }

        // Get chat information for context
        const chat = await Chat.findById(chatId).populate('participants.user', 'username email');
        
        try {
          const chatParticipants = chat ? chat.participants
            .filter(p => p.user._id.toString() !== senderId)
            .map(p => p.user.username)
            .join(', ') : 'Unknown';

          await sendParentContentAlert(
            sender.parentEmail,
            sender.fullName || sender.username,
            sender.email,
            contentType,
            {
              chatType: chat?.chatType || 'unknown',
              otherParticipants: chatParticipants,
              contentPreview: contentType === 'text' ? content.substring(0, 50) + '...' : 'Image content'
            }
          );
          
          console.log('✅ Parent notification sent successfully (async)');
        } catch (emailError) {
          console.error('❌ Failed to send parent notification (async):', emailError);
        }

        // Log the incident for admin review
        this.logContentIncident({
          type: contentType,
          userId: senderId,
          chatId,
          content: contentType === 'text' ? content.substring(0, 100) + '...' : 'Image content',
          parentNotified: true,
          timestamp: new Date()
        });

      } catch (error) {
        console.error('❌ Error in async parent notification:', error);
      }
    });
  }

  /**
   * Monitor text content for inappropriate material (FAST VERSION)
   * @param {string} content - The text content to monitor
   * @param {string} senderId - ID of the user sending the content
   * @param {string} chatId - ID of the chat where content was sent
   * @returns {Promise<Object>} Monitoring result
   */
  async monitorTextContent(content, senderId, chatId) {
    try {
      console.log('🔍 Fast monitoring text content...');
      
      // Step 1: Quick check and immediate block if needed
      const quickCheck = await this.quickContentCheck(content, senderId);
      
      if (quickCheck.blocked) {
        // Step 2: Send parent notification asynchronously (doesn't block response)
        this.sendParentNotificationAsync(content, senderId, chatId, 'text');
        
        // Return immediately to UI
        return quickCheck;
      }

      console.log('✅ Text content approved');
      return { blocked: false, approved: true };

    } catch (error) {
      console.error('❌ Error monitoring text content:', error);
      return { blocked: false, error: error.message };
    }
  }

  /**
   * Monitor image content for inappropriate material
   * @param {string} imagePath - Path to the image file
   * @param {string} senderId - ID of the user sending the image
   * @param {string} chatId - ID of the chat where image was sent
   * @returns {Promise<Object>} Monitoring result
   */
  async monitorImageContent(imagePath, senderId, chatId) {
    try {
      console.log('🔍 Monitoring image content for inappropriate material...');
      
      // Try to call external moderation service
      let imageModeration = {
        is_inappropriate: false,
        confidence: 0,
        categories: [],
        service_available: false
      };

      try {
        // Check if the moderation service is available
        const axios = (await import('axios')).default;
        const FormData = (await import('form-data')).default;
        const fs = (await import('fs')).default;
        
        console.log('📡 Attempting to contact image moderation service...');
        
        // Create form data with the image file
        const formData = new FormData();
        formData.append('file', fs.createReadStream(imagePath));
        
        // Call the external moderation API
        const moderationResponse = await axios.post(
          `${process.env.CONTENT_MODERATION_URL || 'http://192.168.8.137:5005'}/v1/api/check-image`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
            },
            timeout: 10000, // 10 second timeout
          }
        );
        
        const result = moderationResponse.data;
        imageModeration = {
          is_inappropriate: result.result === true,
          confidence: result.confidence || 0,
          categories: result.categories || [],
          service_available: true,
          raw_response: result
        };
        
        console.log('✅ Image moderation service responded:', {
          is_inappropriate: imageModeration.is_inappropriate,
          confidence: imageModeration.confidence
        });
        
      } catch (serviceError) {
        console.error('⚠️ Image moderation service unavailable:', serviceError.message);
        // In production, you might want to block images if the service is unavailable
        // For now, we'll allow images when the service is down (fail-safe approach)
        imageModeration.service_available = false;
      }

      if (imageModeration.is_inappropriate) {
        console.log('🚨 Inappropriate image detected - blocking immediately');
        
        // Send parent notification asynchronously (doesn't block response)
        this.sendParentNotificationAsync(imagePath, senderId, chatId, 'image');

        return {
          blocked: true,
          reason: 'inappropriate_image',
          message: 'Your image contains inappropriate content and has been blocked.',
          details: {
            confidence: imageModeration.confidence,
            categories: imageModeration.categories
          }
        };
      }

      console.log('✅ Image content approved');
      return { blocked: false, approved: true, service_available: imageModeration.service_available };

    } catch (error) {
      console.error('❌ Error monitoring image content:', error);
      return { blocked: false, error: error.message };
    }
  }

  /**
   * Log content incidents for admin review and analytics
   * @param {Object} incident - Incident details
   */
  logContentIncident(incident) {
    try {
      console.log('📝 Logging content incident:', {
        type: incident.type,
        userId: incident.userId,
        chatId: incident.chatId,
        timestamp: incident.timestamp,
        parentNotified: incident.parentNotified
      });
      
      // TODO: Store in database for admin dashboard and analytics
      // In production, you might want to:
      // - Store incidents in a separate collection
      // - Create admin dashboard for reviewing incidents
      // - Generate analytics and reports
      // - Track repeat offenders
      
    } catch (error) {
      console.error('❌ Error logging content incident:', error);
    }
  }

  /**
   * Get user's parent email for notifications
   * @param {string} userId - User ID
   * @returns {Promise<string|null>} Parent email if available
   */
  async getUserParentEmail(userId) {
    try {
      const user = await User.findById(userId).select('parentEmail age');
      return user?.parentEmail || null;
    } catch (error) {
      console.error('❌ Error getting user parent email:', error);
      return null;
    }
  }

  /**
   * Check if user requires parent notification (under 13)
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Whether parent notification is required
   */
  async requiresParentNotification(userId) {
    try {
      const user = await User.findById(userId).select('age parentEmail');
      return user && user.age < 13 && user.parentEmail;
    } catch (error) {
      console.error('❌ Error checking parent notification requirement:', error);
      return false;
    }
  }
}

// Create singleton instance
const contentMonitoringService = new ContentMonitoringService();

export default contentMonitoringService;

// Named exports for convenience
export {
  ContentMonitoringService
};
