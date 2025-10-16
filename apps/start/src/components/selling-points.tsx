import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

function SellingPointIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="size-22 center-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
      <Icon className="h-8 w-8 text-white" />
    </div>
  );
}

function SellingPoint({
  title,
  description,
  bgImage,
}: {
  title: string;
  description: React.ReactNode;
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
          <h2 className="text-6xl font-bold text-white drop-shadow-2xl drop-shadow-highlight mb-2">
            {title}
          </h2>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-lg text-white/70 leading-relaxed">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}

export { SellingPoint, SellingPointIcon };
