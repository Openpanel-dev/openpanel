import { createPushModal } from 'pushmodal';

import OverviewTopGenericModal from '@/components/overview/overview-top-generic-modal';
import OverviewTopPagesModal from '@/components/overview/overview-top-pages-modal';
import AddClient from './AddClient';
import AddDashboard from './AddDashboard';
import AddReference from './AddReference';
import type { ConfirmProps } from './Confirm';
import Confirm from './Confirm';
import DateRangerPicker from './DateRangerPicker';
import EditClient from './EditClient';
import EditDashboard from './EditDashboard';
import EditReport from './EditReport';
import Instructions from './Instructions';
import OnboardingTroubleshoot from './OnboardingTroubleshoot';
import OverviewChartDetails from './OverviewChartDetails';
import SaveReport from './SaveReport';
import ShareOverviewModal from './ShareOverviewModal';
import AddIntegration from './add-integration';
import AddNotificationRule from './add-notification-rule';
import AddProject from './add-project';
import CreateInvite from './create-invite';
import DateTimePicker from './date-time-picker';
import EditEvent from './edit-event';
import EventDetails from './event-details';
import RequestPasswordReset from './request-reset-password';

// const Loading = () => (
//   <ModalContent className="flex items-center justify-center p-16">
//     <Loader2Icon className="animate-spin" size={40} />
//   </ModalContent>
// );

const modals = {
  OverviewTopPagesModal: OverviewTopPagesModal,
  OverviewTopGenericModal: OverviewTopGenericModal,
  RequestPasswordReset: RequestPasswordReset,
  EditEvent: EditEvent,
  EventDetails: EventDetails,
  EditClient: EditClient,
  AddProject: AddProject,
  AddClient: AddClient,
  Confirm: Confirm,
  SaveReport: SaveReport,
  AddDashboard: AddDashboard,
  EditDashboard: EditDashboard,
  EditReport: EditReport,
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
