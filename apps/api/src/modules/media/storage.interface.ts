export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
  headers?: Record<string, string>;
}

export interface StorageFile {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  /**
   * Generates a pre-signed PUT URL for uploading directly to quarantine.
   */
  getPresignedUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds?: number
  ): Promise<PresignedUploadResult>;

  /**
   * Generates a short-lived signed GET URL for secure administrator preview of quarantined media.
   */
  getSignedPreviewUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Retrieves an object's bytes from storage for inspection or serving.
   */
  getObject(storageKey: string): Promise<StorageFile>;

  /**
   * Puts raw buffer into storage directly (used by local adapter or upload endpoint).
   */
  putObject(storageKey: string, buffer: Buffer, mimeType: string): Promise<void>;

  /**
   * Deletes an object from storage.
   */
  deleteObject(storageKey: string): Promise<void>;

  /**
   * Promotes an object from the quarantine bucket to the approved bucket upon moderation approval.
   */
  promoteToApproved(quarantineKey: string, approvedKey: string): Promise<string>;
}
