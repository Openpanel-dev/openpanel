export type HtmlProps<T> = Omit<
  React.DetailedHTMLProps<React.HTMLAttributes<T>, T>,
  'ref'
>;

export type OAuthStrategy = 'oauth_google' | 'oauth_github';
