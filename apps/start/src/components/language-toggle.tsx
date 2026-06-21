import { CheckIcon, LanguagesIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  languageLabels,
  normalizeLanguage,
  supportedLanguages,
} from '@/i18n/locales';
import { cn } from '@/lib/utils';

export function LanguageToggle({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const currentLanguage = normalizeLanguage(
    i18n.resolvedLanguage ?? i18n.language
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t('common.language')}
          className={cn('center-center outline-0', className)}
          title={t('common.language')}
          type="button"
        >
          <LanguagesIcon className="size-4" />
          <span className="sr-only">{t('common.language')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-40">
        {supportedLanguages.map((language) => (
          <DropdownMenuItem
            key={language}
            onClick={() => {
              window.localStorage.setItem('openpanel-language', language);
              document.documentElement.lang = language;
              void i18n.changeLanguage(language);
            }}
          >
            <span className="flex-1">{languageLabels[language]}</span>
            {currentLanguage === language && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
