import { useEffect, useState } from 'react';

export function useIsDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;

    // Check localStorage first
    const savedTheme = window.localStorage.getItem('theme');
    if (savedTheme !== null) {
      return savedTheme === 'dark';
    }

    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Check if user prefers dark mode
    const htmlElement = document.documentElement;
    setIsDarkMode(htmlElement.classList.contains('dark'));

    // Create observer to watch for class changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(htmlElement.classList.contains('dark'));
        }
      });
    });

    // Start observing class changes on html element
    observer.observe(htmlElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return isDarkMode;
}
