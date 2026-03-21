'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

interface DropZoneProps {
  onFileSelect: (file: File) => void;
}

const FORMATS = ['MP4', 'MOV', 'WebM'];

export function DropZone({ onFileSelect }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);
  const handleChange    = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  }, [onFileSelect]);

  return (
    <div className="space-y-4">
      {/* Drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-blue-500 bg-blue-500/8'
            : 'border-white/12 hover:border-white/20 hover:bg-white/4'
        }`}
      >
        <input ref={inputRef} type="file" accept="video/*" onChange={handleChange} className="hidden" />
        <div className={`w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center transition-colors ${
          dragOver ? 'bg-blue-500/20' : 'bg-white/6'
        }`}>
          <Upload className={`w-8 h-8 ${dragOver ? 'text-blue-400' : 'text-slate-500'}`} />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-white">Drop your video here</h3>
        <p className="text-slate-500 text-sm">or click to browse files</p>
      </div>

      {/* Supported formats panel */}
      <div className="card p-5 text-center">
        <p className="text-sm text-slate-400 mb-3">Supported formats</p>
        <div className="flex items-center justify-center gap-2">
          {FORMATS.map((fmt) => (
            <span key={fmt} className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-white">
              {fmt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
