import { cn } from '@/lib/utils';

interface SwirlProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

export function SingleSwirl({ className, ...props }: SwirlProps) {
  return (
    <svg
      width="1193"
      height="634"
      viewBox="0 0 1193 634"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-white', className)}
      {...props}
    >
      <g filter="url(#filter0_f_290_140)">
        <path
          d="M996.469 546.016C728.822 501.422 310.916 455.521 98.1817 18.6728"
          stroke="currentColor"
          strokeWidth="26"
        />
      </g>
      <g filter="url(#filter1_f_290_140)">
        <path
          d="M780.821 634.792C582.075 610.494 151.698 468.051 20.1495 92.6602"
          stroke="currentColor"
        />
      </g>
      <defs>
        <filter
          id="filter0_f_290_140"
          x="-107.406"
          y="-180.919"
          width="1299.91"
          height="933.658"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="96.95"
            result="effect1_foregroundBlur_290_140"
          />
        </filter>
        <filter
          id="filter1_f_290_140"
          x="-3.32227"
          y="69.4946"
          width="807.204"
          height="588.793"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="11.5"
            result="effect1_foregroundBlur_290_140"
          />
        </filter>
      </defs>
    </svg>
  );
}

export function DoubleSwirl({ className, ...props }: SwirlProps) {
  return (
    <svg
      width="1535"
      height="1178"
      viewBox="0 0 1535 1178"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-white', className)}
      {...props}
    >
      <g filter="url(#filter0_f_290_639)">
        <path
          d="M1392.59 1088C1108.07 603.225 323.134 697.532 143.435 135.494"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="26"
        />
      </g>
      <g filter="url(#filter1_f_290_639)">
        <path
          d="M1446.57 1014.51C1162.05 529.732 377.111 624.039 197.412 62.0001"
          stroke="currentColor"
          strokeOpacity="0.06"
          strokeWidth="26"
        />
      </g>
      <defs>
        <filter
          id="filter0_f_290_639"
          x="0.244919"
          y="0.679001"
          width="1534.37"
          height="1224.74"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="65.4"
            result="effect1_foregroundBlur_290_639"
          />
        </filter>
        <filter
          id="filter1_f_290_639"
          x="160.022"
          y="32.9856"
          width="1322.77"
          height="1013.14"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="BackgroundImageFix"
            result="shape"
          />
          <feGaussianBlur
            stdDeviation="12.5"
            result="effect1_foregroundBlur_290_639"
          />
        </filter>
      </defs>
    </svg>
  );
}
