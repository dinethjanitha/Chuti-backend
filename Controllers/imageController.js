import Message from '../Models/Message.js';
import Chat from '../Models/Chat.js';
import contentMonitoringService from '../services/contentMonitoringService.js';
import path from 'path';
import fs from 'fs';

// Upload image and send as message
export const uploadImage = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Check if chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found'
      });
    }

    if (!chat.isParticipant(userId)) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this chat'
      });
    }

    // Create file URL
    const fileUrl = `/uploads/images/${req.file.filename}`;
    const fullImagePath = path.join(process.cwd(), 'uploads', 'images', req.file.filename);
    
    // 🛡️ MONITOR IMAGE CONTENT FOR INAPPROPRIATE MATERIAL
    try {
      console.log('🔍 Monitoring uploaded image for inappropriate content...');
      const monitoring = await contentMonitoringService.monitorImageContent(
        fullImagePath, 
        userId, 
        chatId
      );
      
      if (monitoring.blocked) {
        console.log('❌ Inappropriate image blocked:', {
          userId,
          chatId,
          filename: req.file.filename,
          reason: monitoring.reason,
          parentNotified: monitoring.parentNotified
        });
        
        // Delete the uploaded file since it's inappropriate
        try {
          fs.unlinkSync(fullImagePath);
          console.log('🗑️ Inappropriate image file deleted');
        } catch (deleteError) {
          console.error('❌ Failed to delete inappropriate image file:', deleteError);
        }
        
        return res.status(400).json({
          success: false,
          message: monitoring.message,
          moderation: {
            blocked: true,
            reason: monitoring.reason,
            parentNotified: monitoring.parentNotified
          }
        });
      }
      
      console.log('✅ Image content approved by monitoring system');
    } catch (monitoringError) {
      console.error('⚠️ Image content monitoring failed:', monitoringError);
      // In production, you might want to block images if monitoring fails
      // For now, we'll allow the image but log the error
      console.warn('⚠️ Allowing image due to monitoring service error (fail-safe)');
    }
    
    // Create image message
    const newMessage = new Message({
      content: req.file.originalname, // Store original filename as content
      messageType: 'image',
      sender: userId,
      chat: chatId,
      fileUrl: fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });

    await newMessage.save();
    await newMessage.populate([
      {
        path: 'sender',
        select: 'username fullName profilePicture'
      }
    ]);

    // Update chat's last message and activity
    chat.lastMessage = newMessage._id;
    chat.lastActivity = new Date();
    await chat.save();

    // Emit to all chat participants
    const io = req.app.get('io');
    chat.participants.forEach(participant => {
      if (participant.isActive) {
        io.to(`user_${participant.user}`).emit('newMessage', newMessage);
      }
    });

    res.status(201).json({
      success: true,
      message: 'Image uploaded and sent successfully',
      data: newMessage
    });

  } catch (error) {
    console.error('Upload image error:', error);
    
    // Clean up uploaded file if message creation failed
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Failed to clean up file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: 'Failed to upload image',
      error: error.message
    });
  }
};

// Get image file
export const getImage = async (req, res) => {
  try {
    const { filename } = req.params;
    const imagePath = path.join(process.cwd(), 'uploads', 'images', filename);

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Image not found'
      });
    }

    // Get file stats for content length
    const stats = fs.statSync(imagePath);
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'image/jpeg'); // You might want to detect actual type
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    
    // Stream the file
    const fileStream = fs.createReadStream(imagePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve image'
    });
  }
};
