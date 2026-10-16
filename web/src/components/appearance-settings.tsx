'use client';
import { useEffect, useRef } from 'react';
import { RotateCcw, Type, X } from 'lucide-react';
import {
  codeFontSizes,
  defaultAppearance,
  textScales,
  type AppearancePreferences,
} from '@/lib/appearance';
import { Button } from './ui/button';

export default function AppearanceSettings({
  open,
  preferences,
  saveUnavailable,
  onChange,
  onClose,
}: {
  open: boolean;
  preferences: AppearancePreferences;
  saveUnavailable: boolean;
  onChange: (preferences: AppearancePreferences) => void;
  onClose: () => void;
}) {
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
      aria-labelledby="appearance-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="appearance-content">
        <div className="dialog-heading">
          <Type size={18} />
          <strong id="appearance-title">Appearance</strong>
          <button className="icon-button" aria-label="Close appearance settings" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <label className="appearance-field">
          <span>UI text size</span>
          <select
            value={preferences.textScale}
            onChange={(event) =>
              onChange({
                ...preferences,
                textScale: Number(event.target.value) as AppearancePreferences['textScale'],
              })
            }
          >
            {textScales.map((scale) => (
              <option key={scale} value={scale}>
                {scale}%{scale === defaultAppearance.textScale ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="appearance-preview">
          <span>Sequence</span>
          <strong>Attack sequence</strong>
          <small>IsEnemyVisible → Attack</small>
        </div>
        <label className="appearance-field">
          <span>Code font size</span>
          <select
            value={preferences.codeFontSize}
            onChange={(event) =>
              onChange({
                ...preferences,
                codeFontSize: Number(event.target.value) as AppearancePreferences['codeFontSize'],
              })
            }
          >
            {codeFontSizes.map((size) => (
              <option key={size} value={size}>
                {size} px{size === defaultAppearance.codeFontSize ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="appearance-code-preview">
          <code style={{ fontSize: preferences.codeFontSize }}>return NodeStatus.Success;</code>
        </div>
        <p className="appearance-note" role="status">
          {saveUnavailable
            ? 'Applied for this session. Local save is unavailable.'
            : 'Saved on this device. Canvas zoom is unchanged.'}
        </p>
        <div className="appearance-actions">
          <Button
            variant="outline"
            disabled={
              preferences.textScale === defaultAppearance.textScale &&
              preferences.codeFontSize === defaultAppearance.codeFontSize
            }
            onClick={() => onChange({ ...defaultAppearance })}
          >
            <RotateCcw size={14} />
            Reset defaults
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </dialog>
  );
}
