-- AlterEnum: قيم منصات جديدة (Postgres لا يسمح بإلغاء/تعديل — إضافة فقط)
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'TELEGRAM';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'MESSENGER';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'INSTAGRAM';

-- Agent: رد خارج أوقات الدوام
ALTER TABLE "Agent" ADD COLUMN "offHoursReply" TEXT;

-- BroadcastCampaign: اختبار A/B
ALTER TABLE "BroadcastCampaign" ADD COLUMN "linkUrlB" TEXT;
ALTER TABLE "BroadcastCampaign" ADD COLUMN "bodyB" TEXT;
ALTER TABLE "BroadcastCampaign" ADD COLUMN "sentCountB" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BroadcastCampaign" ADD COLUMN "failedCountB" INTEGER NOT NULL DEFAULT 0;

-- BroadcastClick: تتبع نسخة A/B لكل نقرة
ALTER TABLE "BroadcastClick" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'A';

-- MediaAsset: مجلدات المكتبة
ALTER TABLE "MediaAsset" ADD COLUMN "folder" TEXT NOT NULL DEFAULT '';

-- Contact: نقاط العميل المحتمل
ALTER TABLE "Contact" ADD COLUMN "leadScore" INTEGER NOT NULL DEFAULT 0;

-- جدول جديد: سجل مراحل العميل
CREATE TABLE "ContactStageHistory" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stage" "ContactStage" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactStageHistory_pkey" PRIMARY KEY ("id")
);

-- جدول جديد: إصدارات الوكيل
CREATE TABLE "AgentVersion" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "welcomeMessage" TEXT NOT NULL,
    "responseDelaySec" INTEGER NOT NULL,
    "handoffKeywords" TEXT[],
    "knowledge" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactStageHistory_contactId_createdAt_idx" ON "ContactStageHistory"("contactId", "createdAt");
CREATE INDEX "AgentVersion_agentId_createdAt_idx" ON "AgentVersion"("agentId", "createdAt");

ALTER TABLE "ContactStageHistory" ADD CONSTRAINT "ContactStageHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentVersion" ADD CONSTRAINT "AgentVersion_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
