/*
  Warnings:

  - You are about to drop the column `cors` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `crossDomain` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the `bot_event_buffer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `event_buffer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profile_buffer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `profiles` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `waitlist` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "events" DROP CONSTRAINT "events_projectId_fkey";

-- DropForeignKey
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_projectId_fkey";

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "cors",
DROP COLUMN "crossDomain";

-- DropTable
DROP TABLE "bot_event_buffer";

-- DropTable
DROP TABLE "event_buffer";

-- DropTable
DROP TABLE "events";

-- DropTable
DROP TABLE "profile_buffer";

-- DropTable
DROP TABLE "profiles";

-- DropTable
DROP TABLE "waitlist";
