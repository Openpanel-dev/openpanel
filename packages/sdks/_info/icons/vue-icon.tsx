import type { IconProps } from './types';

export function VueIcon({ className }: IconProps) {
  return (
    <svg
      width="512"
      height="512"
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M407.772 42.6665H320L256 147.2L201.143 42.6665H0L256 490.667L512 42.6665H407.772ZM64 79.9998H126.172L256 311.467L385.828 79.9998H448L256 416L64 79.9998Z"
        fill="currentColor"
      />
    </svg>
  );
}
