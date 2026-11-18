import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || 'dev_session_secret_for_local_testing_purposes_min_32_chars',
  sessionCookieName: 'fizzy_session',
  sessionMaxAgeMs: parseInt(process.env.SESSION_MAX_AGE_MS || '86400000', 10), // 24 hours
  databaseUrl: process.env.DATABASE_URL || '',
  adminBootstrap: {
    username: process.env.ADMIN_BOOTSTRAP_USERNAME || 'safety_admin',
    email: process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@fizzy.local',
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Password123!',
    displayName: process.env.ADMIN_BOOTSTRAP_NAME || 'Captain Moderator',
  },
  // Storage & Cloudflare R2 / S3 Configuration
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local', // 'r2' | 's3' | 'local'
    r2AccountId: process.env.R2_ACCOUNT_ID,
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    quarantineBucket: process.env.R2_BUCKET_QUARANTINE || 'fizzy-media-quarantine',
    approvedBucket: process.env.R2_BUCKET_APPROVED || 'fizzy-media-approved',
    publicDomain: process.env.R2_PUBLIC_DOMAIN || 'http://localhost:4000/media-cdn',
    localUploadDir: path.resolve(process.cwd(), 'uploads'),
    // Limits
    maxPhotoSizeBytes: 10 * 1024 * 1024, // 10MB
    maxVideoSizeBytes: 50 * 1024 * 1024, // 50MB
    maxVideoDurationSeconds: 60, // 60 seconds
  },
};
