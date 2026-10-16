import { describe, expect, it } from 'vitest';
import { defaultAppearance, parseAppearance } from '../src/lib/appearance';
import { createTranslator } from '../src/lib/localization';

describe('device language preferences', () => {
  it('restores both languages and migrates older font-only preferences', () => {
    expect(parseAppearance({ textScale: 125, codeFontSize: 18 })).toEqual({
      language: 'en',
      textScale: 125,
      codeFontSize: 18,
    });
    expect(parseAppearance({ language: 'ja', textScale: 150, codeFontSize: 24 })).toEqual({
      language: 'ja',
      textScale: 150,
      codeFontSize: 24,
    });
    expect(parseAppearance({ language: 'unsupported', textScale: 110, codeFontSize: 14 })).toEqual({
      language: 'en',
      textScale: 110,
      codeFontSize: 14,
    });
    expect(parseAppearance(null)).toEqual(defaultAppearance);
  });

  it('interpolates translated labels while retaining supplied names verbatim', () => {
    const t = createTranslator('ja');
    expect(t('Close {name}', { name: 'Constructor {count}' })).toBe(
      '「Constructor {count}」を閉じる',
    );
    expect(t('{count} nodes', { count: 12 })).toBe('12ノード');
    expect(t('Class name must be a valid C# identifier.')).toBe(
      'クラス名には有効な C# 識別子を指定してください。',
    );
    expect(createTranslator('en')('Close {name}', { name: 'Guard' })).toBe('Close Guard');
  });

  it('leaves unknown data, runtime identifiers, and prototype property names unchanged', () => {
    const t = createTranslator('ja');
    for (const message of [
      'constructor',
      '__proto__',
      'toString',
      'IBehaviorNode',
      'return NodeStatus.Success;',
      'My custom title',
    ])
      expect(t(message)).toBe(message);
  });
});
