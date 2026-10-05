import { Check, X } from 'lucide-react';
import { popModal } from '.';
import { ModalContent } from './Modal/Container';

export default function BillingSuccess() {
  return (
    <ModalContent className="max-w-2xl">
      <button
        className="absolute top-6 right-6 z-10 rounded-full bg-black p-2.5 text-white transition-colors hover:bg-gray-800"
        onClick={() => popModal()}
        type="button"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex flex-col items-center justify-center px-8 py-12">
        <div className="relative mb-10 flex h-64 w-64 items-center justify-center">
          <div className="absolute inset-0 flex animate-ping-slow items-center justify-center opacity-10">
            <div className="h-64 w-64 rounded-full bg-emerald-400" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-52 w-52 rounded-full bg-emerald-200/30" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-40 rounded-full bg-emerald-300/40" />
          </div>
          <div className="relative flex items-center justify-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-emerald-500 shadow-lg">
              <Check className="h-16 w-16 stroke-[3] text-white" />
            </div>
          </div>
        </div>

        <h2 className="mb-4 font-semibold text-3xl">
          Subscription updated successfully
        </h2>
        <p className="mb-12 max-w-md text-center text-base leading-normal">
          Thank you for your purchase! You have now full access to OpenPanel. If
          you have any questions or feedback, please don't hesitate to contact
          us.
        </p>
      </div>
    </ModalContent>
  );
}
