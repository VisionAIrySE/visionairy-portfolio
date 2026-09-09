ALTER TABLE "OutreachMessage"
ADD COLUMN "deliveryState" TEXT,
ADD COLUMN "deliveryKey" TEXT,
ADD COLUMN "deliveryClaimedAt" TIMESTAMP(3),
ADD COLUMN "deliveryLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "deliveryLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "deliveryTo" TEXT,
ADD COLUMN "deliveryFrom" TEXT,
ADD COLUMN "deliverySubject" TEXT,
ADD COLUMN "deliveryHtml" TEXT,
ADD COLUMN "deliveryText" TEXT,
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "deliveryError" TEXT;

CREATE UNIQUE INDEX "OutreachMessage_deliveryKey_key" ON "OutreachMessage"("deliveryKey");
CREATE INDEX "OutreachMessage_deliveryState_deliveryLeaseExpiresAt_idx"
ON "OutreachMessage"("deliveryState", "deliveryLeaseExpiresAt");
