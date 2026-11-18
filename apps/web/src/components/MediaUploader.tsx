import React, { useState, useRef } from 'react';
import { apiClient } from '../services/api';
import { Upload, X, AlertCircle, CheckCircle2, Film, Image as ImageIcon } from 'lucide-react';

interface MediaUploaderProps {
  mediaType: 'IMAGE' | 'VIDEO';
  onUploadSuccess: (mediaData: {
    storageKey: string;
    previewUrl: string;
    mediaAssetId: string;
    fileSizeBytes: number;
    mimeType: string;
  }) => void;
  maxSizeBytes?: number;
}

export const MediaUploader: React.FC<MediaUploaderProps> = ({
  mediaType,
  onUploadSuccess,
  maxSizeBytes = mediaType === 'IMAGE' ? 10 * 1024 * 1024 : 50 * 1024 * 1024,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > maxSizeBytes) {
      setError(`File is too large. Maximum allowed size is ${maxSizeBytes / (1024 * 1024)}MB.`);
      return;
    }

    setFile(selected);
    const localUrl = URL.createObjectURL(selected);
    setPreview(localUrl);
  };

  const handleUpload = async () => {
    if (!file) return;

    setError(null);
    setIsUploading(true);
    setProgress(10);

    try {
      // Step 1: Request pre-signed upload URL from backend
      const ticketRes = await apiClient.post('/media/upload-url', {
        fileName: file.name,
        mimeType: file.type || (mediaType === 'IMAGE' ? 'image/jpeg' : 'video/mp4'),
        fileSizeBytes: file.size,
        mediaType,
      });

      const { uploadUrl, storageKey } = ticketRes.data.data;
      setProgress(40);

      // Step 2: Upload file directly to quarantine destination
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      setProgress(75);

      // Step 3: Complete verification on backend (magic bytes inspection)
      const completeRes = await apiClient.post('/media/complete', {
        storageKey,
        mediaType,
        fileSizeBytes: file.size,
      });

      setProgress(100);

      onUploadSuccess({
        storageKey: completeRes.data.data.storageKey,
        previewUrl: completeRes.data.data.previewUrl,
        mediaAssetId: completeRes.data.data.mediaAssetId,
        fileSizeBytes: file.size,
        mimeType: file.type,
      });
    } catch (err: any) {
      setError(err?.message || 'Upload verification failed. Please try a valid photo or video.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreview(null);
    setProgress(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={mediaType === 'IMAGE' ? 'image/png,image/jpeg,image/webp' : 'video/mp4,video/webm,video/quicktime'}
        onChange={handleFileChange}
        className="hidden"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!preview ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50 hover:bg-purple-50/50 hover:border-purple-300 transition-colors cursor-pointer space-y-2"
        >
          <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto">
            {mediaType === 'IMAGE' ? <ImageIcon className="w-6 h-6" /> : <Film className="w-6 h-6" />}
          </div>
          <p className="font-bold text-sm text-slate-700">Choose {mediaType === 'IMAGE' ? 'Photo' : 'Video'}</p>
          <p className="text-xs text-slate-400">
            {mediaType === 'IMAGE' ? 'JPEG, PNG, WEBP (Max 10MB)' : 'MP4, WEBM, MOV (Max 50MB, 60s)'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-black aspect-video flex items-center justify-center">
            {mediaType === 'IMAGE' ? (
              <img src={preview} alt="Upload preview" className="w-full h-full object-contain" />
            ) : (
              <video src={preview} controls className="w-full h-full object-contain" />
            )}

            <button
              type="button"
              onClick={handleClear}
              className="absolute top-3 right-3 bg-slate-900/80 text-white rounded-full p-1.5 hover:bg-slate-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {progress > 0 && progress < 100 && (
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}

          {progress === 100 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="w-4 h-4" /> Media safely uploaded & quarantined for review
            </div>
          )}

          {progress === 0 && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? 'Inspecting & Uploading...' : 'Upload Media to Quarantine'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
