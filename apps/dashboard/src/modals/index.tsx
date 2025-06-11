'use client';

import { Loader2Icon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createPushModal } from 'pushmodal';

import type { ConfirmProps } from './Confirm';
import { ModalContent } from './Modal/Container';

const Loading = () => (
  <ModalContent className="flex items-center justify-center p-16">
    <Loader2Icon className="animate-spin" size={40} />
  </ModalContent>
);

const modals = {
  OverviewTopPagesModal: dynamic(
    () => import('../components/overview/overview-top-pages-modal'),
    {
      loading: Loading,
    },
  ),
  OverviewTopGenericModal: dynamic(
    () => import('../components/overview/overview-top-generic-modal'),
    {
      loading: Loading,
    },
  ),
  RequestPasswordReset: dynamic(() => import('./request-reset-password'), {
    loading: Loading,
  }),
  EditEvent: dynamic(() => import('./edit-event'), {
    loading: Loading,
  }),
  EventDetails: dynamic(() => import('./event-details'), {
    loading: Loading,
  }),
  EditClient: dynamic(() => import('./EditClient'), {
    loading: Loading,
  }),
  AddProject: dynamic(() => import('./add-project'), {
    loading: Loading,
  }),
  AddClient: dynamic(() => import('./AddClient'), {
    loading: Loading,
  }),
  Confirm: dynamic(() => import('./Confirm'), {
    loading: Loading,
  }),
  SaveReport: dynamic(() => import('./SaveReport'), {
    loading: Loading,
  }),
  AddDashboard: dynamic(() => import('./AddDashboard'), {
    loading: Loading,
  }),
  EditDashboard: dynamic(() => import('./EditDashboard'), {
    loading: Loading,
  }),
  EditReport: dynamic(() => import('./EditReport'), {
    loading: Loading,
  }),
  ShareOverviewModal: dynamic(() => import('./ShareOverviewModal'), {
    loading: Loading,
  }),
  AddReference: dynamic(() => import('./AddReference'), {
    loading: Loading,
  }),
  Instructions: dynamic(() => import('./Instructions'), {
    loading: Loading,
  }),
  OnboardingTroubleshoot: dynamic(() => import('./OnboardingTroubleshoot'), {
    loading: Loading,
  }),
  DateRangerPicker: dynamic(() => import('./DateRangerPicker'), {
    loading: Loading,
  }),
  OverviewChartDetails: dynamic(() => import('./OverviewChartDetails'), {
    loading: Loading,
  }),
  Testimonial: dynamic(() => import('./Testimonial'), {
    loading: Loading,
  }),
  AddIntegration: dynamic(() => import('./add-integration')),
  AddNotificationRule: dynamic(() => import('./add-notification-rule')),
};

export const {
  pushModal,
  popModal,
  replaceWithModal,
  popAllModals,
  ModalProvider,
  useOnPushModal,
} = createPushModal({
  modals,
});

export const showConfirm = (props: ConfirmProps) => pushModal('Confirm', props);
