/**
 * Request URLs are logged as plain strings, so the logger's key-based
 * redaction never looks inside them. Some routes take credentials in the
 * query string (the MCP endpoint accepts `?token=`), which would otherwise
 * land verbatim in request logs.
 *
 * Re-exported from the logger package so the sensitive-parameter list has a
 * single definition.
 */
export { sanitizeUrlQuery as sanitizeUrl } from '@openpanel/logger';
