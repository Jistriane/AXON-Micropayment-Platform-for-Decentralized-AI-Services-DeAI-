-- CreateTable
CREATE TABLE "AiModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "priceMicrounit" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRecord_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AiModel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiModel_providerAddress_idx" ON "AiModel"("providerAddress");

-- CreateIndex
CREATE INDEX "AiModel_active_idx" ON "AiModel"("active");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_txHash_key" ON "PaymentRecord"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_paymentRef_key" ON "PaymentRecord"("paymentRef");

-- CreateIndex
CREATE INDEX "PaymentRecord_modelId_idx" ON "PaymentRecord"("modelId");

-- CreateIndex
CREATE INDEX "PaymentRecord_callerAddress_idx" ON "PaymentRecord"("callerAddress");

-- CreateIndex
CREATE INDEX "PaymentRecord_createdAt_idx" ON "PaymentRecord"("createdAt");
