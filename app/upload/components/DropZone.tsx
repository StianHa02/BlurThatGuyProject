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

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);
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
      style={{
        position: 'relative',
        border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '80px 48px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
        background: dragOver ? 'rgba(200,245,90,0.04)' : 'rgba(245,240,232,0.01)',
      }}
      onMouseOver={e => { if (!dragOver) e.currentTarget.style.borderColor = 'rgba(245,240,232,0.2)'; }}
      onMouseOut={e => { if (!dragOver) e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <input ref={inputRef} type="file" accept="video/*" onChange={handleChange} style={{ display: 'none' }} />
      <div style={{
        width: 64, height: 64, borderRadius: 6,
        background: dragOver ? 'rgba(200,245,90,0.1)' : 'rgba(245,240,232,0.04)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 24px',
        transition: 'all 0.2s',
      }}>
        <Upload style={{ width: 28, height: 28, color: dragOver ? 'var(--primary)' : 'var(--subtle)' }} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
        Drop your video here
      </h3>
      <p style={{ color: 'var(--subtle)', fontSize: 14, marginBottom: 16 }}>or click to browse files</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'var(--subtle)', opacity: 0.6 }}>
        <Film style={{ width: 12, height: 12 }} />
        <span>Supports MP4, WebM, MOV</span>
      </div>
    </div>
  );
}