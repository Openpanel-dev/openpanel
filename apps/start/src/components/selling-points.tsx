import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

function SellingPointIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="center-center size-22 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
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
    <div className="relative flex h-full select-none flex-col justify-center p-8">
      <img
        className="absolute inset-0 h-full w-full object-cover"
        src={bgImage}
      />
      <div className="center-center col relative z-10">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="mb-2 font-bold text-6xl text-white drop-shadow-2xl drop-shadow-highlight">
            {title}
          </h2>
        </motion.div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-lg text-white/70 leading-relaxed">{description}</p>
        </motion.div>
      </div>
    </div>
  );
}

export { SellingPoint, SellingPointIcon };
