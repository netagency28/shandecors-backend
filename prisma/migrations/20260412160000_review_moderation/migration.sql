-- CreateEnum
CREATE TYPE "ReviewModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable (existing reviews stay visible on storefront)
ALTER TABLE "reviews" ADD COLUMN "moderationStatus" "ReviewModerationStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "reviews" ADD COLUMN "adminReply" TEXT;
ALTER TABLE "reviews" ADD COLUMN "adminRepliedAt" TIMESTAMP(3);

ALTER TABLE "reviews" ALTER COLUMN "moderationStatus" SET DEFAULT 'PENDING';
