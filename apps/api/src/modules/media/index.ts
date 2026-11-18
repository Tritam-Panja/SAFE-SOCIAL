import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { prisma } from '../../prisma.js';
import { getStorageProvider } from './storage.factory.js';
import { inspectFileBytes } from './media-validator.js';
import { extractVideoMetadata, generateVideoThumbnail } from './video-processor.js';
import { validateRequest } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requestUploadUrlSchema, completeUploadSchema, RequestUploadUrlInput, CompleteUploadInput } from '@fizzy/validation';
import { config } from '../../config/index.js';
import { UserRole, MediaType } from '../../generated/prisma-client/index.js';

export const mediaRouter = Router();

const upload = multer({
  limits: {
    fileSize: config.storage.maxVideoSizeBytes,
  },
  storage: multer.memoryStorage(),
});

/**
 * Generates an isolated, safe quarantine storage key.
 * Format: quarantine/{userId}/{mediaType}_{timestamp}_{randomHex}.{ext}
 */
function generateQuarantineKey(userId: string, mediaType: string, ext: string): string {
  const rand = crypto.randomBytes(8).toString('hex');
  const cleanExt = ext.replace(/^\./, '').toLowerCase();
  return `quarantine/${userId}/${mediaType.toLowerCase()}_${Date.now()}_${rand}.${cleanExt}`;
}

/**
 * POST /api/v1/media/upload-url
 * Step 1: Child or Admin requests permission to upload media to quarantine.
 */
mediaRouter.post(
  '/upload-url',
  requireAuth,
  validateRequest(requestUploadUrlSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const input = req.body as RequestUploadUrlInput;

      // Validate size limits
      if (input.mediaType === 'IMAGE' || input.mediaType === 'THUMBNAIL') {
        if (input.fileSizeBytes > config.storage.maxPhotoSizeBytes) {
          res.status(400).json({
            success: false,
            data: null,
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Images cannot exceed ${config.storage.maxPhotoSizeBytes / (1024 * 1024)}MB.`,
            },
          });
          return;
        }
      } else if (input.mediaType === 'VIDEO') {
        if (input.fileSizeBytes > config.storage.maxVideoSizeBytes) {
          res.status(400).json({
            success: false,
            data: null,
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Videos cannot exceed ${config.storage.maxVideoSizeBytes / (1024 * 1024)}MB.`,
            },
          });
          return;
        }
      }

      // Extract file extension safely
      const ext = input.fileName.split('.').pop() || 'bin';
      const storageKey = generateQuarantineKey(user.id, input.mediaType, ext);

      const storage = getStorageProvider();
      const presigned = await storage.getPresignedUploadUrl(storageKey, input.mimeType);

      res.status(200).json({
        success: true,
        data: {
          uploadUrl: presigned.uploadUrl,
          storageKey: presigned.storageKey,
          expiresInSeconds: presigned.expiresInSeconds,
          headers: presigned.headers,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/media/local-upload
 * Local dev adapter endpoint matching pre-signed PUT upload behavior.
 */
mediaRouter.put(
  '/local-upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const storageKey = req.query.key as string;
      if (!storageKey) {
        res.status(400).send('Missing key parameter');
        return;
      }

      let buffer: Buffer | undefined;
      let mime = 'application/octet-stream';

      if (req.file) {
        buffer = req.file.buffer;
        mime = req.file.mimetype;
      } else if (req.body && Buffer.isBuffer(req.body)) {
        buffer = req.body;
        mime = (req.headers['content-type'] as string) || mime;
      }

      if (!buffer) {
        // Collect raw body if sent as raw bytes
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
        mime = (req.headers['content-type'] as string) || mime;
      }

      const storage = getStorageProvider();
      await storage.putObject(storageKey, buffer, mime);

      res.status(200).json({ success: true, message: 'Uploaded to local quarantine' });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/media/complete
 * Step 2: Verification of uploaded file, binary magic bytes validation, and MediaAsset creation.
 */
mediaRouter.post(
  '/complete',
  requireAuth,
  validateRequest(completeUploadSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const input = req.body as CompleteUploadInput;

      // Ownership verify: key must contain user.id or user must be admin
      if (!input.storageKey.includes(user.id) && user.role !== UserRole.ADMIN) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: 'FORBIDDEN_STORAGE_KEY',
            message: 'You do not have permission to verify media from this quarantine path.',
          },
        });
        return;
      }

      const storage = getStorageProvider();
      const fileData = await storage.getObject(input.storageKey);

      // Validate actual file magic bytes
      const validation = await inspectFileBytes(fileData.buffer);
      if (!validation.isValid) {
        // Immediately delete invalid or suspicious file from quarantine
        await storage.deleteObject(input.storageKey).catch(() => {});

        res.status(400).json({
          success: false,
          data: null,
          error: {
            code: 'INVALID_FILE_SIGNATURE',
            message: validation.error || 'Invalid file signature.',
          },
        });
        return;
      }

      // Video processing: inspect duration, width, height, and generate thumbnail
      let computedDuration = input.durationSeconds || null;
      let computedWidth = input.width || null;
      let computedHeight = input.height || null;
      let thumbnailKey: string | null = null;

      if (input.mediaType === 'VIDEO') {
        const videoMeta = await extractVideoMetadata(fileData.buffer);
        computedDuration = videoMeta.durationSeconds || input.durationSeconds || 15;
        computedWidth = videoMeta.width || input.width || 1080;
        computedHeight = videoMeta.height || input.height || 1920;

        if (computedDuration > config.storage.maxVideoDurationSeconds) {
          await storage.deleteObject(input.storageKey).catch(() => {});
          res.status(400).json({
            success: false,
            data: null,
            error: {
              code: 'VIDEO_TOO_LONG',
              message: `Video clips cannot exceed ${config.storage.maxVideoDurationSeconds} seconds (detected ${computedDuration}s).`,
            },
          });
          return;
        }

        // Generate and store thumbnail JPEG in quarantine alongside video
        const thumb = await generateVideoThumbnail(fileData.buffer);
        thumbnailKey = generateQuarantineKey(user.id, 'THUMBNAIL', 'jpg');
        await storage.putObject(thumbnailKey, thumb.thumbnailBuffer, thumb.thumbnailMime);
      }

      // If contentId not provided, create a placeholder draft content entity
      let targetContentId = input.contentId;
      if (!targetContentId) {
        const draftContent = await prisma.content.create({
          data: {
            authorId: user.id,
            type: input.mediaType === 'VIDEO' ? 'REEL' : 'POST',
            status: 'DRAFT',
            title: 'Draft Upload',
          },
        });
        targetContentId = draftContent.id;
      }

      // Generate preview URL for creator / admin preview
      const previewUrl = await storage.getSignedPreviewUrl(input.storageKey, 3600);

      // Create MediaAsset record marked strictly as quarantined
      const mediaAsset = await prisma.mediaAsset.create({
        data: {
          contentId: targetContentId,
          mediaType: input.mediaType as MediaType,
          storageKey: input.storageKey,
          url: previewUrl,
          mimeType: validation.detectedMime,
          fileSizeBytes: fileData.sizeBytes,
          width: computedWidth,
          height: computedHeight,
          durationSeconds: computedDuration,
          isQuarantined: true, // Remains quarantined until admin approval
        },
      });

      // If thumbnail was created, register thumbnail MediaAsset
      let thumbnailAsset: any = null;
      if (thumbnailKey) {
        const thumbPreviewUrl = await storage.getSignedPreviewUrl(thumbnailKey, 3600);
        thumbnailAsset = await prisma.mediaAsset.create({
          data: {
            contentId: targetContentId,
            mediaType: MediaType.THUMBNAIL,
            storageKey: thumbnailKey,
            url: thumbPreviewUrl,
            mimeType: 'image/jpeg',
            fileSizeBytes: 1024,
            isQuarantined: true,
          },
        });
      }

      res.status(201).json({
        success: true,
        data: {
          mediaAssetId: mediaAsset.id,
          contentId: targetContentId,
          storageKey: mediaAsset.storageKey,
          isQuarantined: mediaAsset.isQuarantined,
          previewUrl: mediaAsset.url,
          mimeType: mediaAsset.mimeType,
          fileSizeBytes: mediaAsset.fileSizeBytes,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/media/:id
 * Retrieve MediaAsset metadata. If quarantined, only creator or admin can retrieve signed preview URL.
 */
mediaRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const mediaAsset = await prisma.mediaAsset.findUnique({
        where: { id: req.params.id },
        include: {
          content: {
            select: { authorId: true, status: true },
          },
        },
      });

      if (!mediaAsset) {
        res.status(404).json({
          success: false,
          data: null,
          error: { code: 'NOT_FOUND', message: 'Media asset not found.' },
        });
        return;
      }

      // Check quarantine access: only owner or admin can see quarantined media
      const isOwner = mediaAsset.content.authorId === user.id;
      const isAdmin = user.role === UserRole.ADMIN;

      if (mediaAsset.isQuarantined && !isOwner && !isAdmin) {
        res.status(403).json({
          success: false,
          data: null,
          error: {
            code: 'MEDIA_QUARANTINED',
            message: 'This media is currently in private quarantine awaiting safety review.',
          },
        });
        return;
      }

      const storage = getStorageProvider();
      const signedPreviewUrl = await storage.getSignedPreviewUrl(mediaAsset.storageKey);

      res.status(200).json({
        success: true,
        data: {
          id: mediaAsset.id,
          contentId: mediaAsset.contentId,
          mediaType: mediaAsset.mediaType,
          mimeType: mediaAsset.mimeType,
          isQuarantined: mediaAsset.isQuarantined,
          previewUrl: signedPreviewUrl,
          fileSizeBytes: mediaAsset.fileSizeBytes,
          durationSeconds: mediaAsset.durationSeconds,
          createdAt: mediaAsset.createdAt,
        },
        error: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/media/preview
 * Protected preview streaming endpoint for local development adapter.
 * Accessible only to authorized admin or media owner.
 */
mediaRouter.get(
  '/preview',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const storageKey = req.query.key as string;

      if (!storageKey) {
        res.status(400).send('Missing key parameter');
        return;
      }

      // Check access permission: key must match user or user is admin
      if (!storageKey.includes(user.id) && user.role !== UserRole.ADMIN) {
        res.status(403).send('Forbidden: Quarantined media cannot be viewed.');
        return;
      }

      const storage = getStorageProvider();
      const file = await storage.getObject(storageKey);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', file.sizeBytes);
      res.send(file.buffer);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/media/:id
 * Removes a media asset. Caller must own the parent content or be an admin.
 */
mediaRouter.delete(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const mediaAsset = await prisma.mediaAsset.findUnique({
        where: { id: req.params.id },
        include: { content: { select: { authorId: true } } },
      });

      if (!mediaAsset) {
        res.status(404).json({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Media asset not found' } });
        return;
      }

      const isOwner = mediaAsset.content.authorId === user.id;
      const isAdmin = user.role === UserRole.ADMIN;

      if (!isOwner && !isAdmin) {
        res.status(403).json({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'You do not own this media.' } });
        return;
      }

      const storage = getStorageProvider();
      await storage.deleteObject(mediaAsset.storageKey).catch(() => {});
      await prisma.mediaAsset.delete({ where: { id: mediaAsset.id } });

      res.status(200).json({ success: true, message: 'Media asset deleted successfully.' });
    } catch (error) {
      next(error);
    }
  }
);
