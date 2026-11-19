import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { IStorageProvider, PresignedUploadResult, StorageFile } from './storage.interface.js';
import { config } from '../../config/index.js';

export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;
  private quarantineDir: string;
  private approvedDir: string;

  constructor() {
    this.baseDir = config.storage.localUploadDir;
    this.quarantineDir = path.join(this.baseDir, 'quarantine');
    this.approvedDir = path.join(this.baseDir, 'approved');

    // Ensure storage directories exist
    fs.mkdirSync(this.quarantineDir, { recursive: true });
    fs.mkdirSync(this.approvedDir, { recursive: true });
  }

  /**
   * Sanitizes key to prevent directory traversal attacks.
   */
  private sanitizeKey(storageKey: string): string {
    const clean = path.normalize(storageKey).replace(/^(\.\.[\/\\])+/, '');
    return clean.replace(/^[/\\]+/, '');
  }

  private getFilePath(storageKey: string, isQuarantine: boolean = true): string {
    const sanitized = this.sanitizeKey(storageKey);
    const root = isQuarantine ? this.quarantineDir : this.approvedDir;
    const resolved = path.resolve(root, sanitized);

    if (!resolved.startsWith(root)) {
      throw new Error('Access denied: Arbitrary file path traversal detected.');
    }

    return resolved;
  }

  async getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds: number = 900
  ): Promise<PresignedUploadResult> {
    const signature = crypto.randomBytes(24).toString('hex');
    const port = process.env.TEST_PORT || config.port;
    const uploadUrl = `http://localhost:${port}${config.apiPrefix}/media/local-upload?key=${encodeURIComponent(
      storageKey
    )}&sig=${signature}`;

    return {
      uploadUrl,
      storageKey,
      expiresInSeconds,
      headers: {
        'Content-Type': mimeType,
      },
    };
  }

  async getSignedPreviewUrl(storageKey: string): Promise<string> {
    // Admin preview URL routed through protected media endpoint
    return `http://localhost:${config.port}${config.apiPrefix}/media/preview?key=${encodeURIComponent(
      storageKey
    )}`;
  }

  async getObject(storageKey: string): Promise<StorageFile> {
    let filePath = this.getFilePath(storageKey, true);
    if (!fs.existsSync(filePath)) {
      filePath = this.getFilePath(storageKey, false);
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${storageKey}`);
    }

    const buffer = fs.readFileSync(filePath);
    return {
      buffer,
      mimeType: 'application/octet-stream',
      sizeBytes: buffer.length,
    };
  }

  async putObject(storageKey: string, buffer: Buffer): Promise<void> {
    const filePath = this.getFilePath(storageKey, true);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }

  async deleteObject(storageKey: string): Promise<void> {
    const qPath = this.getFilePath(storageKey, true);
    if (fs.existsSync(qPath)) fs.unlinkSync(qPath);

    const aPath = this.getFilePath(storageKey, false);
    if (fs.existsSync(aPath)) fs.unlinkSync(aPath);
  }

  async promoteToApproved(quarantineKey: string, approvedKey: string): Promise<string> {
    const src = this.getFilePath(quarantineKey, true);
    const dest = this.getFilePath(approvedKey, false);

    if (!fs.existsSync(src)) {
      throw new Error(`Quarantined source file missing: ${quarantineKey}`);
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);

    return `http://localhost:${config.port}${config.apiPrefix}/media/approved/${approvedKey}`;
  }
}
