/*
  Warnings:

  - Added the required column `updatedAt` to the `PaymentRecord` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelId" TEXT NOT NULL,
    "callerAddress" TEXT NOT NULL,
    "amountMicrounit" INTEGER NOT NULL,
    "platformFeeMicrounit" INTEGER NOT NULL,
    "providerAmountMicrounit" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "txStatus" TEXT NOT NULL DEFAULT 'submitted',
    "txStatusUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentRecord_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AiModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PaymentRecord" ("amountMicrounit", "callerAddress", "createdAt", "error", "id", "modelId", "paymentRef", "platformFeeMicrounit", "providerAmountMicrounit", "success", "txHash") SELECT "amountMicrounit", "callerAddress", "createdAt", "error", "id", "modelId", "paymentRef", "platformFeeMicrounit", "providerAmountMicrounit", "success", "txHash" FROM "PaymentRecord";
DROP TABLE "PaymentRecord";
ALTER TABLE "new_PaymentRecord" RENAME TO "PaymentRecord";
CREATE UNIQUE INDEX "PaymentRecord_txHash_key" ON "PaymentRecord"("txHash");
CREATE UNIQUE INDEX "PaymentRecord_paymentRef_key" ON "PaymentRecord"("paymentRef");
CREATE INDEX "PaymentRecord_modelId_idx" ON "PaymentRecord"("modelId");
CREATE INDEX "PaymentRecord_callerAddress_idx" ON "PaymentRecord"("callerAddress");
CREATE INDEX "PaymentRecord_createdAt_idx" ON "PaymentRecord"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
