import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

// Initialize Firebase (import to initialize)
import './config/firebase.js';

// Import routes
import authRoutes from "./Routes/authRoutes.js";
import userRoutes from "./Routes/userRoutes.js";
import chatRoutes from "./Routes/chatRoutes.js";
import messageRoutes from "./Routes/messageRoutes.js";
import imageRoutes from "./Routes/imageRoutes.js";
import debugRoutes from "./routes/debug.js";

// Load environment variables
dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`\n [${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Full URL:', req.originalUrl);
  console.log('Origin:', req.get('Origin') || 'Not specified');
  console.log('Headers:', {
    'Content-Type': req.get('Content-Type'),
    'Authorization': req.get('Authorization') ? '***PROVIDED***' : 'Not provided',
    'User-Agent': req.get('User-Agent')
  });
  if (Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  if (Object.keys(req.query).length > 0) {
    console.log('Query:', req.query);
  }
  console.log('─'.repeat(50));
  
  // Response logging
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`\n${new Date().toISOString()}] Response ${res.statusCode} for ${req.method} ${req.path}`);
    console.log('Response Body:', typeof data === 'string' ? data.substring(0, 200) + (data.length > 200 ? '...' : '') : data);
    console.log('═'.repeat(50));
    originalSend.call(this, data);
  };
  
  next();
});



const corsOption = {
  origin: [
    "http://localhost:8082",
    "http://localhost:8081", // Default Expo port
    "http://localhost:8083", // Alternative Expo port
    "http://localhost:19006", // Expo web port
    "exp://localhost:19000", // Expo mobile
    "exp://192.168.8.145:8082", // Your Expo mobile app
    "exp://192.168.8.145:8082", // Your Expo mobile app
    "exp://192.168.8.137:8081", // Your Expo mobile app
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOption));

// Basic route for health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Child Safe Chat App Backend API',
    status: 'Running',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/debug', debugRoutes);

// Serve static files (uploaded images)
app.use('/uploads', express.static('uploads'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

export default app;