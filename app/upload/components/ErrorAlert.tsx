'use client';

import { AlertCircle, X } from 'lucide-react';

interface ErrorAlertProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  return (
    <div style={{
      marginBottom: 24, padding: 16, borderRadius: 6,
      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <AlertCircle style={{ width: 18, height: 18, color: '#f87171', flexShrink: 0, marginTop: 2 }} />
      <p style={{ flex: 1, color: '#f87171', fontSize: 14 }}>{message}</p>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: 0 }}>
        <X style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}