import { LogoSquare } from '@/components/logo';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Link } from '@tanstack/react-router';
import { CodeIcon, CreditCardIcon, DollarSignIcon } from 'lucide-react';
import { SellingPoint } from './selling-points';

const onboardingSellingPoints = [
  {
    key: 'get-started',
    render: () => (
      <SellingPoint
        bgImage="/img-6.png"
        title="Get started in minutes"
        description={
          <>
            <p>
              <DollarSignIcon className="size-4 inline-block mr-1 relative -top-0.5" />
              Free trial
            </p>
            <p>
              <CreditCardIcon className="size-4 inline-block mr-1 relative -top-0.5" />
              No credit card required
            </p>
            <p>
              <CodeIcon className="size-4 inline-block mr-1 relative -top-0.5" />
              Add our tracking code and get insights in real-time.
            </p>
          </>
        }
      />
    ),
  },
  {
    key: 'welcome',
    render: () => (
      <SellingPoint
        bgImage="/img-1.png"
        title="Best open-source alternative"
        description="Mixpanel too expensive, Google Analytics has no privacy, Amplitude old and boring"
      />
    ),
  },
  {
    key: 'selling-point-2',
    render: () => (
      <SellingPoint
        bgImage="/img-2.png"
        title="Fast and reliable"
        description="Never miss a beat with our real-time analytics"
      />
    ),
  },
  {
    key: 'selling-point-3',
    render: () => (
      <SellingPoint
        bgImage="/img-3.png"
        title="Easy to use"
        description="Compared to other tools we have kept it simple"
      />
    ),
  },
  {
    key: 'selling-point-4',
    render: () => (
      <SellingPoint
        bgImage="/img-4.png"
        title="Privacy by default"
        description="We have built our platform with privacy at its heart"
      />
    ),
  },
  {
    key: 'selling-point-5',
    render: () => (
      <SellingPoint
        bgImage="/img-5.png"
        title="Open source"
        description="You can inspect the code and self-host if you choose"
      />
    ),
  },
];

export function OnboardingLeftPanel() {
  return (
    <div className="sticky top-0 h-screen overflow-hidden">
      <div className="row justify-between items-center p-8">
        <LogoSquare className="h-8 w-8" />

        <div className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-sm text-muted-foreground underline">
            Sign in
          </Link>
        </div>
      </div>

      {/* Carousel */}
      <div className="flex items-center justify-center h-full">
        <Carousel
          className="w-full h-full [&>div]:h-full [&>div]:min-h-full"
          opts={{
            loop: true,
            align: 'center',
          }}
        >
          <CarouselContent className="h-full">
            {onboardingSellingPoints.map((point, index) => (
              <CarouselItem
                key={`onboarding-point-${point.key}`}
                className="p-8 pb-32 pt-0"
              >
                <div className="rounded-xl min-h-full h-full overflow-hidden bg-card border border-border shadow-lg">
                  {point.render()}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-12 bottom-30 top-auto" />
          <CarouselNext className="right-12 bottom-30 top-auto" />
        </Carousel>
      </div>
    </div>
  );
}
