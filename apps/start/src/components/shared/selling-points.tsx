import { motion } from 'framer-motion';
import {
  BarChart3,
  CheckCircle,
  DollarSign,
  Globe,
  type LucideIcon,
  Shield,
  TrendingUp,
} from 'lucide-react';

function SellingPointIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="size-22 center-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
      <Icon className="h-8 w-8 text-white" />
    </div>
  );
}

function SellingPoint({
  title,
  icon,
  description,
  bgImage,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  bgImage: string;
}) {
  return (
    <div className="flex flex-col justify-center h-full p-8 select-none relative">
      <img
        src={bgImage}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="relative z-10 center-center col">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-6xl/normal font-bold text-foreground drop-shadow-2xl drop-shadow-highlight">
            {title}
          </h2>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-lg text-muted-foreground leading-relaxed">
            {description}
          </p>
        </motion.div>
      </div>
    </div>
  );
}

// Onboarding-specific selling points
export const onboardingSellingPoints = [
  {
    key: 'welcome',
    render: () => (
      <SellingPoint
        bgImage="/img-1.png"
        title="Welcome to OpenPanel"
        icon={<SellingPointIcon icon={CheckCircle} />}
        description="Let's get you set up with powerful, privacy-first analytics in just a few steps."
      />
    ),
  },
  {
    key: 'onboarding-1',
    render: () => (
      <SellingPoint
        bgImage="/img-2.png"
        title="Create Your Project"
        icon={<SellingPointIcon icon={Globe} />}
        description="Set up your first project and start tracking user behavior with our intuitive dashboard."
      />
    ),
  },
  {
    key: 'onboarding-2',
    render: () => (
      <SellingPoint
        bgImage="/img-3.png"
        title="Connect Your Website"
        icon={<SellingPointIcon icon={TrendingUp} />}
        description="Add our lightweight script to your website and start collecting valuable insights immediately."
      />
    ),
  },
  {
    key: 'onboarding-3',
    render: () => (
      <SellingPoint
        bgImage="/img-4.png"
        title="View Your Analytics"
        icon={<SellingPointIcon icon={BarChart3} />}
        description="Explore your data with beautiful charts, funnels, and real-time insights."
      />
    ),
  },
  {
    key: 'onboarding-4',
    render: () => (
      <SellingPoint
        bgImage="/img-5.png"
        title="Privacy by Design"
        icon={<SellingPointIcon icon={Shield} />}
        description="Your data stays yours. No cookies, no third-party tracking, complete GDPR compliance."
      />
    ),
  },
];

export { SellingPoint, SellingPointIcon };
