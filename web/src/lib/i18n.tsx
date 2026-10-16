'use client';

import { createContext, useContext, useMemo } from 'react';
import { createTranslator, type Language, type Translator } from './localization';

const I18nContext = createContext<{ language: Language; t: Translator }>({
  language: 'en',
  t: createTranslator('en'),
});

export function I18nProvider({
  language,
  children,
}: {
  language: Language;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ language, t: createTranslator(language) }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
