'use client';

// Re-exports the shared Alert with a compatible interface for backward-compat
import { Alert } from '@/components/Alert';

interface ErrorAlertProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorAlert({ message, onDismiss }: ErrorAlertProps) {
  return <Alert variant="error" message={message} onDismiss={onDismiss} className="mb-6" />;
}
