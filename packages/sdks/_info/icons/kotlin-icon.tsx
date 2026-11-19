import type { IconProps } from './types';

export function KotlinIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      height="512"
      viewBox="0 0 512 512"
      width="512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_367_180)">
        <path
          d="M27.744 512L268.832 266.672L512 512H27.744ZM0 0H256L0 266.672V0ZM285.84 0L0 298.672V512L512 0H285.84Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_367_180">
          <rect fill="white" height="512" width="512" />
        </clipPath>
      </defs>
    </svg>
  );
}
