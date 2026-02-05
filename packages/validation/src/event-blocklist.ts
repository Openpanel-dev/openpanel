const MAX_EVENT_LENGTH = 80;

// Substrings that indicate attack/spam payloads
const BLOCKED_SUBSTRINGS = [
  // === Security Scanner Domains ===
  'oastify.com',
  'burpcollaborator',
  'interact.sh',
  'oast.me',

  // === SQL Injection ===
  'pg_sleep',
  'waitfor delay',
  'xp_dirtree',
  'load_file(',
  'extractvalue(',
  'dbms_pipe.receive_message',
  'union select',

  // === Command Injection ===
  'nslookup ',
  '/bin/sleep',
  '/bin/bash',
  'cmd.exe',
  'wget+http',
  'wget http',
  'chmod+777',
  'chmod 777',

  // === Java/Code Execution ===
  'processbuilder',
  'runtime.getruntime',
  'java.lang.processbuilder',
  'eval-stdin.php',

  // === Path Traversal ===
  '../',
  '..\\',
  '%2e%2e',
  '%u002e%u002e',
  '/etc/passwd',
  '/etc/shadow',
  'win.ini',
  'system.ini',

  // === Template/SSTI Injection ===
  '${',
  '%{',

  // === XXE / XML Attacks ===
  '<!doctype',
  '<!entity',
  '<xi:include',
  'xsi:schemalocation',

  // === SMTP Header Injection ===
  '\r\n',
  'bcc:',

  // === Common File Scanning (paths as events) ===
  'phpinfo.php',
  'wp-config.php',
  '.git/config',
  '.env.backup',
  '.env.bak',
  '/vendor/phpunit/',

  // === Malware/Botnet Indicators ===
  'mozi.m',
  '/setup.cgi?',
  '/cgi-bin/',

  // === Ruby Object Inspection Leaks ===
  '#<article:0x',
  '#<video:0x',
  '#<brand:0x',

  // === SQL Injection Patterns ===
  'exec master.dbo',
  'declare @',
  "' and '",
  "' or '",
  "') or ",
  "')and ",
];

// Patterns that indicate the "event" is actually a URL path being scanned
const PATH_SCAN_PATTERNS = [
  /^\/[a-z_-]+\.(php|env|yml|yaml|json|xml|config|ini|bak|sql|log)/i,
  /^\/\.[a-z]/i, // Hidden files like /.env, /.git
  /^\/(wp-|wordpress)/i, // WordPress scanning
  /^\/phpmyadmin/i,
  /^\/.+\.php$/i, // Any .php path
];

/**
 * Check if an event name should be blocked
 * @param name - The event name to check
 * @returns true if the event name should be blocked, false otherwise
 */
export function isBlockedEventName(name: string): boolean {
  // Length check - attack payloads are often very long
  if (name.length > MAX_EVENT_LENGTH) return true;

  // Contains newlines (always suspicious for event names)
  if (name.includes('\n') || name.includes('\r')) return true;

  // Substring blocklist (case-insensitive)
  const lower = name.toLowerCase();
  if (BLOCKED_SUBSTRINGS.some((blocked) => lower.includes(blocked))) {
    return true;
  }

  // Path scanning patterns
  if (PATH_SCAN_PATTERNS.some((pattern) => pattern.test(name))) {
    return true;
  }

  return false;
}
