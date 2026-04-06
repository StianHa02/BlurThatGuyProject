/* Shared alert component with error, success, and info variants. Supports an optional dismiss button. */
'use client';

import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

interface AlertProps {
  variant?: 'error' | 'success' | 'info';
  message: string;
  onDismiss?: () => void;
  className?: string;
}

const ICONS = {
  error:   AlertCircle,
  success: CheckCircle,
  info:    Info,
} as const;

const CLASSES = {
  error:   'alert alert-error',
  success: 'alert alert-success',
  info:    'alert alert-info',
} as const;

export function Alert({ variant = 'error', message, onDismiss, className = '' }: AlertProps) {
  const Icon = ICONS[variant];
  return (
    <div className={`${CLASSES[variant]} ${className}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="ml-auto opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
