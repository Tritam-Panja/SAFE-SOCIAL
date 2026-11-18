import { IStorageProvider } from './storage.interface.js';
import { R2StorageProvider } from './r2.provider.js';
import { LocalStorageProvider } from './local.provider.js';
import { config } from '../../config/index.js';

let storageInstance: IStorageProvider | null = null;

export function getStorageProvider(): IStorageProvider {
  if (!storageInstance) {
    const hasR2 =
      config.storage.r2AccountId &&
      config.storage.r2AccessKeyId &&
      config.storage.r2SecretAccessKey &&
      config.storage.driver === 'r2';

    if (hasR2) {
      console.log('[Storage] Initializing Cloudflare R2 storage provider.');
      storageInstance = new R2StorageProvider();
    } else {
      console.log('[Storage] Initializing local isolated development storage provider.');
      storageInstance = new LocalStorageProvider();
    }
  }
  return storageInstance;
}
