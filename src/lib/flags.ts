// Feature flags for incremental "drops". Launch the beta with the core; flip a
// flag to true (and announce it in the group) to release the next feature.
// One source of truth — gates both the entry buttons and the routes.
export const FLAGS = {
  luckyServe: false, // 🎰 Lucky Serve roulette
  swipeDeck: false,  // 💘 Mystery Match swipe deck
  guestPeek: true,   // 👀 logged-out visitors can see board/players/leaders (read-only)
};
