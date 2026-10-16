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
import { useI18n } from '@/lib/i18n';

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
      aria-labelledby="appearance-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="appearance-content">
        <div className="dialog-heading">
          <Type size={18} />
          <strong id="appearance-title">{t('Appearance')}</strong>
          <button
            className="icon-button"
            aria-label={t('Close appearance settings')}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <label className="appearance-field">
          <span>{t('Language')}</span>
          <select
            value={preferences.language}
            onChange={(event) =>
              onChange({
                ...preferences,
                language: event.target.value as AppearancePreferences['language'],
              })
            }
          >
            <option value="en" lang="en">
              English
            </option>
            <option value="ja" lang="ja">
              日本語
            </option>
          </select>
        </label>
        <label className="appearance-field">
          <span>{t('UI text size')}</span>
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
                {scale}%{scale === defaultAppearance.textScale ? t(' (default)') : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="appearance-preview">
          <span>{t('Sequence')}</span>
          <strong>{t('Attack sequence')}</strong>
          <small>IsEnemyVisible → Attack</small>
        </div>
        <label className="appearance-field">
          <span>{t('Code font size')}</span>
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
                {size} px{size === defaultAppearance.codeFontSize ? t(' (default)') : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="appearance-code-preview">
          <code style={{ fontSize: preferences.codeFontSize }}>return NodeStatus.Success;</code>
        </div>
        <p className="appearance-note" role="status">
          {t(
            saveUnavailable
              ? 'Applied for this session. Local save is unavailable.'
              : 'Saved on this device. Canvas zoom is unchanged.',
          )}
        </p>
        <div className="appearance-actions">
          <Button
            variant="outline"
            disabled={
              preferences.language === defaultAppearance.language &&
              preferences.textScale === defaultAppearance.textScale &&
              preferences.codeFontSize === defaultAppearance.codeFontSize
            }
            onClick={() => onChange({ ...defaultAppearance })}
          >
            <RotateCcw size={14} />
            {t('Reset defaults')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('Done')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
