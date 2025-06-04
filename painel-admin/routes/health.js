import express from 'express';
import { redisClient } from '../db/redis.js';
import pool from '../db/index.js';

const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    // Verificar conexão com PostgreSQL
    await pool.query('SELECT 1');
    
    // Verificar conexão com Redis
    await redisClient.ping();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;