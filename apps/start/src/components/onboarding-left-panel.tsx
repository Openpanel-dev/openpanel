import { LogoSquare } from '@/components/logo';
import { onboardingSellingPoints } from '@/components/shared/selling-points';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { Link } from '@tanstack/react-router';

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
