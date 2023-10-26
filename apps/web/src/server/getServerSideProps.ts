import {
  type GetServerSidePropsContext,
  type GetServerSidePropsResult,
} from "next";
import { getServerAuthSession } from "./auth";

export function createServerSideProps(
  cb?: (context: GetServerSidePropsContext) => Promise<any>,
) {
  return async function getServerSideProps(
    context: GetServerSidePropsContext,
  ): Promise<GetServerSidePropsResult<any>> {
    const session = await getServerAuthSession(context);

    if(!session) {
      return {
        redirect: {
          destination: "/api/auth/signin",
          permanent: false,
        },
      }
    }

    const res = await (typeof cb === "function"
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
