# Connecting the Supabase backend

Wildbound runs fully offline, with demo clans simulated in your browser. Connect Supabase to get **real accounts, real clans and bands, live chat, shared gatherings with RSVPs, and synced activities**, so friends on their own phones see each other.

## 1. Create the project (about 5 minutes)
1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste [`supabase/schema.sql`](../supabase/schema.sql), and run it. This creates the tables, the security rules (Row Level Security) and realtime.
3. Under **Authentication → Sign In / Providers**:
   - **Email** is on by default (magic-link sign-in).
   - Optional: turn on **Anonymous sign-ins** to allow the "Continue as guest" button.
4. Under **Authentication → URL Configuration**, set **Site URL** to `https://rakeshpallagani.github.io/wildbound/` and add it to the redirect URLs.

## 2. Point the app at it
Pick one:
- **In the app:** go to Me (tap your name) → Settings → Backend, paste the **Project URL** and **anon public key**, then tap **Save & connect**. This is stored on that device only.
- **For everyone:** put the same two values in [`config.js`](../config.js) and push. The anon key is designed to be public; the database rules control access.

Then sign in with your email link (open it on the same phone) or as a guest.

## What syncs today
| Feature | Offline (demo) | With Supabase |
|---|---|---|
| Profile and Aspects | local | `profiles` |
| Clans, Hearth location, clan XP | simulated | `clans`, `clan_members` (XP is added by a database trigger from members' activities) |
| Bands and membership | simulated | `bands`, `band_members` |
| Activities (manual, GPS treks, imports) | local | `activities`, which also rebuilds the weekly Awakening gauge from real members |
| Gatherings and RSVPs / check-ins | simulated | `gatherings`, `gathering_rsvps`, live |
| Clan and band chat | simulated replies | `messages`, live via Realtime |
| Vigils (phase 2) | local simulation | `vigils` table exists, read-only. Writes will move to server functions (anti-cheat). |

Demo clans still appear (tagged **demo**) so the map isn't empty while you invite friends. Real clans have no simulated members.

## Security notes
- Each person can only write their own rows: profile, activities, RSVPs, messages, and band or clan membership.
- Clan chat is readable only by members of that clan.
- Clan XP is updated on the server by a trigger, never directly by the client.
- Next hardening step: move vigil actions and check-ins into Postgres functions that verify GPS distance and speed on the server.
