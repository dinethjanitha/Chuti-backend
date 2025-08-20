import mongoose from 'mongoose';
import { createServer } from 'http';
import app from './app.js';
import dotenv from 'dotenv';
import SocketService from './services/socketService.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/child-safe-chat';

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('Unhandled Promise Rejection:', err.message);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err.message);
  process.exit(1);
});

// Connect to database and start server
const startServer = async () => {
  try {
    await connectDB();
    
    // Create HTTP server
    const server = createServer(app);
    
    // Initialize Socket.IO
    console.log('🔌 Initializing Socket.IO...');
    const socketService = new SocketService(server);
    
    // Make Socket.IO instance available to routes
    app.set('io', socketService.io);
    app.set('socketService', socketService);
    
    // Add Socket.IO status logging
    socketService.io.engine.on("connection_error", (err) => {
      console.log('<> Socket.IO Connection Error:');
      console.log('├── Error Code:', err.code);
      console.log('├── Error Message:', err.message);
      console.log('├── Error Context:', err.context);
      console.log('└── Error Type:', err.type);
    });

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      });

    // Graceful shutdown
    const gracefulShutdown = () => {
      console.log('Shutting down gracefully...');
      server.close(() => {
        console.log('HTTP server closed');
        mongoose.connection.close(() => {
          console.log('MongoDB connection closed');
          process.exit(0);
        });
      });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();