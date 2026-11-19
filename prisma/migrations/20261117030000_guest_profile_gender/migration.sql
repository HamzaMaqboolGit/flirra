CREATE TYPE "GuestGender" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');
ALTER TABLE "UserProfile" ADD COLUMN "guestGender" "GuestGender";
