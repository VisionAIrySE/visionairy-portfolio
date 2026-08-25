-- CreateTable
CREATE TABLE "Prospect" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prospect_captureRunId_fkey" FOREIGN KEY ("captureRunId") REFERENCES "CaptureRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProspectDuplicate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keptProspectId" TEXT NOT NULL,
    "candidatePlaceId" TEXT,
    "candidateName" TEXT,
    "matchSignal" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectDuplicate_keptProspectId_fkey" FOREIGN KEY ("keptProspectId") REFERENCES "Prospect" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaptureRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mode" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "cellsAttempted" INTEGER NOT NULL DEFAULT 0,
    "cellsCompleted" INTEGER NOT NULL DEFAULT 0,
    "placesSeen" INTEGER NOT NULL DEFAULT 0,
    "placesInserted" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ProspectFieldEdit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "valueBefore" TEXT,
    "valueAfter" TEXT,
    "correctedBy" TEXT NOT NULL,
    "correctedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectFieldEdit_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_placeId_key" ON "Prospect"("placeId");
