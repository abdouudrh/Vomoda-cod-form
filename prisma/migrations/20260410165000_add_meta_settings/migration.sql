-- CreateTable
CREATE TABLE IF NOT EXISTS "MetaSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "metaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "metaPixelId" TEXT,
    "metaConversionsApiToken" TEXT,
    "metaTestEventCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
