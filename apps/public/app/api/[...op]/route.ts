import {
  createNextRouteHandler,
  createScriptHandler,
} from '@openpanel/nextjs/server';

export const POST = createNextRouteHandler();
export const GET = createScriptHandler();
