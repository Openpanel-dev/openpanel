import { createServerFn } from '@tanstack/react-start';
import { setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE,
  languages,
} from './languages';
export const saveLanguage = createServerFn({ method: 'POST' })
  .inputValidator(z.enum(languages.map((language) => language.code)))
  .handler(({ data: language }) => {
    setCookie(LANGUAGE_COOKIE, language, {
      path: '/',
      maxAge: LANGUAGE_COOKIE_MAX_AGE,
      sameSite: 'lax',
    });
  });
