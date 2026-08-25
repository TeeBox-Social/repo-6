# TeeBox — Product Requirements Document

## Vision
A dedicated social community for golfers: log rounds, share course reviews, and follow fellow players through a live activity feed. TeeBox positions itself as the frictionless bridge from your on-course tracker (Garmin Golf, The Grint) to the group chat: tap Share in those apps and TeeBox opens pre-filled — no CSV export needed.

## Personas
- **Weekend Warrior** — plays 1–2 rounds a week, wants to share highlights and razz friends.
- **Grinder** — cares about stats (fairways, GIR, putts) and course conditions.
- **New Golfer** — welcoming aesthetic; low-friction sign-up.

## Core Features (v1 — this build)
1. **Auth** — email/password JWT auth; secure token storage via expo-secure-store.
2. **Feed** — glass sticky header, tactile round cards with score pill, photos, likes, comments, pull-to-refresh.
3. **Log a Round** — course, score, par, holes, fairways, GIR, putts, notes, up to 3 photos (base64). Accepts pre-fill via share deep link `teebox://share?course=...&score=...&par=...&notes=...`.
4. **Discover** — search Golfers and Courses (pill-style segmented control).
5. **User Profile** — cover image, avatar, stats (handicap/rounds/avg/best), your rounds.
6. **Other Profile** — follow/unfollow, follower counts.
7. **Post Detail** — hero photo, big scorecard, mini-stats, comment thread, sticky comment bar.
8. **Course Detail** — rating stars, write review, list reviews.

## Share Extension (Native — post-EAS build)
- Expo Go cannot host native share extensions. The app registers `teebox://` deep link + `NSExtensionActivationRule` config that will forward tapped Share data from Garmin Golf / The Grint into `teebox://share?course=...&score=...` on a custom dev/production build.
- The Log Round screen already handles the pre-fill and shows a "Pre-filled from …" banner.

## Growth Enhancement (Business Angle)
- **Course Ambassador program** — the golfer with the highest avg star-rating on a course is auto-featured on the course detail. Encourages high-quality reviews and creates a shareable badge (drives referrals to the app). Ready to layer on top of `/api/courses/{name}/reviews`.

## Iteration 3 additions
- **Fractional star ratings (0.25 step)** via `StarPicker` (drag or tap) — numeric value shown in a dark pill (e.g. `4.25 / 5.00`). `StarDisplay` renders fractional stars using a clipped overlay.
- **Handicap filter chips on reviews**: `All · Low (<10) · Mid (10–20) · High (20+)`. No-HC reviewers lumped into All.
- Each review card shows the reviewer's numeric rating (brand-green pill) and the current course average (`avg X.XX`), tinted green if their rating is above the average, warm-orange if below.
- **Master course catalog** — 30 famous real courses (Pebble Beach, TPC Sawgrass, Bandon Dunes, St Andrews Old, Bethpage Black, Augusta National, etc.) auto-seeded on empty DB with `city / region / country / lat / lng`.
- **OpenStreetMap Overpass bulk import** — `POST /api/courses/import-osm?bbox=...` pulls golf courses from the free OSM Overpass API (no key). Dedupes by name.
- **Open in Maps** pill on Course Detail hero — fires `Linking.openURL` to `google.com/maps/search/?api=1&query=<course>+<city>+<region>` (opens the Google Maps app on iOS/Android, browser on web).
- Discover Courses list shows `city, region` under each course.

## Iteration 3 API additions
- `GET /api/courses/{name}` — course metadata (city/region/country/lat/lng) + play_count + review_count + avg_rating.
- `POST /api/courses/import-osm?bbox=south,west,north,east` — OSM Overpass bulk import.
- `POST /api/courses/reviews` — `rating` is now `float` in [1.0, 5.0]; server rounds to nearest 0.25.
- `GET /api/courses/{name}/reviews` — each review's `author` now includes `handicap`.

## Iteration 4 — Security audit remediation
- **SEC-001 (Critical)** JWT secret rotated to 96-char random hex; server refuses to boot when `JWT_SECRET_KEY` is <32 chars or contains any of `change_me / changeme / placeholder / changethis / your-secret`.
- **SEC-002 (Medium)** Email field stripped from EVERY public user response (`/discover/users`, `/users/{id}`, feed / rounds / comments / reviews author payloads). `/auth/me` still returns the caller's own email since they own it.
- **SEC-003 (Medium)** Photo payloads capped at ~1 MB base64 each, avatars at ~600 KB, and rounds are hard-capped at 3 photos. Non-image data URIs rejected with 415.
- **SEC-004 (Medium)** All user-supplied search queries fed to Mongo `$regex` are now (a) length-capped at 60 chars and (b) meta-char-escaped, blocking ReDoS and pattern surprises like `.*`.
- **SEC-005 (Low)** Demo seed (both the manual `POST /api/seed` endpoint and the on-empty-DB startup autopull) is gated behind `ENABLE_DEMO_SEED` (`true` in dev, `false` for production deploys). When off, `POST /api/seed` returns 404 and no demo users are created.

## Iteration 5 — Hardening + Wishlist
- **Rate limiting** via `slowapi`: `/auth/login` = 10/min · 60/hour, `/auth/register` = 5/min · 20/hour, `/auth/refresh` = 60/min. Key function is proxy-aware — prefers `cf-connecting-ip` → `x-forwarded-for` → socket peer, so limits actually bind per real client behind Cloudflare / ingress.
- **CORS from env**: `CORS_ALLOWED_ORIGINS` (comma-separated). `*` in dev; set to your web origin in prod.
- **Short-lived access + rotating refresh tokens** — access = 15 min, refresh = 30 days. Refresh tokens tracked in `refresh_tokens` collection with `jti / family_id / is_rotated / is_revoked`. Every refresh mints a new pair and marks the old one rotated. **Reuse of a rotated refresh nukes the whole family** (compromised-device signal). TTL index expires records past `exp`. `/auth/logout` server-revokes the refresh. Access-token type-claim guards prevent using a refresh token as a bearer.
- **Frontend refresh flow** — `src/api.ts` transparently handles 401s: single-flight refresh queue (concurrent 401s only issue ONE refresh), swap in new access, replay the original request. On refresh failure the auth-context is notified via `setOnAuthLost` and the user returns to sign-in.
- **Wishlist** — per-user list of courses to play.
  - `POST /api/wishlist { course_name }`, `DELETE /api/wishlist/{course_name}`, `GET /api/wishlist/check/{course_name}`, `GET /api/users/{id}/wishlist`.
  - `GET /api/users/{id}` now returns `wishlist_count`.
  - Frontend: `WishlistButton` toggle pill next to "Open in Maps" on Course Detail; horizontal-scroll wishlist section on own Profile (with × remove) and read-only version on another user's profile.

## Iteration 6 — Profile editor, pinned rounds, friends
- **Profile editor** (`/profile/edit`) — modal form for display name, handicap, home course, bio, avatar (photo picker → base64). Handicap and other clearable fields can now be blanked out (`PATCH /api/auth/me` uses `exclude_unset=True` so an explicit `null` reaches Mongo `$set` while omitted fields stay untouched).
- **Handicap next to name** — Profile header shows `Reese Callahan · 8.4 HCP` (handicap inline, hidden when null).
- **New 4-stat row on both own Profile and other users' User Detail** — Rounds / Avg / Courses / Friends. Best score removed from UI (still stored per round). Courses = distinct `course_name` count. Friends = mutual-follow count.
- **Pin a round to your profile** — `POST /api/rounds/{id}/pin` (owner-only), `DELETE /api/users/me/pin`, both mediated by a "Pin to profile" ↔ "Pinned" pill in the Post Detail header for the round's owner. Pinned round appears with a **"Pinned round"** badge at the top of "Your rounds" on Profile / User Detail. Stale pins auto-clear server-side when the underlying round is deleted.
- **Friends screen** (`/user/[id]/friends`) — reachable by tapping the Friends stat on any profile. Lists mutual-follow friends of the profile owner with:
  - "Mutual friend" badge (viewer↔them mutual), "You follow" badge (viewer→them one-way), or "You" pill.
  - "X mutual with you" summary in the header when viewing someone else.
  - Per-item Follow/Following toggle button.
  - Tap the row to jump to that user's profile.
- Endpoint additions: `GET /api/users/{id}/friends`, `POST /api/rounds/{id}/pin`, `DELETE /api/users/me/pin`.

## Tech
- **Backend**: FastAPI + MongoDB (motor). JWT via python-jose. Bcrypt password hashing via passlib.
- **Frontend**: Expo SDK 54 + expo-router file-based routing. React Native only. `expo-image`, `expo-linear-gradient`, `expo-blur`, `@expo/vector-icons` (Ionicons), `expo-image-picker` (base64 photos), `expo-secure-store`.
- **Design**: `4 Tactile / Playful LIGHT` per design_guidelines.json — fairway green + warm off-white, chunky pill-radius CTAs, tactile shadows.

## Endpoints (all under `/api`)
Auth: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`
Rounds: `GET /feed`, `POST /rounds`, `GET /rounds/{id}`, `DELETE /rounds/{id}`, `POST /rounds/{id}/like`, `GET /rounds/{id}/comments`, `POST /rounds/{id}/comments`
Users: `GET /users/{id}`, `GET /users/{id}/rounds`, `POST /users/{id}/follow`
Discover: `GET /discover/users?q=`, `GET /discover/courses?q=`
Reviews: `GET /courses/{course_name}/reviews`, `POST /courses/reviews`
Utility: `POST /seed` (idempotent), `GET /` (health)


## Navigation — bottom tabs
Feed · Discover · Log · **More**. The "More" tab (`app/(tabs)/more.tsx`) is a menu of app features: View profile (Profile is a hidden `href:null` route, also reached via feed avatar), Buy Premium (`app/premium.tsx` — upsell placeholder, Subscribe disabled/coming soon), App Settings (`app/settings.tsx` — account info, Light/Dark/System appearance selector persisted to storage key `appearance`, app version, Edit profile, Log out), Notification settings, Course Library (admin only), Log out. Full dark-mode theming is a planned follow-up (selector persists the preference today).


## Iteration 7 additions (social engagement)
- **Who liked this** — tapping the like COUNT (not the heart) on a feed round card, on the post-detail post, or on any comment opens `LikersSheet` (`src/components/LikersSheet.tsx`), a bottom sheet listing the users who liked it; tapping a user opens their profile. Heart taps still toggle the like. Backend: `GET /rounds/{id}/likes`, `GET /rounds/{roundId}/comments/{commentId}/likes` (api.getRoundLikers / api.getCommentLikers).
- **Notification bell everywhere** — `NotificationBell` (unread-badge, refreshes on focus) is now in the headers of Discover, Log, and Profile (in addition to the Feed). Taps route to `/notifications`.
- **Tappable played courses on other profiles** — the "Courses" stat on another user's profile (`app/user/[id].tsx`) navigates to their courses-played list (previously only worked on own profile).

## Iteration 8 additions (engagement + theming)
- **Likers preview line** — feed cards (`round-card-like-preview-<id>`) and post detail (`post-like-preview`) show "Liked by <name>" / "Liked by <name> and N others" when like_count>0; tapping opens the LikersSheet. Backend `enrich_round` now returns `like_names` (up to 2 most-recent liker display names).
- **App-wide Dark Mode** — `src/theme-context.tsx` `ThemeProvider` + Proxy-based palette in `src/theme.ts` (`colors` Proxy, `darkColors`, `makeThemedSheet`). Settings > Appearance (Light/Dark/System) switches the whole app live and persists to AsyncStorage key `appearance`; System follows the OS. Implementation: each screen/component subscribes via `useTheme()` and its StyleSheet is wrapped in `makeThemedSheet((colors)=>...)`, so both inline `colors.*` and stylesheet values resolve to the active scheme on re-render (37 files). StatusBar bar style is themed in `_layout.tsx`.

## Iteration 33–34 additions (community-curated course library)
- **Feed tap-to-refresh** — tapping the Feed tab icon while already on Feed scrolls the list to top AND triggers a fresh fetch. Implemented via `src/utils/feedBus.ts` pub/sub bridged in `app/(tabs)/_layout.tsx` and consumed in `app/(tabs)/index.tsx`.
- **Course Edit Requests** — from the More tab, users can either request a brand new course (Name, Address, Par for 18 holes) or suggest edits (name / address / par) to an existing course. Admins review pending requests from Profile → Course Library and Approve/Reject them. Submitters receive `course_edit_approved` / `course_edit_rejected` notifications.
- **Admin-approved edits survive OpenGolfAPI re-syncs** — approved edits write their field names into a per-course `manually_edited_fields` array; both `_ensure_course_details()` and `_cache_opengolf_compact()` filter their write-back dicts against this set so upstream OpenGolfAPI values never revert admin-curated data.
- New endpoints: `POST /api/courses` (new-course request), `POST /api/courses/edit-requests` (edit suggestion), `GET /api/courses/submissions/mine`, `GET /api/admin/course-edits/pending`, `POST /api/admin/course-edits/{id}/approve`, `POST /api/admin/course-edits/{id}/reject`.


## Iteration 36 additions (Groups & Leagues)
- **Groups & Leagues** — from the More tab (`more-groups` row), users can create private groups (`app/groups/create.tsx`) or join by invite code (`app/groups/join.tsx`). Each group has an 8-char uppercase invite code (alphabet excludes 0/1/O/I), a 50-member cap, and a creator-chosen `member_add_policy` (`admin` = only admin can add, `any` = any member can invite). Group detail (`app/groups/[id]/index.tsx`) has three sticky tabs:
  - **Feed** — reuses `RoundCard` to show every post (round/text/lfg) authored by any group member, newest first.
  - **Leaderboard** — calendar-year season (Jan–Dec). Members ranked ascending by average score with 9-hole scores extrapolated to their 18-hole equivalent via the existing `extrapolate_18_score` helper. Non-posting members appear at the bottom with rank/score dashes.
  - **Members** — everyone in the group with an admin star; admin can remove any non-admin. Add-members flow (`app/groups/[id]/add-members.tsx`) searches the viewer's follow-graph (following ∪ followers) minus current members.
  - Invite code copy (`expo-clipboard`) and native Share are exposed in the hero.
- **New collection**: `groups_col`. **New models**: `GroupIn`, `GroupUpdate`, `GroupJoinIn`, `GroupAddMemberIn`. **Indexes**: unique `invite_code`, plus `member_ids` and `admin_id` for fast per-user and per-admin lookups.
- **New endpoints** (all `/api/groups/*`): `POST /`, `GET /mine`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`, `POST /join`, `POST /{id}/leave`, `POST /{id}/members`, `DELETE /{id}/members/{user_id}`, `GET /{id}/candidates?q=`, `GET /{id}/feed`, `GET /{id}/leaderboard?season=YYYY`.
- **Notifications**: `group_join` (sent to admin when someone joins via code) and `group_added` (sent to a user when they're added directly). Both currently gated under the existing `follow` pref-key.

## Iteration 38–39 additions (Groups extras + Global DM)
- **Share-to-Group posts** — Log Round screen accepts `?groupId=<id>` and pre-selects the matching share pill; posted rounds land in the group's feed (`/api/groups/{id}/feed`).
- **Group Invites (Accept / Decline)** — `POST /api/groups/{id}/invite`, delivered as in-app notifications with inline Accept / Decline buttons on `/notifications`; responded via `POST /api/groups/invites/{invite_id}/respond`.
- **Public / Private Profile Groups + Request-to-Join** — users mark individual groups public on Profile → Edit; public groups appear on public profiles and expose a preview screen (`/groups/{id}/preview`) with a "Request to Join" CTA (`POST /api/groups/{id}/request_join`).
- **Create Post from Group page** — group detail (`/groups/{id}`) now has a "New post to this group" CTA that routes to `/log?groupId=<id>` with the share pill pre-selected (data-testid `group-new-post`).
- **Global DM button** — `src/components/DMButton.tsx` icon added to the top header of Feed, Discover, Log, and Profile tabs (mirrors the NotificationBell); taps navigate to `/messages`.

## Iteration 40 (Accessibility font-scale hardening)
- **Global font-scale ceiling** — `Text.defaultProps.maxFontSizeMultiplier` and `TextInput.defaultProps.maxFontSizeMultiplier` set to `1.3` in `/app/frontend/app/_layout.tsx`. Users can still bump iOS Dynamic Type / Android font size for accessibility, but app chrome (headers, tab labels, chips, buttons) no longer explodes into one-letter-per-line columns at max accessibility scale.
- **Header hardening across all tabs** — Feed / Discover / Log / Profile headers now use `numberOfLines={2}` + `adjustsFontSizeToFit` + `minimumFontScale={0.7}` on their big titles, `numberOfLines={1}` on secondary labels (greeting, edit button), `flexShrink: 0` on right-side icon/CTA clusters, and `flex: 1, minWidth: 0` on the title column so the title never gets crushed to zero width by sibling buttons even at 1.3x scale.
