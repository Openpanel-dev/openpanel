import type { IconProps } from './types';

export function HtmlIcon({ className }: IconProps) {
  return (
    <svg
      width="512"
      height="512"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M395.14 153.6H394.957H174.388L179.663 204.8H389.891C386.81 249.651 377.488 344.674 374.067 387.913L255.988 421.15V421.25L255.727 421.375L137.57 379.8L129.475 281.6H187.392L191.492 334.413L255.832 358.4H255.988L320.224 335.363L326.831 256H126.89C125.924 245.734 113.495 112.435 111.328 102.4H400.31C398.691 119.296 397.046 136.653 395.14 153.6ZM25.6016 0L67.5376 464.588L255.727 512L444.413 463.638L486.402 0H25.6016Z"
        fill="currentColor"
      />
    </svg>
  );
}
