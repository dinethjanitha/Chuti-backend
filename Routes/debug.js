import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public socket status endpoint (no auth required for easier testing)
router.get('/socket-info', (req, res) => {
  try {
    const socketService = req.app.get('socketService');
    const io = req.app.get('io');
    
    if (!socketService || !io) {
      return res.json({
        success: false,
        message: 'Socket service not initialized',
        socketService: !!socketService,
        io: !!io
      });
    }

    res.json({
      success: true,
      data: {
        socketIO: {
          initialized: true,
          engineClientsCount: io.engine.clientsCount,
          socketsCount: io.sockets.sockets.size,
          transports: ['websocket', 'polling']
        },
        socketService: {
          initialized: true,
          connectedUsersCount: socketService.getConnectedUsersCount(),
          userSocketsMapSize: socketService.userSockets.size
        },
        server: {
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          nodeVersion: process.version
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting socket info',
      error: error.message
    });
  }
});

// Get socket connection status
router.get('/socket-status', protect, (req, res) => {
  try {
    const socketService = req.app.get('socketService');
    const io = req.app.get('io');
    
    if (!socketService || !io) {
      return res.status(500).json({
        success: false,
        message: 'Socket service not available'
      });
    }

    // Get all connected sockets with details
    const connectedSockets = [];
    io.sockets.sockets.forEach((socket, socketId) => {
      connectedSockets.push({
        socketId: socketId,
        userId: socket.userId,
        username: socket.user?.username,
        rooms: Array.from(socket.rooms),
        connected: socket.connected,
        transport: socket.conn?.transport?.name,
        handshake: {
          address: socket.handshake.address,
          time: socket.handshake.time,
          headers: {
            'user-agent': socket.handshake.headers['user-agent'],
            'origin': socket.handshake.headers.origin
          }
        }
      });
    });

    const connectedUsersCount = socketService.getConnectedUsersCount();
    const userStatus = socketService.getUserStatus(req.user.id);

    res.json({
      success: true,
      data: {
        socketService: {
          totalConnectedUsers: connectedUsersCount,
          currentUserConnected: userStatus,
          currentUserId: req.user.id,
          connectedUsers: Array.from(socketService.connectedUsers.keys()),
          userSocketsMapSize: socketService.userSockets.size
        },
        io: {
          engine: {
            clientsCount: io.engine.clientsCount,
            transports: ['websocket', 'polling']
          },
          sockets: {
            totalSockets: io.sockets.sockets.size,
            connectedSockets: connectedSockets
          }
        },
        server: {
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          nodeVersion: process.version,
          platform: process.platform
        }
      }
    });
  } catch (error) {
    console.error('Debug socket-status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get socket status',
      error: error.message
    });
  }
});

// Test socket emit
router.post('/test-socket-emit', protect, (req, res) => {
  try {
    const { event, data, targetUserId, targetChatId } = req.body;
    const socketService = req.app.get('socketService');

    if (!socketService) {
      return res.status(500).json({
        success: false,
        message: 'Socket service not available'
      });
    }

    if (targetUserId) {
      socketService.emitToUser(targetUserId, event, data);
    } else if (targetChatId) {
      socketService.emitToChat(targetChatId, event, data);
    } else {
      socketService.emitToAll(event, data);
    }

    res.json({
      success: true,
      message: `Socket event '${event}' emitted successfully`,
      data: {
        event,
        data,
        targetUserId,
        targetChatId,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to emit socket event',
      error: error.message
    });
  }
});

export default router;
