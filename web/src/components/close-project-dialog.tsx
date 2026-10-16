'use client';

import { useEffect, useRef } from 'react';
import { FileX2, X } from 'lucide-react';
import { Button } from './ui/button';
import { useI18n } from '@/lib/i18n';

export interface CloseProjectDialogProps {
  open: boolean;
  documentName: string;
  busy: boolean;
  saveError: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

export default function CloseProjectDialog({
  open,
  documentName,
  busy,
  saveError,
  onCancel,
  onDiscard,
  onSave,
}: CloseProjectDialogProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="appearance-dialog"
      aria-labelledby="close-project-title"
      aria-describedby="close-project-description"
      aria-busy={busy}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
      onClose={() => {
        if (open && !busy) onCancel();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="appearance-content">
        <div className="dialog-heading">
          <FileX2 size={18} />
          <strong id="close-project-title">{t('Close tree')}</strong>
          <button
            className="icon-button"
            aria-label={t('Cancel closing tree')}
            disabled={busy}
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>
        <p
          className="appearance-note"
          id="close-project-description"
          style={{ overflowWrap: 'anywhere' }}
        >
          {t('Remove “{name}” from this workspace? Save JSON to keep a copy.', {
            name: documentName,
          })}
        </p>
        {saveError && (
          <p className="appearance-note" role="alert">
            {t('The tree is still open. JSON was not saved.')}
          </p>
        )}
        <div className="appearance-actions">
          <Button variant="outline" disabled={busy} onClick={onCancel} autoFocus>
            {t('Cancel')}
          </Button>
          <Button disabled={busy} onClick={onDiscard}>
            {t('Close without saving')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={onSave}>
            {t('Save JSON and close')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
