const express = require('express');
const app = express();
const redirects = [
  ['/', 'https://openpanel.dev/'],
  ['/docs', 'https://openpanel.dev/docs'],
  ['/docs/sdks/script', 'https://openpanel.dev/docs/sdks/script'],
  ['/docs/sdks/web', 'https://openpanel.dev/docs/sdks/script'],
  ['/docs/sdks/javascript', 'https://openpanel.dev/docs/sdks/node'],
  ['/docs/sdks/react', 'https://openpanel.dev/docs/sdks/react'],
  ['/docs/sdks/nextjs', 'https://openpanel.dev/docs/sdks/nextjs'],
  ['/docs/sdks/remix', 'https://openpanel.dev/docs/sdks/remix'],
  ['/docs/sdks/vue', 'https://openpanel.dev/docs/sdks/vue'],
  ['/docs/sdks/astro', 'https://openpanel.dev/docs/sdks/astro'],
  ['/docs/sdks/react-native', 'https://openpanel.dev/docs/sdks/react-native'],
  ['/docs/sdks/node', 'https://openpanel.dev/docs/sdks/node'],
  ['/docs/sdks/express', 'https://openpanel.dev/docs/sdks/express'],
  ['/docs/sdks/api', 'https://openpanel.dev/docs/api/track'],
  ['/docs/sdks/export', 'https://openpanel.dev/docs/api/export'],
  [
    '/docs/self-hosting',
    'https://openpanel.dev/docs/self-hosting/self-hosting',
  ],
];

// Handle redirects for all defined routes
redirects.forEach(([from, to]) => {
  app.get(from, (req, res) => {
    console.log('redirecting', {
      from,
      to,
    });

    res.redirect(302, to);
  });
});

// Optional: Catch-all route for undefined routes
app.get('*', (req, res) => {
  console.log('fallback redirect', req.url);
  res.redirect(302, 'https://openpanel.dev/docs');
});

app.listen(3000);
