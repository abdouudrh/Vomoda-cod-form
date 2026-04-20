-- CreateTable
CREATE TABLE "ShippingSettings" (
    "shop" TEXT NOT NULL,
    "feesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShippingSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ShopAccess" (
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAccess_pkey" PRIMARY KEY ("shop")
);
