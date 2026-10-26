-- القيم المحلية لمحرّكات سير العمل التي سبق إضافتها في الكود دون ترحيل
-- (CONVERSATION_OPENED/CLOSED وWEBHOOK وMANUAL) + عمود hookToken على Workflow
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CONVERSATION_OPENED';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'CONVERSATION_CLOSED';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'WEBHOOK';
ALTER TYPE "WorkflowTrigger" ADD VALUE IF NOT EXISTS 'MANUAL';

ALTER TABLE "Workflow" ADD COLUMN IF NOT EXISTS "hookToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Workflow_hookToken_key" ON "Workflow"("hookToken");
