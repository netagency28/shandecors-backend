import Redis from 'ioredis';

let redisClient: Redis | null = null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: false,
  });

  redisClient.on('connect', () => console.log('✅ Redis connected'));
  redisClient.on('error', (err: Error) => console.error('❌ Redis error (rate-limiting will fall back to memory):', err.message));
}

export { redisClient };
