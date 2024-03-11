-- CreateTable
CREATE TABLE "recent_dashboards" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "dashboard_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "recent_dashboards_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "recent_dashboards" ADD CONSTRAINT "recent_dashboards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
