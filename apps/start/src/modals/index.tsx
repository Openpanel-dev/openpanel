import { createPushModal } from 'pushmodal';

import OverviewTopGenericModal from '@/components/overview/overview-top-generic-modal';
import OverviewTopPagesModal from '@/components/overview/overview-top-pages-modal';
import Instructions from './Instructions';
import AddClient from './add-client';
import AddDashboard from './add-dashboard';
import AddImport from './add-import';
import AddIntegration from './add-integration';
import AddNotificationRule from './add-notification-rule';
import AddProject from './add-project';
import AddReference from './add-reference';
import Confirm from './confirm';
import type { ConfirmProps } from './confirm';
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
import OnboardingTroubleshoot from './onboarding-troubleshoot';
import OverviewChartDetails from './overview-chart-details';
import RequestPasswordReset from './request-reset-password';
import SaveReport from './save-report';
import ShareOverviewModal from './share-overview-modal';

const modals = {
  OverviewTopPagesModal: OverviewTopPagesModal,
  OverviewTopGenericModal: OverviewTopGenericModal,
  RequestPasswordReset: RequestPasswordReset,
  EditEvent: EditEvent,
  EditMember: EditMember,
  EventDetails: EventDetails,
  EditClient: EditClient,
  AddProject: AddProject,
  AddClient: AddClient,
  AddImport: AddImport,
  Confirm: Confirm,
  SaveReport: SaveReport,
  AddDashboard: AddDashboard,
  EditDashboard: EditDashboard,
  EditReport: EditReport,
  EditReference: EditReference,
  ShareOverviewModal: ShareOverviewModal,
  AddReference: AddReference,
  Instructions: Instructions,
  OnboardingTroubleshoot: OnboardingTroubleshoot,
  DateRangerPicker: DateRangerPicker,
  DateTimePicker: DateTimePicker,
  OverviewChartDetails: OverviewChartDetails,
  AddIntegration: AddIntegration,
  AddNotificationRule: AddNotificationRule,
  CreateInvite: CreateInvite,
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
