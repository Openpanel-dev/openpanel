import { Check, X } from 'lucide-react';
import { popModal } from '.';
import { ModalContent } from './Modal/Container';

export default function BillingSuccess() {
  return (
    <ModalContent className="max-w-2xl">
      <button
        type="button"
        onClick={() => popModal()}
        className="absolute right-6 top-6 z-10 rounded-full bg-black text-white p-2.5 hover:bg-gray-800 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex flex-col items-center justify-center py-12 px-8">
        {/* Success Icon with animated rings */}
        <div className="relative mb-10 h-64 w-64 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center animate-ping-slow opacity-10">
            <div className="h-64 w-64 rounded-full bg-emerald-400" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-52 w-52 rounded-full bg-emerald-200/30" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-full bg-emerald-300/40" />
          </div>
          <div className="relative flex items-center justify-center">
            <div className="h-32 w-32 rounded-full bg-emerald-500 shadow-lg flex items-center justify-center">
              <Check className="h-16 w-16 text-white stroke-[3]" />
            </div>
          </div>
        </div>

        {/* Success Message */}
        <h2 className="text-3xl font-semibold mb-4 text-gray-900">
          Subscription updated successfully
        </h2>
        <p className="text-center mb-12 max-w-md text-base leading-normal">
          Thanks you for your purchase! You have now full access to OpenPanel.
          If you have any questions or feedback, please don't hesitate to
          contact us.
        </p>
      </div>
    </ModalContent>
  );
}
