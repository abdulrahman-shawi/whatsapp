ALTER TABLE "Workspace"
ADD COLUMN "trialStartedAt" TIMESTAMP(3),
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "subdomain" TEXT,
ADD COLUMN "customDomain" TEXT,
ADD COLUMN "customDomainVerificationToken" TEXT,
ADD COLUMN "customDomainVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Workspace_subdomain_key" ON "Workspace"("subdomain");
CREATE UNIQUE INDEX "Workspace_customDomain_key" ON "Workspace"("customDomain");
