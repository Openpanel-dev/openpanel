import { LogoSquare } from '@/components/logo';
import {
  SellingPoint,
  SellingPointIcon,
} from '@/components/shared/selling-points';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { motion } from 'framer-motion';
import {
  BarChart3,
  CheckCircle,
  DollarSign,
  Globe,
  Shield,
  TrendingUp,
} from 'lucide-react';

const sellingPoints = [
  {
    key: 'welcome',
    render: () => (
      <SellingPoint
        bgImage="/img-1.png"
        title="Analytics You Control."
        icon={<SellingPointIcon icon={CheckCircle} />}
        description="Self-hosted analytics built for teams who value privacy, speed, and freedom."
      />
    ),
  },
  {
    key: 'selling-point-2',
    render: () => (
      <SellingPoint
        bgImage="/img-2.png"
        title="Own Your Data. Understand Your Users."
        icon={<SellingPointIcon icon={Shield} />}
        description="Open-source, event-based analytics without tracking bloat or data sharing."
      />
    ),
  },
  {
    key: 'selling-point-3',
    render: () => (
      <SellingPoint
        bgImage="/img-3.png"
        title="Privacy-First Product Analytics."
        icon={<SellingPointIcon icon={TrendingUp} />}
        description="Beautiful insights. No cookies. No third-party scripts."
      />
    ),
  },
  {
    key: 'selling-point-4',
    render: () => (
      <SellingPoint
        bgImage="/img-4.png"
        title="Open Analytics. Zero Compromise."
        icon={<SellingPointIcon icon={Globe} />}
        description="Understand user behavior—without giving away your users."
      />
    ),
  },
  {
    key: 'selling-point-5',
    render: () => (
      <SellingPoint
        bgImage="/img-5.png"
        title="Faster. Fairer. Fully Yours."
        icon={<SellingPointIcon icon={BarChart3} />}
        description="Mixpanel-style analytics you actually own."
      />
    ),
  },
];

export function LoginLeftPanel() {
  return (
    <div className="relative h-screen overflow-hidden">
      <div className="row justify-between items-center p-8">
        <LogoSquare className="h-8 w-8" />
        <a
          href="https://openpanel.dev"
          className="text-sm text-muted-foreground"
        >
          Back to website →
        </a>
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
            {sellingPoints.map((point, index) => (
              <CarouselItem
                key={`selling-point-${point.key}`}
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
