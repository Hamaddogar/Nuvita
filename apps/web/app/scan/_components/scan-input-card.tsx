"use client";

import { Camera, ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ScanStatus } from "../types";

type ScanInputCardProps = {
  status: ScanStatus;
  selectedFile: File | null;
  previewUrl: string | null;
  portionHint: string;
  onSelectFile: (file: File) => void;
  onRemoveImage: () => void;
  onPortionHintChange: (value: string) => void;
  onAnalyze: () => void;
};

function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }
  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ScanInputCard({
  status,
  selectedFile,
  previewUrl,
  portionHint,
  onSelectFile,
  onRemoveImage,
  onPortionHintChange,
  onAnalyze,
}: ScanInputCardProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const isAnalyzing = status === "analyzing";

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    event.target.value = "";
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onSelectFile(file);
    }
  };

  return (
    <section className="space-y-4">
      <div
        className={cn(
          "rounded-2xl border border-dashed bg-background p-4 transition-colors sm:p-5",
          isDragActive ? "border-primary bg-primary/5" : "border-border"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!selectedFile || !previewUrl ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Add meal photo</p>
              <p className="text-xs text-muted-foreground">
                Take a new picture with your camera or choose one from your gallery.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={isAnalyzing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              >
                <ImagePlus className="h-4 w-4" />
                Upload from Gallery
              </button>
            </div>

            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UploadCloud className="h-3.5 w-3.5" />
              Drag and drop also works on desktop.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="relative h-56 w-full sm:h-72">
                <Image
                  src={previewUrl}
                  alt="Meal preview"
                  fill
                  unoptimized
                  sizes="(max-width: 640px) 100vw, 640px"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Change
                </button>
                <button
                  type="button"
                  onClick={onRemoveImage}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Portion note (optional)</span>
        <input
          type="text"
          value={portionHint}
          onChange={(event) => onPortionHintChange(event.target.value)}
          placeholder="e.g. half plate, one bowl, 2 slices"
          disabled={isAnalyzing}
          className="w-full rounded-xl border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        />
      </label>

      <button
        type="button"
        onClick={onAnalyze}
        disabled={!selectedFile || isAnalyzing}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isAnalyzing ? "Analyzing your meal..." : "Analyze Food"}
      </button>
    </section>
  );
}
