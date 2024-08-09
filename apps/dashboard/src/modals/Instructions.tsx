import Syntax from '@/components/syntax';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, LinkButton } from '@/components/ui/button';
import {
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ExternalLinkIcon, XIcon } from 'lucide-react';

import type { IServiceClient } from '@openpanel/db';
import type { frameworks } from '@openpanel/sdk-info';

import { popModal } from '.';

type Props = {
  client: IServiceClient | null;
  framework:
    | (typeof frameworks.website)[number]
    | (typeof frameworks.app)[number]
    | (typeof frameworks.backend)[number];
};

const Header = ({ framework }: Pick<Props, 'framework'>) => (
  <SheetHeader>
    <SheetTitle>Instructions for {framework.name}</SheetTitle>
  </SheetHeader>
);

const Footer = ({ framework }: Pick<Props, 'framework'>) => (
  <SheetFooter>
    <Button
      variant={'secondary'}
      className="flex-1"
      onClick={() => popModal()}
      icon={XIcon}
    >
      Close
    </Button>
    <LinkButton
      target="_blank"
      href={framework.href}
      className="flex-1"
      icon={ExternalLinkIcon}
    >
      More details
    </LinkButton>
  </SheetFooter>
);

const Instructions = ({ framework, client }: Props) => {
  const { name } = framework;
  const clientId = client?.id || 'REPLACE_WITH_YOUR_CLIENT';
  const clientSecret = client?.secret || 'REPLACE_WITH_YOUR_SECRET';
  if (
    name === 'HTML / Script' ||
    name === 'React' ||
    name === 'Astro' ||
    name === 'Remix' ||
    name === 'Vue'
  ) {
    return (
      <div className="flex flex-col gap-4">
        <p>Copy the code below and insert it to you website</p>
        <Syntax
          code={`window.op = window.op||function(...args){(window.op.q=window.op.q||[]).push(args);};
  window.op('init', {
    clientId: '${clientId}',
    trackScreenViews: true,
    trackOutgoingLinks: true,
    trackAttributes: true,
  });`}
        />
        <Alert>
          <AlertDescription>
            We have already added your client id to the snippet.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (name === 'Next.js') {
    return (
      <div className="flex flex-col gap-4">
        <p>Install dependencies</p>
        <Syntax code={`pnpm install @openpanel/nextjs`} />
        <p>Add OpenPanelComponent to your root layout</p>
        <Syntax
          code={`import { OpenPanelComponent } from '@openpanel/nextjs';
 
 export default RootLayout({ children }) {
   return (
     <>
       <OpenPanelComponent
         clientId="${clientId}"
         trackScreenViews={true}
         trackAttributes={true}
         trackOutgoingLinks={true}
         // If you have a user id, you can pass it here to identify the user
         // profileId={'123'}
       />
       {children}
     </>
   )
 }`}
        />
        <p>
          This will track regular page views and outgoing links. You can also
          track custom events.
        </p>
        <Syntax
          code={`import { useOpenPanel } from '@openpanel/nextjs';
 
// Sends an event with payload foo: bar
useOpenPanel().track('my_event', { foo: 'bar' });
`}
        />
      </div>
    );
  }

  if (name === 'Laravel') {
    return (
      <div className="flex flex-col gap-4">
        <p>Install dependencies</p>
        <Syntax code={`composer require bleckert/openpanel-laravel`} />
        <p>Add environment variables</p>
        <Syntax
          code={`OPENPANEL_CLIENT_ID=${clientId}
OPENPANEL_CLIENT_SECRET=${clientSecret}`}
        />
        <p>Usage</p>
        <Syntax
          code={`use Bleckert\\OpenpanelLaravel\\Openpanel;

$openpanel = app(Openpanel::class);

// Identify user
$openpanel->setProfileId(1);

// Update user profile
$openpanel->setProfile(
  id: 1,
  firstName: 'John Doe',
  // ...
);

// Track event
$openpanel->event(
  name: 'User registered',
);
          `}
        />
        <Alert>
          <AlertTitle>Shoutout!</AlertTitle>
          <AlertDescription>
            Huge shoutout to{' '}
            <a
              href="https://twitter.com/tbleckert"
              target="_blank"
              className="underline"
            >
              @tbleckert
            </a>{' '}
            for creating this package.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (name === 'Rest API') {
    return (
      <div className="flex flex-col gap-4">
        <strong>Authentication</strong>
        <p>You will need to pass your client ID and secret via headers.</p>
        <strong>Usage</strong>
        <p>Create a custom event called &quot;my_event&quot;.</p>
        <Syntax
          code={`curl 'https://api.openpanel.dev/track' \\
  -H 'content-type: application/json' \\
  -H 'openpanel-client-id: ${clientId}' \\
  -H 'openpanel-client-secret: ${clientSecret}' \\
  --data-raw '{
  "type": "track",
  "payload": {
    "name": "my_event",
    "properties": {
      "foo": "bar"
    }
  }
}'`}
        />
        <p>The payload should be a JSON object with the following fields:</p>
        <ul className="list-inside list-disc">
          <li>
            &quot;type&quot; (string): track | identify | alias | increment |
            decrement
          </li>
          <li>&quot;payload.name&quot; (string): The name of the event.</li>
          <li>
            &quot;payload.properties&quot; (object): The properties of the
            event.
          </li>
        </ul>
      </div>
    );
  }

  if (name === 'Express') {
    return (
      <div className="flex flex-col gap-4">
        <strong>Install dependencies</strong>
        <Syntax code={`npm install @openpanel/express`} />

        <strong>Usage</strong>
        <p>Connect the middleware to your app.</p>
        <Syntax
          code={`import express from 'express';
import createOpenpanelMiddleware from '@openpanel/express';
  
const app = express();
  
app.use(
  createOpenpanelMiddleware({
    clientId: '${clientId}',
    clientSecret: '${clientSecret}',
    // trackRequest(url) {
    //   return url.includes('/v1')
    // },
    // getProfileId(req) {
    //   return req.user.id
    // }
  })
);
  
app.get('/sign-up', (req, res) => {
  // track sign up events
  req.op.track('sign-up', {
    email: req.body.email,
  });
  res.send('Hello World');
});
  
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});`}
        />
      </div>
    );
  }

  if (name === 'Node') {
    return (
      <div className="flex flex-col gap-4">
        <strong>Install dependencies</strong>
        <Syntax code={`pnpm install @openpanel/sdk`} />

        <strong>Create a instance</strong>
        <p>
          Create a new instance of OpenPanel. You can use this SDK in any JS
          environment. You should omit clientSecret if you use this on web!
        </p>
        <Syntax
          code={`import { OpenPanel } from '@openpanel/sdk';
 
const op = new OpenPanel({
  clientId: '${clientId}',
  // mostly for backend and apps that can't rely on CORS
  clientSecret: '${clientSecret}',
});`}
        />
        <strong>Usage</strong>
        <Syntax
          code={`import { op } from './openpanel';
          
// Sends an event with payload foo: bar
op.track('my_event', { foo: 'bar' });
  
// Identify with profile id
op.identify({ profileId: '123' });
  
// or with additional data
op.identify({
  profileId: '123',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@openpanel.dev',
});
  
// Increment a property
op.increment({ name: 'app_opened', profile_id: '123' }); // increment by 1
op.increment({ name: 'app_opened', profile_id: '123', value: 5 }); // increment by 5
  
// Decrement a property
op.decrement({ name: 'app_opened', profile_id: '123' }); // decrement by 1
op.decrement({ name: 'app_opened', profile_id: '123', value: 5 }); // decrement by 5`}
        />
      </div>
    );
  }

  if (name === 'React-Native') {
    return (
      <div className="flex flex-col gap-4">
        <strong>Install dependencies</strong>
        <p>Don&apos;t forget to install the peer dependencies as well!</p>
        <Syntax
          code={`pnpm install @openpanel/react-native
npx expo install --pnpm expo-application expo-constants`}
        />
        <strong>Create a instance</strong>
        <p>
          Create a new instance of OpenpanelSdk. You can use this SDK in any JS
          environment. You should omit clientSecret if you use this on web!
        </p>
        <Syntax
          code={`import { OpenPanel } from '@openpanel/react-native';
 
const op = new OpenPanel({
  clientId: '${clientId}',
  clientSecret: '${clientSecret}',
});`}
        />
        <strong>Usage</strong>
        <Syntax
          code={`import { op } from './openpanel';
          
// Sends an event with payload foo: bar
op.track('my_event', { foo: 'bar' });
  
// Identify with profile id
op.identify({ profileId: '123' });
  
// or with additional data
op.identify({
  profileId: '123',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@openpanel.dev',
});
  
// Increment a property
op.increment({ name: 'app_opened', profile_id: '123' }); // increment by 1
op.increment({ name: 'app_opened', profile_id: '123', value: 5 }); // increment by 5
  
// Decrement a property
op.decrement({ name: 'app_opened', profile_id: '123' }); // decrement by 1
op.decrement({ name: 'app_opened', profile_id: '123', value: 5 }); // decrement by 5`}
        />
        <strong>Navigation</strong>
        <p>
          Check out our{' '}
          <a
            href="https://github.com/Openpanel-dev/examples/tree/main/expo-app"
            target="_blank"
            className="underline"
          >
            example app
          </a>{' '}
          . See below for a quick demo.
        </p>
        <Syntax
          code={`function RootLayoutNav() {
  const pathname = usePathname()
 
  useEffect(() => {
    op.screenView(pathname)
  }, [pathname])

  return (
      <Stack>
        {/*... */}
      </Stack>
  );
}`}
        />
      </div>
    );
  }
};

export default function InsdtructionsWithModalContent(props: Props) {
  return (
    <SheetContent>
      <Header framework={props.framework} />
      <Instructions {...props} />
      <Footer framework={props.framework} />
    </SheetContent>
  );
}
