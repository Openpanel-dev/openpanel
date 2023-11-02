import {
  type GetServerSidePropsContext,
  type GetServerSidePropsResult,
} from 'next';

import { getServerAuthSession } from './auth';
import { db } from './db';

export function createServerSideProps(
  cb?: (context: GetServerSidePropsContext) => Promise<any>
) {
  return async function getServerSideProps(
    context: GetServerSidePropsContext
  ): Promise<GetServerSidePropsResult<any>> {
    const session = await getServerAuthSession(context);

    if (!session) {
      return {
        redirect: {
          destination: '/api/auth/signin',
          permanent: false,
        },
      };
    }

    if (context.params?.organization) {
      const organization = await db.user.findFirst({
        where: {
          id: session.user.id,
          organization: {
            slug: context.params.organization as string,
          },
        },
      });

      if (!organization) {
        return {
          notFound: true,
        };
      }
    }

    const res = await (typeof cb === 'function'
      ? cb(context)
      : Promise.resolve({}));
    return {
      ...(res ?? {}),
      props: {
        session,
        ...(res?.props ?? {}),
      },
    };
  };
}
