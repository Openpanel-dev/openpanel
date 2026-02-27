import { createPushModal } from 'pushmodal';
import AddClient from './add-client';
import AddDashboard from './add-dashboard';
import AddImport from './add-import';
import AddIntegration from './add-integration';
import AddNotificationRule from './add-notification-rule';
import AddProject from './add-project';
import AddReference from './add-reference';
import BillingSuccess from './billing-success';
import type { ConfirmProps } from './confirm';
import Confirm from './confirm';
import CreateInvite from './create-invite';
import DateRangerPicker from './date-ranger-picker';
import DateTimePicker from './date-time-picker';
import EditClient from './edit-client';
import EditDashboard from './edit-dashboard';
import EditEvent from './edit-event';
import EditMember from './edit-member';
import EditReference from './edit-reference';
import EditReport from './edit-report';
import EventDetails from './event-details';
import Instructions from './Instructions';
import OverviewChartDetails from './overview-chart-details';
import OverviewFilters from './overview-filters';
import RequestPasswordReset from './request-reset-password';
import SaveReport from './save-report';
import SelectBillingPlan from './select-billing-plan';
import ShareDashboardModal from './share-dashboard-modal';
import ShareOverviewModal from './share-overview-modal';
import ShareReportModal from './share-report-modal';
import ViewChartUsers from './view-chart-users';
import OverviewTopGenericModal from '@/components/overview/overview-top-generic-modal';
import OverviewTopPagesModal from '@/components/overview/overview-top-pages-modal';
import { op } from '@/utils/op';

const modals = {
  OverviewTopPagesModal,
  OverviewTopGenericModal,
  RequestPasswordReset,
  EditEvent,
  EditMember,
  EventDetails,
  EditClient,
  AddProject,
  AddClient,
  AddImport,
  Confirm,
  SaveReport,
  AddDashboard,
  EditDashboard,
  EditReport,
  EditReference,
  ShareOverviewModal,
  ShareDashboardModal,
  ShareReportModal,
  AddReference,
  ViewChartUsers,
  Instructions,
  DateRangerPicker,
  DateTimePicker,
  OverviewChartDetails,
  AddIntegration,
  AddNotificationRule,
  OverviewFilters,
  CreateInvite,
  SelectBillingPlan,
  BillingSuccess,
};

export const {
  pushModal,
  popModal,
  replaceWithModal,
  popAllModals,
  ModalProvider,
  useOnPushModal,
  onPushModal,
} = createPushModal({
  modals,
});

onPushModal('*', (open, props, name) => {
  if (open) {
    op.screenView(`modal:${name}`, props as Record<string, unknown>);
  }
});

export const showConfirm = (props: ConfirmProps) => pushModal('Confirm', props);
