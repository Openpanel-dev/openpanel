import { useRouteContext } from '@tanstack/react-router';

export function FeedbackWidgetScripts() {
  const { isSelfHosted } = useRouteContext({ strict: false });

  // Anything but an explicit false stays off: a self-hosted install may have no
  // route to the widget's CDN at all.
  if (isSelfHosted !== false) {
    return null;
  }

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.$ujq=window.$ujq||[];window.uj=window.uj||new Proxy({},{get:(_,p)=>(...a)=>window.$ujq.push([p,...a])});document.head.appendChild(Object.assign(document.createElement('script'),{src:'https://cdn.userjot.com/sdk/v2/uj.js',type:'module',async:!0}));`,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.uj.init('cm6thlmwr03xr13jghznx87gk', { widget: true, trigger: 'custom' });`,
        }}
      />
    </>
  );
}
