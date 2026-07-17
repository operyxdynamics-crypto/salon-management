ALTER TABLE "RegisterSession" ADD COLUMN "openingNote" TEXT;
ALTER TABLE "RegisterSession" ADD COLUMN "closingNote" TEXT;
ALTER TABLE "RegisterSession" ADD COLUMN "openIdempotencyKey" TEXT;
ALTER TABLE "RegisterSession" ADD COLUMN "closeIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "RegisterSession_openIdempotencyKey_key" ON "RegisterSession"("openIdempotencyKey");
CREATE UNIQUE INDEX "RegisterSession_closeIdempotencyKey_key" ON "RegisterSession"("closeIdempotencyKey");
