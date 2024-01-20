import { createContext, useContext } from 'react';
import type { RequestCookie } from 'next/dist/compiled/@edge-runtime/cookies';

type ICookies = Record<string, string | null>;

const context = createContext<ICookies>({});

export const CookieProvider = ({
  value,
  children,
}: {
  children: React.ReactNode;
  value: RequestCookie[];
}) => {
  const cookies = value.reduce((acc, cookie) => {
    return {
      ...acc,
      [cookie.name]: cookie.value,
    };
  }, {} as ICookies);
  return <context.Provider value={cookies}>{children}</context.Provider>;
};

export const useCookies = (): ICookies => useContext(context);
