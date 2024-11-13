import type { IconProps } from './types';

export function FlutterIcon({ className }: IconProps) {
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
        d="M302.543 237.44L173.167 366.56L302.527 495.92H449.951L320.783 366.592L449.951 237.424H302.559L302.543 237.44ZM302.271 16.064L62.0635 256L136.047 329.984L449.631 16.336H302.527L302.271 16.064Z"
        fill="currentColor"
      />
    </svg>
  );
}
