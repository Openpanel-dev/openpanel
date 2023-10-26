import { MainLayout } from "@/components/layouts/MainLayout";
import { api } from "@/utils/api";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { createServerSideProps } from "@/server/getServerSideProps";

export const getServerSideProps = createServerSideProps()

export default function Home() {
  const router = useRouter()
  const query = api.organization.current.useQuery();
  const organization = query.data ?? null;

  useEffect(() => {
    if(organization) {
      router.replace(`/${organization.slug}`)
    }
  }, [organization])

  return (
    <MainLayout>
      <div />
    </MainLayout>
  );
}
