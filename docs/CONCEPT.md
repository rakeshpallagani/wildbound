# Wildbound: Game Design Document (draft)

## 1. Vision
Humans are built to move in groups across landscapes. Modern fitness apps reward individual numbers. Wildbound rewards **shared journeys**: you move so your *clan* moves, and as the clan moves, the world reveals its stories.

**Pillars**
1. **Every movement counts.** Walking, strength, sport, yoga and swimming all count. No activity type is second-class.
2. **Belonging over competition.** Clans share goals. Rivalry between elements is friendly and stays in balance.
3. **Curiosity as a reward.** The main collectible is *knowledge of real places*: their geography, history and natural science.
4. **Nature as identity.** Element spirits give players an identity and a companion, without punishing them for training outside their element.

## 2. Player fantasy
"I'm a Stoneheart of The Granite Paw. My 40-minute lift tonight pushed us past Dead Woman's Pass, and now I know why it has that name."

## 3. Systems

### 3.1 Elements & spirits
| Element | Clan title | Spirit | Affinity movements | Virtue |
|---|---|---|---|---|
| Earth | Stoneheart | Brumm, stone bear | Strength, hike, climb | Strength & steadfastness |
| Fire | Emberkin | Ashka, ember fox | Run, HIIT, sport | Intensity & courage |
| Water | Tidebound | Nerra, river otter | Swim, paddle, yoga | Flow & resilience |
| Air | Windwalker | Kestra, sky kestrel | Walk, cycle, dance | Curiosity & endurance |

- Affinity gives ×1.5 essence. Non-affinity movement still gives full trail km.
- Spirits have four forms, with essence thresholds of 0, 400, 1,500 and 4,000.
- *Future:* hybrid spirits (Earth + Water = Mud/Forest) for players who balance two elements. Seasonal "element tides" could boost one element each week.

### 3.2 Currencies
- **Essence:** personal progress, from minutes × intensity × affinity plus trial, expedition and badge bonuses.
- **Trail km:** clan progress. Distance activities use real km × an activity factor (walk 1, hike 1.25, cycle 0.35, swim 4, paddle 0.6). Effort activities use minutes / 12 × intensity.

### 3.3 Clans
- From 3 to about 30 members. Each clan has one element, but members can be of any element.
- **Objective:** one expedition at a time, with progress pooled from all members.
- **Completion:** +200 essence for every member, the Summit Seeker badge, and the next expedition.
- *Future:* clan pacts (weekly targets voted on by members), clan roles (Pathfinder, Keeper, Hearth-tender), clan totems that evolve, and cross-clan *gatherings* where several clans join one long route such as the Silk Road.

### 3.4 Expeditions & lore
Real routes with waypoints at cumulative km. Each waypoint holds one short lore card on its geography or history. The current list:
Inca Trail (42 km) → Everest Base Camp (62) → Hadrian's Wall (135) → Camino Francés (780) → Appalachian Trail (3,537).

*Future routes:* Kumano Kodō, Te Araroa, the Silk Road, Great Wall sections, the Kungsleden, the Overland Track, Kilimanjaro, Mount Kailash kora.
*Future lore formats:* quizzes that pay out essence, photo cards, "then and now" maps, and audio narration from your spirit.

### 3.5 Daily trials
Three per day, chosen deterministically from the date and element. One always matches your element. Rewards are claimed automatically.

### 3.6 Spirit guide (AI)
The prototype uses rule-based whispers. The plan is an LLM-powered companion that:
- speaks in the voice of the player's element,
- brings up lore about the *next* waypoint as a hook ("there's a story waiting at Sayacmarca"),
- suggests movement that fits the player's history and recovery (for example, a mobility day after three strength days),
- answers questions about the places on the route, grounded in the curated lore to prevent made-up facts.

Guardrails: no medical advice, encourage rest, and never shame the player for inactivity.

## 4. Real-world integration (roadmap)
| Phase | Scope |
|---|---|
| **v0.1 (this prototype)** | Web, self-reported, localStorage, simulated clanmates |
| v0.2 | Backend (Supabase or Firebase): accounts, real clans, invites, server-side engine |
| v0.3 | Health data sync: Apple HealthKit, Android Health Connect, Strava API; verified activities |
| v0.4 | AI spirit guide; lore quizzes |
| v0.5 | **Real-place quests:** check in at local trails, peaks and historic sites with GPS for bonus lore |
| v1.0 | Mobile app (React Native or Expo), seasons, clan gatherings, partnerships with parks and trail organisations |

## 5. Anti-cheat & fairness
- Server-side scoring, with daily caps on self-reported minutes.
- Higher weighting for verified (synced) activities.
- Plausibility checks on speed and distance for each activity type.
- Clan goals scale with member count, so small clans can still finish expeditions.

## 6. Health & ethics
- Reward consistency over extremes. Essence per session has diminishing returns at high minute counts (future work).
- Rest days protect a streak ("Campfire days": 1 per week).
- Inclusive by design: wheelchair pushes, adaptive sports, and chair yoga count fully.
- Privacy: no precise location is shared with the clan by default.

## 7. Success metrics
- Weekly active movers, and the share of players moving 3 or more days a week.
- Clan retention (week 4 and week 12).
- Lore cards read per player (a proxy for curiosity).
- Expedition completion rate.
