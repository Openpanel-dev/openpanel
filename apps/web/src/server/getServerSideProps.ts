import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

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
      const user = await db.user.findFirst({
        where: {
          id: session.user.id,
          organization: {
            slug: context.params.organization as string,
          },
        },
      });

      if (!user) {
        return {
          notFound: true,
        };
      }
    } else {
      const user = await db.user.findFirst({
        where: {
          id: session.user.id,
        },
        include: {
          organization: true,
        },
      });

      if (!user) {
        return {
          notFound: true,
        };
      }

      if (user.organization) {
        return {
          redirect: {
            destination: `/${user.organization.slug}`,
            permanent: false,
          },
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
