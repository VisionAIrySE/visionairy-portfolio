-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" TEXT NOT NULL,
    "callKey" TEXT,
    "outcome" TEXT NOT NULL,
    "wentHow" TEXT,
    "nextWhat" TEXT,
    "nextWhen" DATETIME,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallLog_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prospect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameManualValue" TEXT,
    "phone" TEXT,
    "phoneManualValue" TEXT,
    "website" TEXT,
    "websiteManualValue" TEXT,
    "address" TEXT,
    "addressManualValue" TEXT,
    "normalizedPhone" TEXT,
    "normalizedDomain" TEXT,
    "employeeCount" INTEGER,
    "employeeCountManualValue" INTEGER,
    "headcountSourceUrl" TEXT,
    "headcountStatus" TEXT,
    "email" TEXT,
    "emailManualValue" TEXT,
    "emailConfidence" REAL,
    "emailStatus" TEXT,
    "segment" TEXT,
    "auditFee" INTEGER,
    "guaranteedHours" INTEGER,
    "captureRunId" TEXT,
    "fieldSource" TEXT,
    "fetchedAt" DATETIME,
    "stage" TEXT NOT NULL DEFAULT 'NO_CONTACT',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "quotedAt" DATETIME,
    "quotedHeadcount" INTEGER,
    "quotedBand" TEXT,
    "quotedAuditFee" INTEGER,
    "quotedGuaranteedHours" INTEGER,
    "contactName" TEXT,
    "contactRole" TEXT,
    "isDecisionMaker" BOOLEAN,
    "ownerName" TEXT,
    "paidAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAction" TEXT,
    "nextActionDate" DATETIME,
    "lostReason" TEXT,
    "reactivateAfter" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prospect_captureRunId_fkey" FOREIGN KEY ("captureRunId") REFERENCES "CaptureRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Prospect" ("address", "addressManualValue", "auditFee", "captureRunId", "createdAt", "doNotContact", "email", "emailConfidence", "emailManualValue", "emailStatus", "employeeCount", "employeeCountManualValue", "fetchedAt", "fieldSource", "guaranteedHours", "headcountSourceUrl", "headcountStatus", "id", "name", "nameManualValue", "normalizedDomain", "normalizedPhone", "phone", "phoneManualValue", "placeId", "segment", "stage", "updatedAt", "website", "websiteManualValue") SELECT "address", "addressManualValue", "auditFee", "captureRunId", "createdAt", "doNotContact", "email", "emailConfidence", "emailManualValue", "emailStatus", "employeeCount", "employeeCountManualValue", "fetchedAt", "fieldSource", "guaranteedHours", "headcountSourceUrl", "headcountStatus", "id", "name", "nameManualValue", "normalizedDomain", "normalizedPhone", "phone", "phoneManualValue", "placeId", "segment", "stage", "updatedAt", "website", "websiteManualValue" FROM "Prospect";
DROP TABLE "Prospect";
ALTER TABLE "new_Prospect" RENAME TO "Prospect";
CREATE UNIQUE INDEX "Prospect_placeId_key" ON "Prospect"("placeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_callKey_key" ON "CallLog"("callKey");
