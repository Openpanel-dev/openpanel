'use client';

import { pushModal, useOnPushModal } from '@/modals';
import { useUser } from '@clerk/nextjs';
import { differenceInDays } from 'date-fns';
import { useEffect } from 'react';

import { useOpenPanel } from '@openpanel/nextjs';

export default function SideEffects() {
  const op = useOpenPanel();
  const { user } = useUser();
  const accountAgeInDays = differenceInDays(
    new Date(),
    user?.createdAt || new Date(),
  );
  useOnPushModal('Testimonial', (open) => {
    if (!open) {
      user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          testimonial: new Date().toISOString(),
        },
      });
    }
  });

  const showTestimonial =
    user && !user.unsafeMetadata.testimonial && accountAgeInDays > 7;

  useEffect(() => {
    if (showTestimonial) {
      pushModal('Testimonial');
      op.track('testimonials_shown');
    }
  }, [showTestimonial]);

  return null;
}
