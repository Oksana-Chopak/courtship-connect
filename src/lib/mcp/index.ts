import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listUrgentSos from "./tools/list-urgent-sos";
import listOpenGames from "./tools/list-open-games";
import listMyGames from "./tools/list-my-games";
import applyToGame from "./tools/apply-to-game";
import communityStats from "./tools/community-stats";
import findPlayers from "./tools/find-players";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "courtship-connect",
  title: "Courtship Connect",
  version: "0.1.0",
  instructions:
    "Tools for Courtship, a tennis partner-matching community. Read the board (urgent SOS games and planned open games), " +
    "see the signed-in player's own posted games, browse suggested players, read community stats, and apply to a game. " +
    "All tools act as the signed-in Courtship player.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listUrgentSos, listOpenGames, listMyGames, findPlayers, communityStats, applyToGame],
});
