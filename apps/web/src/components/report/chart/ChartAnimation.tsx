import airplane from '@/lottie/airplane.json';
import ballon from '@/lottie/ballon.json';
import type { LottieComponentProps } from 'lottie-react';
import Lottie from 'lottie-react';

const animations = {
  airplane,
  ballon,
};
type Animations = keyof typeof animations;

export const ChartAnimation = ({
  name,
  ...props
}: Omit<LottieComponentProps, 'animationData'> & {
  name: Animations;
}) => <Lottie animationData={animations[name]} loop={true} {...props} />;
