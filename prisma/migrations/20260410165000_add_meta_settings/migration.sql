-- CreateTable
CREATE TABLE IF NOT EXISTS "MetaSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "metaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "metaPixelId" TEXT,
    "metaConversionsApiToken" TEXT,
    "metaTestEventCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
