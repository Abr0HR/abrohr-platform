import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
dotenv.config();

// Initialize Prisma Client
export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE
// ============================================

// Security
app.use(helmet());

// CORS - Allow frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging (simple)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'AbrO HR Platform API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      attendance: '/api/attendance/*',
      reports: '/api/reports/*',
      psych: '/api/psych/*'
    }
  });
});

// TODO: Import and mount route modules
// import authRoutes from './routes/auth.js';
// import attendanceRoutes from './routes/attendance.js';
// import reportsRoutes from './routes/reports.js';
// import psychRoutes from './routes/psych.js';
// 
// app.use('/api/auth', authRoutes);
// app.use('/api/attendance', attendanceRoutes);
// app.use('/api/reports', reportsRoutes);
// app.use('/api/psych', psychRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`\n🚀 AbrO HR API running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Database connected via Prisma\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
