-- Add the missing relation between GameResult and Game so that results
-- can always resolve their game even when they are not attached to a room
-- (solo Guess the Image results have roomId = NULL).
ALTER TABLE "GameResult"
  ADD CONSTRAINT "GameResult_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
