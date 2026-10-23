CREATE TYPE "ConversationTopic" AS ENUM ('INQUIRY', 'COMPLAINT', 'BOOKING', 'QUOTE');

ALTER TABLE "Conversation"
ADD COLUMN "topic" "ConversationTopic";

CREATE INDEX "Conversation_workspaceId_topic_idx"
ON "Conversation"("workspaceId", "topic");
