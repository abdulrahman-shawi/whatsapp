CREATE TABLE "DailyWorkspaceReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportDate" VARCHAR(10) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "DailyWorkspaceReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyWorkspaceReport_workspaceId_reportDate_key"
ON "DailyWorkspaceReport"("workspaceId", "reportDate");

CREATE INDEX "DailyWorkspaceReport_status_reportDate_idx"
ON "DailyWorkspaceReport"("status", "reportDate");

ALTER TABLE "DailyWorkspaceReport"
ADD CONSTRAINT "DailyWorkspaceReport_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
