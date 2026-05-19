-- CreateEnum
CREATE TYPE "TrialVoteOption" AS ENUM ('PASS', 'FAIL', 'EXTEND');

-- CreateTable
CREATE TABLE "TrialVotePoll" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "trialId" INTEGER NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "messageId" TEXT,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialVotePoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialVote" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "pollId" INTEGER NOT NULL,
    "officerId" TEXT NOT NULL,
    "option" "TrialVoteOption" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialVotePoll_messageId_key" ON "TrialVotePoll"("messageId");

-- CreateIndex
CREATE INDEX "TrialVotePoll_guildId_idx" ON "TrialVotePoll"("guildId");

-- CreateIndex
CREATE INDEX "TrialVotePoll_guildId_trialId_idx" ON "TrialVotePoll"("guildId", "trialId");

-- CreateIndex
CREATE INDEX "TrialVotePoll_guildId_open_idx" ON "TrialVotePoll"("guildId", "open");

-- CreateIndex
CREATE INDEX "TrialVote_guildId_idx" ON "TrialVote"("guildId");

-- CreateIndex
CREATE INDEX "TrialVote_guildId_pollId_idx" ON "TrialVote"("guildId", "pollId");

-- CreateIndex
CREATE UNIQUE INDEX "TrialVote_pollId_officerId_key" ON "TrialVote"("pollId", "officerId");

-- AddForeignKey
ALTER TABLE "TrialVotePoll" ADD CONSTRAINT "TrialVotePoll_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "Trial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialVote" ADD CONSTRAINT "TrialVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "TrialVotePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
