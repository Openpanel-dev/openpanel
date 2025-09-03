import { useState } from 'react';

export const useTheme = () => {
  const [theme, setTheme] = useState<string>('light');

  return { theme, setTheme, resolvedTheme: theme };
};
