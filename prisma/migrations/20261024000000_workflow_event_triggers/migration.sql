ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CONVERSATION_STARTED';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CONVERSATION_ENDED';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CONTACT_FIELD_UPDATED';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CONTACT_TAG_UPDATED';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'SHORTCUT';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'INCOMING_WEBHOOK';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CLICK_TO_CHAT_AD';

CREATE TABLE "WorkflowContactActivation" (
    "workflowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowContactActivation_pkey" PRIMARY KEY ("workflowId", "contactId")
);

CREATE INDEX "WorkflowContactActivation_contactId_idx"
ON "WorkflowContactActivation"("contactId");

ALTER TABLE "WorkflowContactActivation"
ADD CONSTRAINT "WorkflowContactActivation_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowContactActivation"
ADD CONSTRAINT "WorkflowContactActivation_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
