-- CreateTable
CREATE TABLE "CRMProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sendingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "senderEmail" TEXT,
    "replyToEmail" TEXT,
    "senderVerifiedAt" TIMESTAMP(3),
    "replyRouteVerifiedAt" TIMESTAMP(3),
    "signatureText" TEXT,
    "timeZone" TEXT,
    "localSendTime" TEXT,

    CONSTRAINT "CRMProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductProspect" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NO_CONTACT',
    "archivedAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextActionDate" TIMESTAMP(3),

    CONSTRAINT "ProductProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipient" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "contactId" TEXT,
    "email" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "repliedAt" TIMESTAMP(3),

    CONSTRAINT "ProductRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSequence" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dayNumbers" INTEGER[],
    "businessDaysOnly" BOOLEAN NOT NULL,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ProductSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEnrollment" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "firstLocalDate" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,

    CONSTRAINT "ProductEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMessage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "touch" INTEGER NOT NULL,
    "evidenceFindingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deliveryState" TEXT NOT NULL DEFAULT 'DRAFT',
    "deliveryKey" TEXT,
    "deliveryPayload" JSONB,
    "attemptedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "rfcMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveryError" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductActivity" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contactId" TEXT,
    "recipientId" TEXT,
    "outcome" TEXT,
    "notes" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTask" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAddressStop" (
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAddressStop_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "ProductMailEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEmailId" TEXT,
    "fromAddress" TEXT,
    "toAddresses" TEXT[],
    "subject" TEXT,
    "textBody" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedProductId" TEXT,
    "matchedRecipientId" TEXT,
    "note" TEXT,

    CONSTRAINT "ProductMailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductProspect_productId_prospectId_key" ON "ProductProspect"("productId", "prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductProspect_id_productId_key" ON "ProductProspect"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipient_membershipId_recipientKey_key" ON "ProductRecipient"("membershipId", "recipientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipient_id_productId_key" ON "ProductRecipient"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSequence_productId_version_key" ON "ProductSequence"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSequence_id_productId_key" ON "ProductSequence"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEnrollment_id_productId_key" ON "ProductEnrollment"("id", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEnrollment_recipientId_sequenceId_key" ON "ProductEnrollment"("recipientId", "sequenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMessage_deliveryKey_key" ON "ProductMessage"("deliveryKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMessage_providerMessageId_key" ON "ProductMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMessage_rfcMessageId_key" ON "ProductMessage"("rfcMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMessage_enrollmentId_touch_key" ON "ProductMessage"("enrollmentId", "touch");

-- CreateIndex
CREATE INDEX "ProductActivity_membershipId_occurredAt_idx" ON "ProductActivity"("membershipId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductActivity_productId_eventKey_key" ON "ProductActivity"("productId", "eventKey");

-- CreateIndex
CREATE INDEX "ProductTask_productId_completedAt_dueDate_idx" ON "ProductTask"("productId", "completedAt", "dueDate");

-- CreateIndex
CREATE INDEX "ProductMailEvent_state_receivedAt_idx" ON "ProductMailEvent"("state", "receivedAt");

-- AddForeignKey
ALTER TABLE "ProductProspect" ADD CONSTRAINT "ProductProspect_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CRMProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProspect" ADD CONSTRAINT "ProductProspect_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipient" ADD CONSTRAINT "ProductRecipient_membershipId_productId_fkey" FOREIGN KEY ("membershipId", "productId") REFERENCES "ProductProspect"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSequence" ADD CONSTRAINT "ProductSequence_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CRMProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEnrollment" ADD CONSTRAINT "ProductEnrollment_recipientId_productId_fkey" FOREIGN KEY ("recipientId", "productId") REFERENCES "ProductRecipient"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEnrollment" ADD CONSTRAINT "ProductEnrollment_sequenceId_productId_fkey" FOREIGN KEY ("sequenceId", "productId") REFERENCES "ProductSequence"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMessage" ADD CONSTRAINT "ProductMessage_enrollmentId_productId_fkey" FOREIGN KEY ("enrollmentId", "productId") REFERENCES "ProductEnrollment"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductActivity" ADD CONSTRAINT "ProductActivity_membershipId_productId_fkey" FOREIGN KEY ("membershipId", "productId") REFERENCES "ProductProspect"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTask" ADD CONSTRAINT "ProductTask_membershipId_productId_fkey" FOREIGN KEY ("membershipId", "productId") REFERENCES "ProductProspect"("id", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
