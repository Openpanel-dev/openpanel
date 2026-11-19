import type { CoreConfig } from '../../../config';
import type { ServiceDeps } from '../../../services';
import type { ChatLaunchHint } from '../assistant.constants';
import type { ChatActions } from './actions';

/** Everything a tool needs for one turn; the route checks access before building it. */
export interface ChatToolContext {
  deps: ServiceDeps;
  config: CoreConfig;
  projectId: string;
  organizationId: string;
  userId: string;
  projectName: string;
  /** IANA timezone of the project. */
  timezone: string;
  hint?: ChatLaunchHint;
  actions: ChatActions;
}
