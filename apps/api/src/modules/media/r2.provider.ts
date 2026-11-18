import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { IStorageProvider, PresignedUploadResult, StorageFile } from './storage.interface.js';
import { config } from '../../config/index.js';

export class R2StorageProvider implements IStorageProvider {
  private client: S3Client;
  private quarantineBucket: string;
  private approvedBucket: string;

  constructor() {
    const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, quarantineBucket, approvedBucket } =
      config.storage;

    if (!r2AccountId || !r2AccessKeyId || !r2SecretAccessKey) {
      throw new Error('Cloudflare R2 credentials are incomplete. Check R2_ACCOUNT_ID and access keys.');
    }

    this.quarantineBucket = quarantineBucket;
    this.approvedBucket = approvedBucket;

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });
  }

  async getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds: number = 900 // 15 mins
  ): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.quarantineBucket,
      Key: storageKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });

    return {
      uploadUrl,
      storageKey,
      expiresInSeconds,
      headers: {
        'Content-Type': mimeType,
      },
    };
  }

  async getSignedPreviewUrl(
    storageKey: string,
    expiresInSeconds: number = 300 // 5 mins
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.quarantineBucket,
      Key: storageKey,
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getObject(storageKey: string): Promise<StorageFile> {
    const command = new GetObjectCommand({
      Bucket: this.quarantineBucket,
      Key: storageKey,
    });

    const response = await this.client.send(command);
    const byteArray = await response.Body?.transformToByteArray();
    const buffer = Buffer.from(byteArray || []);

    return {
      buffer,
      mimeType: response.ContentType || 'application/octet-stream',
      sizeBytes: response.ContentLength || buffer.length,
    };
  }

  async putObject(storageKey: string, buffer: Buffer, mimeType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.quarantineBucket,
      Key: storageKey,
      Body: buffer,
      ContentType: mimeType,
    });

    await this.client.send(command);
  }

  async deleteObject(storageKey: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.quarantineBucket,
      Key: storageKey,
    });

    await this.client.send(command);
  }

  async promoteToApproved(quarantineKey: string, approvedKey: string): Promise<string> {
    // Copy from quarantine bucket to approved bucket
    const copyCommand = new CopyObjectCommand({
      CopySource: `${this.quarantineBucket}/${quarantineKey}`,
      Bucket: this.approvedBucket,
      Key: approvedKey,
    });
    await this.client.send(copyCommand);

    // Clean up from quarantine
    await this.deleteObject(quarantineKey).catch(() => {});

    return `${config.storage.publicDomain}/${approvedKey}`;
  }
}
