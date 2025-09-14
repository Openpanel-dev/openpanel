import { useClientSecret } from '@/hooks/use-client-secret';
import { clipboard } from '@/utils/clipboard';
import type { IServiceProjectWithClients } from '@openpanel/db';
import Syntax from '../syntax';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/accordion';

export function CurlPreview({
  project,
}: { project: IServiceProjectWithClients }) {
  const [secret] = useClientSecret();
  const client = project.clients[0];
  if (!client) {
    return null;
  }

  const payload: Record<string, any> = {
    type: 'track',
    payload: {
      name: 'screen_view',
      properties: {
        __title: `Testing OpenPanel - ${project.name}`,
        __path: `${project.domain}`,
        __referrer: `${import.meta.env.VITE_DASHBOARD_URL}`,
      },
    },
  };

  if (project.types.includes('app')) {
    payload.payload.properties.__path = '/';
    delete payload.payload.properties.__referrer;
  }

  if (project.types.includes('backend')) {
    payload.payload.name = 'test_event';
    payload.payload.properties = {};
  }

  const code = `curl -X POST ${import.meta.env.VITE_API_URL}/track \\
-H "Content-Type: application/json" \\
-H "openpanel-client-id: ${client.id}" \\
-H "openpanel-client-secret: ${secret}" \\
-H "User-Agent: ${typeof window !== 'undefined' ? window.navigator.userAgent : ''}" \\
-d '${JSON.stringify(payload)}'`;

  return (
    <div className="card">
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger
            className="px-6"
            onClick={() => {
              clipboard(code, null);
            }}
          >
            Try out the curl command
          </AccordionTrigger>
          <AccordionContent className="p-0">
            <Syntax code={code} language="bash" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
