'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, Film } from 'lucide-react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
}

export function DropZone({ onFileSelect }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
        dragOver
          ? 'border-indigo-500 bg-indigo-500/10'
          : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="hidden"
      />
      <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center transition-colors ${
        dragOver ? 'bg-indigo-500/20' : 'bg-zinc-800'
      }`}>
        <Upload className={`w-8 h-8 ${dragOver ? 'text-indigo-400' : 'text-zinc-500'}`} />
      </div>
      <h3 className="text-lg font-semibold mb-2">Drop your video here</h3>
      <p className="text-zinc-500 text-sm mb-4">or click to browse files</p>
      <div className="flex items-center justify-center gap-2 text-xs text-zinc-600">
        <Film className="w-3 h-3" />
        <span>Supports MP4, WebM, MOV</span>
      </div>
    </div>
  );
}
