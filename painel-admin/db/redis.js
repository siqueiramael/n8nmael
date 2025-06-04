import { createClient } from 'redis';

// Estado global da conexão
let client = null;
let isConnected = false;
let connectionPromise = null;

// Configuração do Redis
const redisConfig = {
  socket: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    connectTimeout: 10000,
    lazyConnect: true
  },
  database: parseInt(process.env.REDIS_DB) || 0
};

if (process.env.REDIS_PASSWORD) {
  redisConfig.password = process.env.REDIS_PASSWORD;
}

// Função para criar cliente (singleton)
function createRedisClient() {
  if (client) return client;
  
  client = createClient(redisConfig);
  
  // Event listeners apenas uma vez
  client.on('error', (err) => {
    console.error('Redis Error:', err.message);
    isConnected = false;
  });
  
  client.on('connect', () => {
    console.log('🔌 Redis connecting...');
  });
  
  client.on('ready', () => {
    console.log('✅ Redis ready');
    isConnected = true;
  });
  
  client.on('end', () => {
    console.log('🔌 Redis disconnected');
    isConnected = false;
  });
  
  return client;
}

// Função de conexão com proteção
export async function connectRedis() {
  if (isConnected && client) {
    console.log('✅ Redis already connected');
    return client;
  }
  
  if (connectionPromise) {
    console.log('⏳ Waiting for existing connection...');
    return connectionPromise;
  }
  
  try {
    console.log('🔄 Connecting to Redis...');
    
    if (!client) {
      client = createRedisClient();
    }
    
    connectionPromise = client.connect();
    await connectionPromise;
    
    console.log('✅ Redis connected successfully');
    isConnected = true;
    connectionPromise = null;
    
    return client;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    connectionPromise = null;
    isConnected = false;
    throw error;
  }
}

// Cache Manager simplificado
export class CacheManager {
  constructor() {
    this.client = null;
  }
  
  async ensureConnection() {
    if (!this.client || !isConnected) {
      this.client = await connectRedis();
    }
    return this.client;
  }
  
  async get(key) {
    try {
      const client = await this.ensureConnection();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error.message);
      return null;
    }
  }
  
  async set(key, value, ttl = 3600) {
    try {
      const client = await this.ensureConnection();
      await client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error.message);
      return false;
    }
  }
  
  async del(key) {
    try {
      const client = await this.ensureConnection();
      await client.del(key);
      return true;
    } catch (error) {
      console.error('Cache del error:', error.message);
      return false;
    }
  }
}

// Função para fechar conexão
export async function closeRedis() {
  if (client && isConnected) {
    try {
      await client.quit();
      console.log('✅ Redis connection closed');
    } catch (error) {
      console.error('Error closing Redis:', error.message);
    }
  }
  client = null;
  isConnected = false;
  connectionPromise = null;
}

// Exports
export { client as redisClient };
export default { connectRedis, closeRedis, CacheManager };