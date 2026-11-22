// @ts-check
// Where the game keeps accounts and saved games.
//
// With a Supabase project named here, sign-in, saves and the leaderboard go to it (js/cloud.js).
// With `url` left empty, the game uses the small Python server it is served from (serve.py), as it
// did before; that is also what the tests use.
//
// The key is the project's public ("publishable") key. It is meant to be seen: it only says which
// project this is, and the rules in the database decide what a player may read and write. The secret
// key never belongs in this file, or anywhere in the game.
export const CLOUD = {
  url: 'https://mrxszsbwtsnhmfufyjmt.supabase.co',
  key: 'sb_publishable_6MG36XrVJ43Bmp4RgkZU_g_BKh7w1Vx',
  // Google's client ID of this game (the one of type "Web application"), for "Continue with Google" (js/google.js).
  // Public, like the key above. Left empty, the game offers no Google sign-in at all.
  google: '977259213570-gooerk5c0qdm38hure2dt5g1tlsr2jej.apps.googleusercontent.com',
};
