ALTER TABLE "Conversation"
ADD COLUMN "isCritical" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "criticalAt" TIMESTAMP(3);

CREATE INDEX "Conversation_workspaceId_isCritical_lastMessageAt_idx"
ON "Conversation"("workspaceId", "isCritical", "lastMessageAt");

ALTER TABLE "Agent"
ADD COLUMN "voiceReplies" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AgentVersion"
ADD COLUMN "voiceReplies" BOOLEAN NOT NULL DEFAULT false;
