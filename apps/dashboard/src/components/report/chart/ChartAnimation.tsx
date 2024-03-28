import airplane from '@/lottie/airplane.json';
import ballon from '@/lottie/ballon.json';
import noData from '@/lottie/no-data.json';
import { cn } from '@/utils/cn';
import type { LottieComponentProps } from 'lottie-react';
import Lottie from 'lottie-react';

const animations = {
  airplane,
  ballon,
  noData,
};
type Animations = keyof typeof animations;

export const ChartAnimation = ({
  name,
  ...props
}: Omit<LottieComponentProps, 'animationData'> & {
  name: Animations;
}) => <Lottie animationData={animations[name]} loop={true} {...props} />;

export const ChartAnimationContainer = (
  props: React.ButtonHTMLAttributes<HTMLDivElement>
) => (
  <div
    {...props}
    className={cn(
      'rounded-md border border-border bg-background p-8',
      props.className
    )}
  />
);
