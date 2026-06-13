import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Lang = "en" | "sv";

const STORAGE_KEY = "courtship.lang";

type Dict = Record<string, string>;

const en: Dict = {
  // Brand / shared
  "brand.tagline": "It's a match. Literally.",
  "brand.subtitle": "Find your tennis one-night stand.",
  "brand.uppsala_beta": "Uppsala · Invite-only beta",
  "lang.switch_label": "Language",

  // Index / landing
  "index.match_a": "It's a match.",
  "index.match_b": "Literally.",
  "index.cta_invite": "Get an invite 🎾",
  "index.cta_have_account": "I already have an account",

  // Auth
  "auth.signup_title": "Join the club",
  "auth.login_title": "Welcome back",
  "auth.signup_sub": "Invite-only beta. Got a code?",
  "auth.login_sub": "Time for a hit.",
  "auth.invite_label": "Invite code",
  "auth.email_label": "Email",
  "auth.password_label": "Password",
  "auth.create_account": "Create account 🎾",
  "auth.sign_in": "Sign in",
  "auth.have_account": "Already in?",
  "auth.no_account": "New here?",
  "auth.go_login": "Sign in",
  "auth.go_signup": "Get an invite",
  "auth.invite_bad": "That invite code doesn't work. Beta is invite-only.",
  "auth.signout": "Sign out",
  "auth.signed_out": "See you on court 👋",

  // Check email
  "ce.title": "Check your email",
  "ce.sent_to": "We sent it to",
  "ce.step1": "Open your email app",
  "ce.step2": "Find the email from Courtship",
  "ce.step3_a": "Tap the",
  "ce.step3_button": "Confirm my email",
  "ce.step3_b": "button inside it",
  "ce.resend": "Resend email",
  "ce.resend_cooldown": "Resend email ({s}s)",
  "ce.resend_sending": "Sending...",
  "ce.spam_hint": "Didn't get it? Check your spam folder.",
  "ce.wrong_address": "Wrong address?",
  "ce.start_over": "Start over",
  "ce.resent_ok": "Email sent again. Check your inbox 📩",

  // Nav
  "nav.home": "Home",
  "nav.rescue": "Rescue 🚨",
  "nav.players": "Players",
  "nav.me": "Me",

  "tabs.home": "Home",
  "tabs.board": "Board",
  "tabs.players": "Players",
  "tabs.profile": "Profile",

  "board.title": "Board",
  "board.sub": "Urgent rescues and planned hits.",
  "board.seg_urgent": "Urgent",
  "board.seg_planned": "Planned",
  "board.others": "Open to everyone",

  "home.my_rescues": "Sets you've saved",

  "auth.signout_confirm_title": "Sign out?",
  "auth.signout_confirm_body": "You'll need your password to come back.",

  "date.pick": "Pick a date",
  "date.pick_title": "Pick a date",
  "date.close": "Close",
  "date.window_help": "Up to 21 days ahead. Pick a time below.",

  "court.search_placeholder": "Search your court...",
  "court.group_seeded": "Club courts",
  "court.group_custom": "Added by players",
  "court.no_matches": "No courts match.",
  "court.add_as_new": "Add \"{name}\" as a new court",
  "court.add_dialog_title": "Add this court",
  "court.area_label": "Area / neighbourhood (optional)",
  "court.area_placeholder": "e.g. Sunnersta",
  "court.add_help": "Once added, everyone in this city can pick it.",
  "court.cancel": "Cancel",
  "court.add_cta": "Add court",
  "court.added": "Court added 🎾",
  "court.close": "Close",

  "admin.courts_title": "Custom courts",
  "admin.courts_empty": "No player-added courts yet.",
  "admin.court_by": "by {name}",
  "admin.court_usage": "{n} games",
  "admin.court_hidden": "hidden",
  "admin.edit": "Edit",
  "admin.save": "Save",
  "admin.hide": "Hide",
  "admin.unhide": "Unhide",
  "admin.court_saved": "Court updated",

  // Home
  "home.lets_play": "Let's play 🎾",
  "home.save_my_set": "Save my set 🚨",
  "home.browse_players": "Browse players",
  "home.your_sos": "Your active calls",
  "home.no_active": "No active calls. Quiet day on court.",
  "home.pending_check": "Did the game happen? 🎾",
  "home.yes_played": "Yes ✅",
  "home.no_show": "No-show 🪦",
  "home.pending_q": "Did the game at {court} happen? 🎾",
  "home.yes_we_played": "Yes, we played 🎾",
  "home.didnt_happen": "Didn't happen (rain, cancelled, life)",
  "home.player_noshow": "{name} didn't show 🪦",
  "home.confirmed": "Counted. You're a regular ✨",
  "home.archived": "Archived. No worries.",
  "home.reported_noshow": "Reported — sorry that happened 💔",
  "home.my_upcoming": "My upcoming games",
  "home.cant_make_it": "Can't make it 💔",
  "home.cant_make_confirm": "Free the spot — really? No penalty either way.",
  "home.withdrawn": "Spot freed. Thanks for the heads-up 🙏",
  "home.withdrawn_reflared": "Spot freed + flare re-fired 🚨",
  "home.host_notified": "{name} can't make it — your spot is open again",

  // Install banner
  "install.title": "Add Courtship to your home screen 🚨",
  "install.sub": "Emergencies wait for no one.",
  "install.install": "Install",
  "install.show_me": "Show me how",
  "install.dismiss": "Maybe later",
  "install.ios_title": "Add to your home screen",
  "install.ios_step1": "Tap the Share button (the square with the arrow ↑)",
  "install.ios_step2": "Scroll down and tap \"Add to Home Screen\"",
  "install.ios_step3": "Tap \"Add\" — done.",
  "install.ios_close": "Got it",
  "install.notif_title": "Want to hear the flares? 🚨",
  "install.notif_sub": "Turn on notifications so SOS calls reach you when seconds count.",
  "install.notif_yes": "Turn on notifications",
  "install.notif_skip": "Not now",

  // Empty states
  "empty.directory": "No players match. Lower your standards 😉 — try widening the filters.",
  "empty.directory_cta": "Clear filters",
  "empty.buddies": "No buddies yet. Play one game and this fills itself 🤝",
  "empty.history": "Your court history starts with one tap on that big red button.",
  "empty.buddy_inbox": "No requests. You're either very popular or very new 😄",

  // Admin
  "admin.title": "The clubhouse 🛠️",
  "admin.tag": "Club admin",
  "admin.fill_rate": "SOS fill rate",
  "admin.fill_target": "Target: 60%",
  "admin.profiles_total": "Players total",
  "admin.profiles_week": "New this week",
  "admin.rescuer_optin": "Rescuer opt-in",
  "admin.buddy_pairs": "Buddy pairs",
  "admin.ghost_count": "Ghost incidents",
  "admin.by_city": "By city",
  "admin.sos_created": "SOS created (week)",
  "admin.sos_claimed": "SOS claimed (week)",
  "admin.open_posted": "Open posted (week)",
  "admin.open_filled": "Open fill %",
  "admin.median_ttc": "Median time-to-claim",
  "admin.all_time_games": "All-time confirmed games",
  "admin.minutes": "{n} min",
  "admin.invite_codes": "Invite codes",
  "admin.new_code": "New code",
  "admin.code_placeholder": "CODE",
  "admin.uses_placeholder": "uses",
  "admin.owner_placeholder": "owner email (optional)",
  "admin.create": "Create",
  "admin.deactivate": "Deactivate",
  "admin.reactivate": "Reactivate",
  "admin.created_ok": "Invite code created",

  // SOS new
  "sos.new_title": "Save my set 🚨",
  "sos.new_sub": "Tap fast. Rescuers are waiting.",
  "sos.when": "When",
  "sos.today": "Today",
  "sos.tomorrow": "Tomorrow",
  "sos.court": "Court",
  "sos.format": "Format",
  "sos.level_range": "Level range",
  "sos.anyone": "Anyone — I just want to play",
  "sos.court_status": "Court status",
  "sos.note_label": "Note (optional)",
  "sos.note_placeholder": "I'll bring balls 🎾",
  "sos.send": "Send flare 🚨",
  "sos.back": "← Back",

  // SOS detail
  "sos.broadcasting": "Broadcasting to {n} rescuers...",
  "sos.im_in": "I'm in! 🎾",
  "sos.matched": "It's a match. Literally.",
  "sos.cancel": "Cancel call",
  "sos.message_wa": "Message on WhatsApp 👋",

  // Rescue
  "rescue.title": "Rescue board",
  "rescue.empty_title": "All quiet on the courts.",
  "rescue.empty_sub": "Be the first to send a flare 🚨",
  "rescue.listening": "Listening...",

  // Players
  "players.title": "Players",
  "players.sub": "Pick your hitting partner.",
  "players.warming": "Warming up...",
  "players.empty": "Loosen the filters — your match is out there.",
  "players.message_wa": "Message on WhatsApp 👋",

  // Profile / wizard
  "me.title": "Your profile",
  "me.sub": "Tweak until it feels right.",
  "me.save": "Save changes",
  "me.updated": "Updated 🎾",
  "me.language": "Language",
  "wiz.save_see": "Save & see players",
  "wiz.next": "Next",
  "wiz.back": "Back",
  "wiz.name_label": "First name",
  "wiz.phone_label": "Phone number",
  "wiz.phone_help": "Players can reach you on WhatsApp. Your number is only shared when someone actually messages you — never shown in the app.",
  "onboarding.title": "Make your profile",
  "onboarding.sub": "Tell us how you like to play. We'll match the vibe.",
  "onboarding.welcome_in": "You're in. Game on.",

  // City + buddies
  "city.label": "City",
  "city.any": "Any city",
  "wiz.city_label": "Your home city",
  "wiz.buddy_sos_label": "SOS from my buddies",
  "wiz.buddy_sos_help": "Hear when a buddy needs you — even when rescuer mode is off.",
  "buddy.add": "Add buddy 🤝",
  "buddy.requested": "Request sent ⏳",
  "buddy.is_buddy": "Buddies ✓",
  "buddy.remove": "Remove buddy",
  "buddy.requests_title": "Buddy requests 🤝",
  "buddy.accept": "Accept",
  "buddy.decline": "Decline",
  "buddy.my_buddies": "My buddies 🤝",
  "buddy.no_buddies": "No buddies yet. Play a match — buddies happen.",
  "buddy.from_buddies": "From your buddies 🤝",
  "buddy.your_buddy": "Your buddy {name}",
  "buddy.source.played": "Played a match",
  "buddy.source.invite": "Invited you",
  "buddy.source.manual": "Manual",
  "buddy.confirm_remove": "Remove this buddy?",
  "buddy.removed": "Buddy removed",
  "buddy.request_sent": "Buddy request sent 🤝",
  "buddy.accepted": "Buddies! 🤝",
  "buddy.declined": "Declined",

  // Unified post form
  "post.new_title_urgent": "Save my set 🚨",
  "post.new_title_planned": "Post a game 🎾",
  "post.sub_urgent": "Tap fast. Rescuers are waiting.",
  "post.sub_planned": "Get it on the board. Players will find you.",
  "post.mode_urgent": "🚨 Urgent",
  "post.mode_planned": "🎾 Planned",
  "post.cta_urgent": "Send the flare 🚨",
  "post.cta_planned": "Post it 🎾",
  "post.auto_flare_label": "Auto-flare if still unfilled 🚨",
  "post.auto_flare_help": "If nobody claims by 6h before start, we'll fire an SOS for you.",
  "post.posted_toast": "Posted! It's on the board.",
  "post.sos_toast": "SOS sent 🚨",
  "post.flare_now": "Fire the flare instead 🚨",
  "post.flare_fired": "Your game went urgent — flare fired 🚨 Broadcasting to rescuers now.",
  "home.post_a_game": "+ Post a game",
  "home.open_games": "Open games 🎾",
  "home.new_match": "New match 🎾",
  "post.new_title": "New match 🎾",
  "post.pick_a_time": "Pick a time to continue.",
  "post.info_urgent": "⚡ Soon — players nearby will be alerted right now.",
  "post.info_planned": "🎾 Goes on the board for players to find.",
  "post.confirm_title": "This alerts players near you right now. Ready to send the flare?",
  "post.confirm_send": "Send 🚨",
  "post.confirm_cancel": "Not yet",
  "home.flare_prompt_title": "6h to game, still solo.",
  "home.flare_prompt_cta": "Fire the flare? 🚨",

  // Open games board
  "games.title": "Open games",
  "games.sub": "Planned hits looking for a partner.",
  "games.empty_title": "No open games yet.",
  "games.empty_sub": "Post one — players will find it 🎾",
  "games.im_in": "I'm in! 🎾",

  // Community stats
  "stats.this_week_in": "This week in {city}",
  "stats.sets_saved": "{n} sets saved",
  "stats.games_matched": "{n} games matched",
  "stats.new_buddies": "{n} new buddy pairs",
  "stats.all_time": "All-time: {n} games played in {city}",

  // Court type (indoor / outdoor)
  "ct.label": "Court type",
  "ct.indoor": "Indoor",
  "ct.outdoor": "Outdoor",
  "ct.any": "Any",
  "ct.filter_label": "Indoor / Outdoor",

  // Time slot picker
  "slot.label": "Time",
  "slot.help_uppsala": "Courts here book on the hour.",
  "slot.help_stockholm": "Courts here book on the hour or half-hour.",
};

const sv: Dict = {
  "brand.tagline": "Det är en match. Bokstavligen.",
  "brand.subtitle": "Hitta en spelpartner för ikväll.",
  "brand.uppsala_beta": "Uppsala · Endast med inbjudan",
  "lang.switch_label": "Språk",

  "index.match_a": "Det är en match.",
  "index.match_b": "Bokstavligen.",
  "index.cta_invite": "Skaffa en inbjudan 🎾",
  "index.cta_have_account": "Jag har redan ett konto",

  "auth.signup_title": "Gå med i klubben",
  "auth.login_title": "Välkommen tillbaka",
  "auth.signup_sub": "Endast med inbjudan. Har du en kod?",
  "auth.login_sub": "Dags för en match.",
  "auth.invite_label": "Inbjudningskod",
  "auth.email_label": "Mejl",
  "auth.password_label": "Lösenord",
  "auth.create_account": "Skapa konto 🎾",
  "auth.sign_in": "Logga in",
  "auth.have_account": "Redan med?",
  "auth.no_account": "Ny här?",
  "auth.go_login": "Logga in",
  "auth.go_signup": "Skaffa en inbjudan",
  "auth.invite_bad": "Den koden fungerar inte. Betan är endast med inbjudan.",
  "auth.signout": "Logga ut",
  "auth.signed_out": "Vi ses på banan 👋",

  "ce.title": "Kolla din mejl",
  "ce.sent_to": "Vi skickade den till",
  "ce.step1": "Öppna din mejl-app",
  "ce.step2": "Hitta mejlet från Courtship",
  "ce.step3_a": "Tryck på",
  "ce.step3_button": "Bekräfta min mejl",
  "ce.step3_b": "-knappen i mejlet",
  "ce.resend": "Skicka igen",
  "ce.resend_cooldown": "Skicka igen ({s}s)",
  "ce.resend_sending": "Skickar...",
  "ce.spam_hint": "Fick du inget? Kolla skräpposten.",
  "ce.wrong_address": "Fel adress?",
  "ce.start_over": "Börja om",
  "ce.resent_ok": "Mejlet är skickat igen. Kolla inkorgen 📩",

  "nav.home": "Hem",
  "nav.rescue": "Räddning 🚨",
  "nav.players": "Spelare",
  "nav.me": "Jag",

  "tabs.home": "Hem",
  "tabs.board": "Tavla",
  "tabs.players": "Spelare",
  "tabs.profile": "Profil",

  "board.title": "Tavlan",
  "board.sub": "Akuta räddningar och planerade matcher.",
  "board.seg_urgent": "Akut",
  "board.seg_planned": "Planerat",
  "board.others": "Öppet för alla",

  "home.my_rescues": "Set du räddat",

  "auth.signout_confirm_title": "Logga ut?",
  "auth.signout_confirm_body": "Du behöver ditt lösenord för att komma tillbaka.",

  "date.pick": "Välj datum",
  "date.pick_title": "Välj ett datum",
  "date.close": "Stäng",
  "date.window_help": "Upp till 21 dagar framåt. Välj tid nedan.",

  "court.search_placeholder": "Sök din bana...",
  "court.group_seeded": "Klubbens banor",
  "court.group_custom": "Tillagda av spelare",
  "court.no_matches": "Inga banor matchar.",
  "court.add_as_new": "Lägg till \"{name}\" som ny bana",
  "court.add_dialog_title": "Lägg till banan",
  "court.area_label": "Område / stadsdel (valfritt)",
  "court.area_placeholder": "t.ex. Sunnersta",
  "court.add_help": "När den är tillagd kan alla i staden välja den.",
  "court.cancel": "Avbryt",
  "court.add_cta": "Lägg till bana",
  "court.added": "Bana tillagd 🎾",
  "court.close": "Stäng",

  "admin.courts_title": "Egna banor",
  "admin.courts_empty": "Inga spelartillagda banor än.",
  "admin.court_by": "av {name}",
  "admin.court_usage": "{n} matcher",
  "admin.court_hidden": "dold",
  "admin.edit": "Redigera",
  "admin.save": "Spara",
  "admin.hide": "Dölj",
  "admin.unhide": "Visa",
  "admin.court_saved": "Bana uppdaterad",

  "home.lets_play": "Nu kör vi 🎾",
  "home.save_my_set": "Rädda mitt set 🚨",
  "home.browse_players": "Bläddra bland spelare",
  "home.your_sos": "Dina aktiva rop",
  "home.no_active": "Inga aktiva rop. Lugn dag på banan.",
  "home.pending_check": "Blev det av? 🎾",
  "home.yes_played": "Ja ✅",
  "home.no_show": "Dök ej upp 🪦",
  "home.pending_q": "Blev matchen vid {court} av? 🎾",
  "home.yes_we_played": "Ja, vi spelade 🎾",
  "home.didnt_happen": "Blev inte av (regn, avbokat, livet)",
  "home.player_noshow": "{name} dök inte upp 🪦",
  "home.confirmed": "Räknad. Du är en stammis ✨",
  "home.archived": "Arkiverad. Inga problem.",
  "home.reported_noshow": "Rapporterat — tråkigt att det hände 💔",
  "home.my_upcoming": "Mina kommande matcher",
  "home.cant_make_it": "Kan inte komma 💔",
  "home.cant_make_confirm": "Släpp platsen — säkert? Ingen påföljd hur som helst.",
  "home.withdrawn": "Plats frigjord. Tack för förvarningen 🙏",
  "home.withdrawn_reflared": "Plats frigjord + raket avfyrad igen 🚨",
  "home.host_notified": "{name} kan inte komma — din plats är öppen igen",

  "install.title": "Lägg till Courtship på hemskärmen 🚨",
  "install.sub": "Nödfall väntar inte.",
  "install.install": "Installera",
  "install.show_me": "Visa hur",
  "install.dismiss": "Kanske senare",
  "install.ios_title": "Lägg till på hemskärmen",
  "install.ios_step1": "Tryck på Dela-knappen (fyrkant med pil ↑)",
  "install.ios_step2": "Skrolla ner och tryck \"Lägg till på hemskärmen\"",
  "install.ios_step3": "Tryck \"Lägg till\" — klart.",
  "install.ios_close": "Uppfattat",
  "install.notif_title": "Vill du höra nödraketerna? 🚨",
  "install.notif_sub": "Slå på notiser så att SOS-rop når dig när sekunderna räknas.",
  "install.notif_yes": "Slå på notiser",
  "install.notif_skip": "Inte nu",

  "empty.directory": "Inga spelare matchar. Sänk kraven 😉 — vidga filtren.",
  "empty.directory_cta": "Rensa filter",
  "empty.buddies": "Inga kompisar än. Spela en match och det fyller sig självt 🤝",
  "empty.history": "Din banhistorik börjar med en tryckning på den stora röda knappen.",
  "empty.buddy_inbox": "Inga förfrågningar. Du är antingen mycket populär eller mycket ny 😄",

  "admin.title": "Klubbhuset 🛠️",
  "admin.tag": "Klubbadmin",
  "admin.fill_rate": "SOS-fyllnadsgrad",
  "admin.fill_target": "Mål: 60%",
  "admin.profiles_total": "Spelare totalt",
  "admin.profiles_week": "Nya denna vecka",
  "admin.rescuer_optin": "Räddare aktiverat",
  "admin.buddy_pairs": "Kompispar",
  "admin.ghost_count": "Spökincidenter",
  "admin.by_city": "Per stad",
  "admin.sos_created": "SOS skapade (vecka)",
  "admin.sos_claimed": "SOS tagna (vecka)",
  "admin.open_posted": "Öppna upplagda (vecka)",
  "admin.open_filled": "Öppna fyllnad %",
  "admin.median_ttc": "Median tid-till-claim",
  "admin.all_time_games": "Totalt bekräftade matcher",
  "admin.minutes": "{n} min",
  "admin.invite_codes": "Inbjudningskoder",
  "admin.new_code": "Ny kod",
  "admin.code_placeholder": "KOD",
  "admin.uses_placeholder": "användningar",
  "admin.owner_placeholder": "ägar-mejl (valfritt)",
  "admin.create": "Skapa",
  "admin.deactivate": "Avaktivera",
  "admin.reactivate": "Återaktivera",
  "admin.created_ok": "Inbjudningskod skapad",

  "sos.new_title": "Rädda mitt set 🚨",
  "sos.new_sub": "Tryck snabbt. Räddare väntar.",
  "sos.when": "När",
  "sos.today": "Idag",
  "sos.tomorrow": "Imorgon",
  "sos.court": "Bana",
  "sos.format": "Format",
  "sos.level_range": "Nivåspann",
  "sos.anyone": "Vem som helst — jag vill bara spela",
  "sos.court_status": "Banstatus",
  "sos.note_label": "Notis (valfri)",
  "sos.note_placeholder": "Jag tar med bollar 🎾",
  "sos.send": "Skicka nödrop 🚨",
  "sos.back": "← Tillbaka",

  "sos.broadcasting": "Sänder ut till {n} räddare...",
  "sos.im_in": "Jag är med! 🎾",
  "sos.matched": "Det är en match. Bokstavligen.",
  "sos.cancel": "Avbryt ropet",
  "sos.message_wa": "Skriv på WhatsApp 👋",

  "rescue.title": "Räddningstavlan",
  "rescue.empty_title": "Tyst på banorna.",
  "rescue.empty_sub": "Var först att skicka ett nödrop 🚨",
  "rescue.listening": "Lyssnar...",

  "players.title": "Spelare",
  "players.sub": "Välj din spelpartner.",
  "players.warming": "Värmer upp...",
  "players.empty": "Lätta på filtren — din match finns där ute.",
  "players.message_wa": "Skriv på WhatsApp 👋",

  "me.title": "Din profil",
  "me.sub": "Justera tills det känns rätt.",
  "me.save": "Spara ändringar",
  "me.updated": "Uppdaterad 🎾",
  "me.language": "Språk",
  "wiz.save_see": "Spara & se spelare",
  "wiz.next": "Nästa",
  "wiz.back": "Tillbaka",
  "wiz.name_label": "Förnamn",
  "wiz.phone_label": "Telefonnummer",
  "wiz.phone_help": "Spelare når dig på WhatsApp. Ditt nummer delas bara när någon faktiskt skriver till dig — visas aldrig i appen.",
  "onboarding.title": "Skapa din profil",
  "onboarding.sub": "Berätta hur du gillar att spela. Vi matchar vibben.",
  "onboarding.welcome_in": "Du är med. Nu kör vi.",

  "city.label": "Stad",
  "city.any": "Alla städer",
  "wiz.city_label": "Din hemstad",
  "wiz.buddy_sos_label": "Nödrop från mina kompisar",
  "wiz.buddy_sos_help": "Hör när en kompis behöver dig — även när räddarläget är av.",
  "buddy.add": "Lägg till kompis 🤝",
  "buddy.requested": "Förfrågan skickad ⏳",
  "buddy.is_buddy": "Kompisar ✓",
  "buddy.remove": "Ta bort kompis",
  "buddy.requests_title": "Kompisförfrågningar 🤝",
  "buddy.accept": "Acceptera",
  "buddy.decline": "Avböj",
  "buddy.my_buddies": "Mina kompisar 🤝",
  "buddy.no_buddies": "Inga kompisar än. Spela en match — kompisar händer.",
  "buddy.from_buddies": "Från dina kompisar 🤝",
  "buddy.your_buddy": "Din kompis {name}",
  "buddy.source.played": "Spelade en match",
  "buddy.source.invite": "Bjöd in dig",
  "buddy.source.manual": "Manuellt",
  "buddy.confirm_remove": "Ta bort den här kompisen?",
  "buddy.removed": "Kompis borttagen",
  "buddy.request_sent": "Kompisförfrågan skickad 🤝",
  "buddy.accepted": "Kompisar! 🤝",
  "buddy.declined": "Avböjd",

  "post.new_title_urgent": "Rädda mitt set 🚨",
  "post.new_title_planned": "Lägg upp en match 🎾",
  "post.sub_urgent": "Tryck snabbt. Räddare väntar.",
  "post.sub_planned": "Få upp den på tavlan. Spelare hittar dig.",
  "post.mode_urgent": "🚨 Brådskande",
  "post.mode_planned": "🎾 Planerad",
  "post.cta_urgent": "Skicka nödraketen 🚨",
  "post.cta_planned": "Lägg upp 🎾",
  "post.auto_flare_label": "Automatisk nödraket om ingen nappar 🚨",
  "post.auto_flare_help": "Om ingen tagit den 6h innan start, skickar vi ett nödrop åt dig.",
  "post.posted_toast": "Upplagd! Den är på tavlan.",
  "post.sos_toast": "Nödrop skickat 🚨",
  "post.flare_now": "Skicka nödraketen nu 🚨",
  "post.flare_fired": "Din match blev brådskande — raketen avfyrad 🚨 Sänder till räddare nu.",
  "home.post_a_game": "+ Lägg upp en match",
  "home.open_games": "Öppna matcher 🎾",
  "home.new_match": "Ny match 🎾",
  "post.new_title": "Ny match 🎾",
  "post.pick_a_time": "Välj en tid för att fortsätta.",
  "post.info_urgent": "⚡ Snart — spelare i närheten meddelas direkt.",
  "post.info_planned": "🎾 Hamnar på tavlan så spelare hittar den.",
  "post.confirm_title": "Detta meddelar spelare nära dig direkt. Redo att skicka raketen?",
  "post.confirm_send": "Skicka 🚨",
  "post.confirm_cancel": "Inte än",
  "home.flare_prompt_title": "6h till matchen, fortfarande ensam.",
  "home.flare_prompt_cta": "Avfyra raketen? 🚨",

  "games.title": "Öppna matcher",
  "games.sub": "Planerade matcher som söker spelare.",
  "games.empty_title": "Inga öppna matcher än.",
  "games.empty_sub": "Lägg upp en — spelare hittar den 🎾",
  "games.im_in": "Jag är med! 🎾",

  "stats.this_week_in": "Denna vecka i {city}",
  "stats.sets_saved": "{n} set räddade",
  "stats.games_matched": "{n} matcher matchade",
  "stats.new_buddies": "{n} nya kompispar",
  "stats.all_time": "Totalt: {n} matcher spelade i {city}",

  "ct.label": "Bantyp",
  "ct.indoor": "Inne",
  "ct.outdoor": "Ute",
  "ct.any": "Alla",
  "ct.filter_label": "Inne / Ute",

  "slot.label": "Tid",
  "slot.help_uppsala": "Banor här bokas på hela timmen.",
  "slot.help_stockholm": "Banor här bokas på hel eller halvtimme.",
};

const DICTS: Record<Lang, Dict> = { en, sv };

function detectInitial(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored === "en" || stored === "sv") return stored;
  const nav = window.navigator?.language?.toLowerCase() ?? "";
  return nav.startsWith("sv") ? "sv" : "en";
}

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    setLangState(detectInitial());
  }, []);

  // Pull profile lang once signed in (overrides local default).
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !active) return;
      const { data: p } = await supabase
        .from("profiles" as any)
        .select("lang")
        .eq("id", data.user.id)
        .maybeSingle();
      const pl = (p as any)?.lang as Lang | undefined;
      if (pl && active && (pl === "en" || pl === "sv")) {
        setLangState(pl);
        try { localStorage.setItem(STORAGE_KEY, pl); } catch {}
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((e) => {
      if (e === "SIGNED_IN") load();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
    // Best-effort persist to profile + auth metadata
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.from("profiles" as any).update({ lang: l }).eq("id", data.user.id);
      await supabase.auth.updateUser({ data: { lang: l } });
    })();
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
    },
    [lang],
  );

  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nCtx);
  if (!ctx) return { lang: "en", setLang: () => {}, t: (k) => DICTS.en[k] ?? k };
  return ctx;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-full border-2 border-[var(--ink)] bg-[var(--cream2)] p-1 ${className}`}
    >
      {(["sv", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`min-h-11 min-w-12 px-4 rounded-full font-extrabold uppercase ${
            lang === l ? "bg-[var(--green-pop)] text-[var(--ink)]" : "text-[var(--ink)]"
          }`}
        >
          {l === "sv" ? "SV" : "EN"}
        </button>
      ))}
    </div>
  );
}