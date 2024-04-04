'use client';

import { Loader } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createPushModal } from 'pushmodal';

import type { ConfirmProps } from './Confirm';

const Loading = () => <Loader className="mb-8 animate-spin" size={40} />;

const modals = {
  EditProject: dynamic(() => import('./EditProject'), {
    loading: Loading,
  }),
  EditClient: dynamic(() => import('./EditClient'), {
    loading: Loading,
  }),
  AddProject: dynamic(() => import('./AddProject'), {
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
};

export const { pushModal, popModal, popAllModals, ModalProvider } =
  createPushModal({
    modals,
  });

export const showConfirm = (props: ConfirmProps) => pushModal('Confirm', props);
