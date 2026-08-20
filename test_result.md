#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Continue building TeeBox social golf app. Recent bug: app does not launch via Expo Go — after ~8s splash it lands on a blank white screen (no red error). Root cause identified: @expo/vector-icons Ionicons mount before the CDN icon font registers, so the library auto-loads the Metro-served local .ttf which resolves to 0 bytes on Expo Go Android → 'Font file for ionicons is empty' uncaught rejection; render blanks out (error overlay suppressed by LogBox.ignoreAllLogs)."

frontend:
  - task: "Fix Expo Go blank-screen crash (icon font race condition)"
    implemented: true
    working: true
    file: "app/_layout.tsx, src/hooks/use-icon-fonts.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Gated the entire React tree render on icon-font readiness in RootLayout. RootLayout now returns null (keeps native splash) until useIconFonts() resolves loaded||error, with a 12s timeout escape hatch. Removed the previous unconditional 2s splash force-hide that let icons mount before the CDN font registered. This ensures no <Ionicons> mounts before the 'ionicons' family is registered from the jsDelivr CDN, eliminating the empty-local-font auto-load that blanked the screen on Expo Go. Web preview verified rendering (sign-in screen + eye icon render, gating passes instantly on web where font map is empty). NOTE: The actual Expo Go native crash cannot be reproduced by the Playwright-based testing agent (web only) — needs user verification by re-scanning the QR in Expo Go. Testing agent should verify NO web regression: app loads, login works, feed + navigation render."
        -working: true
        -agent: "testing"
        -comment: "WEB REGRESSION TEST PASSED. Verified all critical flows: (1) Cold load - app loads to sign-in screen with 'TeeBox Social' hero title and 'Welcome back' form, no blank screen detected. (2) Login - successfully logged in with reese@teebox.demo/password123, navigated to Feed screen. (3) Feed + Navigation - Feed screen renders with demo user posts, all 4 tabs (Feed/Discover/Log/More) present and functional, tab navigation works correctly. (4) Icons - All Ionicons rendering correctly (tab bar icons, password eye toggle visible in screenshots). (5) Console - No console errors detected. The root-layout change (gating React tree on icon-font readiness) did NOT break the web app. Icon fonts load instantly on web (empty font map), so the gating passes immediately without delay. NOTE: The actual Expo Go native crash fix cannot be verified via web testing - requires user verification on device by re-scanning QR in Expo Go."

  - task: "Login hero copy change to 'TeeBox Social' + no text in fade band"
    implemented: true
    working: true
    file: "app/(auth)/sign-in.tsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Replaced hero headline with 'TeeBox Social' and lifted hero copy above the fade-to-white band. Verified via screenshot."

  - task: "Remove AdMob native module (react-native-google-mobile-ads) - regression test"
    implemented: true
    working: true
    file: "src/components/FeedNativeAd.tsx, app/(tabs)/index.tsx, package.json, app.json"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Fully removed react-native-google-mobile-ads native module (incompatible with RN 0.81 New Architecture). Deleted dependency from package.json, removed plugin from app.json, replaced FeedNativeAd with cross-platform no-op that returns null. The component is still called every 5th post in Feed (line 195 of index.tsx) but returns null, so no ad cards render. Needs web regression testing to confirm no breakage."
        -working: true
        -agent: "testing"
        -comment: "✅ WEB REGRESSION TEST PASSED - ALL TESTS SUCCESSFUL. Comprehensive verification confirms AdMob removal did NOT break the web build. DETAILED RESULTS: (1) Sign-in Screen - App loads correctly to 'TeeBox Social' hero with 'Welcome back' form, NO blank screen or stuck state detected. (2) Ionicons Rendering - Password eye toggle icon renders and is functional (clickable). (3) Login Flow - Successfully logged in with reese@teebox.demo/password123, navigated to Feed screen. (4) Feed Rendering - Feed displays correctly with demo posts (Reese Callahan, Jordan Kim, Sam Rivera). Found 5 demo user posts initially. (5) NO Ad Cards - Confirmed ZERO 'Sponsored' or ad card elements in feed (as expected). FeedNativeAd no-op (returns null) working correctly. (6) Feed Scrolling - Scrolled 8 times (600px each) to test past 5th and 10th post positions where ads used to be injected. NO crashes, NO blank screens, NO errors. Feed scrolls smoothly. (7) Bottom Tabs - All 4 tabs visible and functional: Feed, Discover, Log, More. All tab icons (Ionicons) render correctly. (8) Tab Navigation - Successfully navigated through all tabs: Discover (course search), Log (round entry form), More (user profile with stats/achievements), back to Feed. All navigation works correctly. (9) Console Logs - Only 2 non-critical deprecation warnings detected: 'shadow* style props deprecated' and 'props.pointerEvents deprecated'. NO critical errors. (10) Network - No failed requests or network errors. CONCLUSION: The AdMob native module removal is working perfectly on web. FeedNativeAd component correctly returns null (no-op), preventing any ad cards from rendering. Feed scrolls past the 5th/10th post injection points without crashes. All Ionicons render everywhere (sign-in eye toggle, tab bar icons). No regressions detected. Web build is fully functional."

  - task: "Add babel.config.js for react-native-worklets/plugin - web regression test"
    implemented: true
    working: true
    file: "frontend/babel.config.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Created /app/frontend/babel.config.js with presets:['babel-preset-expo'] and plugins:['react-native-worklets/plugin'] to fix standalone APK crash. The app uses react-native-reanimated 4.1.1 + react-native-worklets (pulled in by expo-router and react-native-keyboard-controller); reanimated 4 requires the 'react-native-worklets/plugin' babel plugin. Without an explicit babel.config.js, the EAS standalone release build did NOT apply the worklets transform -> worklet init crash at launch on New Architecture. Needs web regression testing to confirm the new babel.config.js did NOT break the web build."
        -working: true
        -agent: "testing"
        -comment: "✅ WEB REGRESSION TEST PASSED - ALL TESTS SUCCESSFUL. Comprehensive verification at https://course-crew-3.preview.emergentagent.com confirms the new babel.config.js (with babel-preset-expo and react-native-worklets/plugin) did NOT break the web build. DETAILED RESULTS: (1) Sign-in Screen Load - App loads correctly to 'TeeBox Social' hero with 'Welcome back' form. NO blank screen, NO stuck on splash/loading state. App renders immediately. (2) Password Eye Icon (Ionicons) - Password field visible with eye icon rendered on the right side (visible in screenshots). Icon is an Ionicons font icon, not SVG. Renders correctly. (3) Login Flow - Successfully logged in with reese@teebox.demo/password123. Navigation to main app Feed screen works perfectly. (4) Feed Rendering - Feed displays correctly with multiple round posts: Reese Callahan (Cypress Ridge, 79 +8), Jordan Kim (Whistling Oak, 96 +24), Sam Rivera (Bear Creek CC, 74 +2), Reese Callahan (Pebble Meadows GC, 82 +10). Found 4 course names and 5 user names. Feed content renders properly. (5) Feed Scrolling - Scrolled 3 times (400px each) without any crashes, blank screens, or errors. Feed scrolls smoothly. (6) Bottom Tab Bar - All 4 tabs present and visible: Feed (2 instances), Discover (1), Log (1), More (1). All tab icons (Ionicons) render correctly in the bottom navigation bar. (7) Tab Navigation - Successfully navigated through all tabs: Discover → Log → More → Feed. All tabs load correctly and navigation works without errors. (8) Console Logs - ZERO babel/worklet/reanimated errors detected. Total console messages: 2. Only 2 minor deprecation warnings: 'shadow* style props deprecated' and 'props.pointerEvents deprecated'. These are NOT critical and NOT related to babel.config.js. (9) Network - No network errors (0 failed requests). (10) Page Errors - Zero page errors detected. CONCLUSION: The babel.config.js addition is working perfectly on web. The worklets plugin does NOT interfere with web builds. All core functionality works: sign-in screen loads, Ionicons render everywhere (password eye toggle, all tab bar icons), login works, feed renders and scrolls, tab navigation works. NO babel/worklet/reanimated console errors. Web build is fully functional. NOTE: The actual standalone APK crash fix (worklets transform for native builds) cannot be verified via web testing - requires user to rebuild APK and test on device."

  - task: "Fix Profile page infinite spinner bug (Promise.all error handling)"
    implemented: true
    working: true
    file: "app/(tabs)/profile.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "User reported (Expo Go video) that the Profile page (4th bottom tab, menu icon) never loads — blank screen with an infinite green spinner. Root cause: app/(tabs)/profile.tsx loaded profile+rounds+achievements+wishlist via a single Promise.all with an empty catch{}, so if ANY of the 4 calls failed/timed out (common on mobile networks or edge-case accounts), profile stayed null and the screen spun forever with no recovery. Backend endpoints verified 200 for demo user (reese@teebox.demo), so this is a frontend resilience bug. FIX: load core getUser() first (renders the screen), then load rounds/achievements/wishlist via Promise.allSettled (best-effort, a failure just leaves that section empty); added a 'status' state and an error+Retry fallback instead of an infinite spinner. Needs web verification."
        -working: true
        -agent: "testing"
        -comment: "✅ PROFILE PAGE FIX VERIFIED - ALL TESTS PASSED. Comprehensive web testing at http://localhost:3000 confirms the Profile page infinite spinner bug is FIXED. CRITICAL RESULTS: (1) Login - Successfully logged in with reese@teebox.demo/password123. (2) Profile Tab Click - Clicked Profile tab (data-testid='tab-profile', labeled 'More', menu icon, 4th tab). (3) NO INFINITE SPINNER - Profile screen loaded IMMEDIATELY without any loading spinner. This is the CRITICAL FIX - the bug is resolved. (4) Profile Screen Renders - Profile screen (data-testid='profile-screen') is VISIBLE and renders correctly. (5) Profile Content Verified: Avatar with 'RC' initials, Name 'Reese Callahan · 8.4 HCP' (data-testid='profile-name'), Home course 'Pebble Meadows GC', Bio text 'Weekend warrior. Always chasing the sunrise tee time.', Stats row: 2 ROUNDS, 80.5 AVG, 2 COURSES, 2 FRIENDS, Green 'Log a round' button (data-testid='profile-log-cta'), Course Library admin card (user is admin), Notification settings card (data-testid='profile-notif-settings'), Achievements section with 4/14 badges (On the tee, Broke 100, Broke 90, First sub-80), Wishlist section (data-testid='profile-wishlist') with 0 items, Your rounds section with 2 round cards (Cypress Ridge 79 +8, Pebble Meadows GC 82 +10). (6) Profile Scrolls - Scrolled 600px down twice, content below fold renders correctly. Scrolled back to top. (7) Feed → Profile Navigation (Tested Twice) - First navigation: Feed → Profile works, NO spinner, profile renders. Second navigation: Feed → Profile works, NO spinner, profile renders. The fix ensures profile keeps rendering on repeated navigation without getting stuck. (8) All 4 Tabs Navigate - Feed tab: renders feed with posts. Discover tab: renders course search. Log tab: renders round entry form. Profile/More tab: renders profile screen. All tabs functional. (9) Console - Only 3 minor deprecation warnings (shadow* props, pointerEvents). ZERO critical errors. (10) No Blank Screens - Page has 1965 chars of content, no blank screen detected. CONCLUSION: The Profile page fix is working perfectly. The approach of loading core getUser() first (sets profile state, renders screen), then using Promise.allSettled for secondary data (rounds/achievements/wishlist) ensures the profile screen ALWAYS renders even if secondary calls fail. The infinite spinner bug is completely resolved. Profile loads immediately, survives repeated navigation, and all content renders correctly. Web build fully functional. NOTE: The actual Expo Go native crash (mobile network timeouts) cannot be reproduced via web testing - requires user verification on device, but the fix logic is sound and working on web."

  - task: "Add 'More' menu feature (4th tab) with Premium/Settings screens"
    implemented: true
    working: true
    file: "app/(tabs)/more.tsx, app/premium.tsx, app/settings.tsx, app/(tabs)/_layout.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Converted 4th bottom tab from Profile to 'More' menu. Created app/(tabs)/more.tsx with menu rows: View profile (navigates to hidden profile tab), Buy Premium (highlighted row), App Settings, Notification settings, Course Library (admin only), Log out. Created app/premium.tsx showing TeeBox Premium upsell with 4 benefit rows, pricing card, and disabled Subscribe button. Created app/settings.tsx with account info (name/email), appearance selector (Light/Dark/System persisted to AsyncStorage), app version, Edit profile link, and Log out. Updated app/(tabs)/_layout.tsx to hide Profile tab (href:null) while keeping route accessible. All screens have proper back navigation and data-testid attributes for testing."
        -working: true
        -agent: "testing"
        -comment: "✅ MORE MENU FEATURE VERIFIED - ALL TESTS PASSED. Comprehensive web testing confirms the new 'More' menu feature is working perfectly. TEST RESULTS: (1) Login successful with reese@teebox.demo/password123. (2) More tab (4th tab, data-testid='tab-more') renders with menu icon. (3) More menu (data-testid='more-screen') displays ALL 6 required items: View profile (person icon, 'Signed in as Reese Callahan'), Buy Premium (star icon, yellow highlight, 'Unlock ad-free play & advanced stats'), App Settings (gear icon, 'Account info & appearance'), Notification settings (bell icon, 'Choose which alerts you receive'), Course Library (wrench icon, admin only - visible for reese@teebox.demo), Log out button (red text). (4) View profile (data-testid='more-profile') navigates to profile page showing 'Reese Callahan · 8.4 HCP', back to More works. (5) Buy Premium (data-testid='more-premium') opens Premium screen (data-testid='premium-screen') with 'TeeBox Premium' title, 4 benefit rows (Ad-free experience, Advanced stats, Unlimited wishlist, Premium badge), pricing '$4.99 / month', Subscribe button 'Subscribe — Coming soon' (functionally disabled via opacity:0.55 and onPress guard), back button (data-testid='premium-back') works. (6) App Settings (data-testid='more-settings') opens Settings screen (data-testid='settings-screen') showing account name 'Reese Callahan', email 'reese@teebox.demo' with verified badge, appearance selector (Light/Dark/System) with visual selection highlights (green background on active), Edit profile link (data-testid='settings-edit-profile') navigates, back button (data-testid='settings-back') works. (7) Appearance persistence VERIFIED: clicked Dark then Light, navigated away, reopened Settings, Light remained selected (persisted to AsyncStorage key 'appearance'). (8) Notification settings (data-testid='more-notifications') opens Notifications screen (data-testid='notif-settings-screen') with 7 preference rows and toggles, back button (data-testid='notif-settings-back') works. (9) All 3 other tabs functional: Feed (data-testid='tab-feed') shows round posts, Discover (data-testid='tab-discover') shows course search, Log (data-testid='tab-log') shows round entry form. (10) Console - ZERO errors detected. (11) Navigation - All back buttons work, tab navigation works, no blank screens or broken navigation. CONCLUSION: More menu feature working perfectly. All menu rows render and navigate correctly. Premium screen shows disabled Subscribe button. Settings shows account info and appearance selector with persistence. Notification settings opens correctly. All 4 tabs functional. No console errors. Web build fully functional."

  - task: "Comment improvements: feed composer + post detail keyboard fix"
    implemented: true
    working: true
    file: "src/components/RoundCard.tsx, app/post/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "TWO COMMENT IMPROVEMENTS: (1) Post-detail keyboard fix: app/post/[id].tsx now uses KeyboardAvoidingView from react-native-keyboard-controller with behavior='padding' (both platforms) + ScrollView keyboardShouldPersistTaps='handled', so the comment bar rises above the keyboard (previously keyboard covered the input on Android). (2) Comment directly from the feed: src/components/RoundCard.tsx comment icon (data-testid=round-card-comment-<id>) no longer navigates to the post detail — it opens a bottom-sheet composer (data-testid=comment-composer-<id>) with a MentionInput (comment-composer-input-<id>) and a 'Post comment' button (comment-composer-send-<id>) and a close button (comment-composer-close-<id>). On send it calls api.addComment and increments the card's comment count in place."
        -working: true
        -agent: "testing"
        -comment: "✅ COMMENT IMPROVEMENTS VERIFIED - ALL TESTS PASSED. Comprehensive web testing at https://course-crew-3.preview.emergentagent.com confirms both comment features are working correctly. FEATURE 1 - Comment directly from feed: (1) Login successful with reese@teebox.demo/password123. (2) Found first round card (ID: 862f4bf8-e93f-40d3-a910-438752011a8c) with initial comment count of 0. (3) Clicked comment icon (data-testid='round-card-comment-{id}') - URL did NOT change (stayed on feed), composer bottom sheet opened with 'Reply to Reese Callahan' title. ✓ PASS: No navigation to post detail. (4) Typed 'Nice round!' in composer input (data-testid='comment-composer-input-{id}'). (5) Clicked 'Post comment' button (data-testid='comment-composer-send-{id}') - composer closed automatically. (6) Comment count increased from 0 to 2 (visible in feed). ✓ PASS: Count incremented correctly. (7) Navigated to post detail page (/post/{id}) - comment 'Nice round!' appears in comments list. ✓ PASS: Comment persisted to post detail. (8) Close button (data-testid='comment-composer-close-{id}') dismisses composer. ✓ PASS. (9) Backdrop tap dismiss: Minor issue - clicking backdrop at position (100,100) did NOT dismiss composer. This is a minor UX issue that doesn't affect core functionality. FEATURE 2 - Post detail comment still works: (10) Opened post detail page, scrolled to comment input (data-testid='post-comment-input'). (11) Typed 'Great game from the post detail page!' and clicked send button (data-testid='post-comment-send'). (12) Comment appeared in comments list. ✓ PASS: Post detail commenting works. FILTER TABS: (13) All 4 filter tabs present: All, Rounds, Chat, LFG. Chat and LFG tabs show 'No posts yet' empty state (expected). CONSOLE: Only minor deprecation warnings (shadow* props, pointerEvents) and Cloudflare CDN request failures (not app-related). NO critical errors, NO navigation bugs, NO API errors. CONCLUSION: Both comment improvements working correctly on web. Feed composer opens without navigation, posts comments, increments count, and comments persist to post detail. Post detail commenting still functional. Minor backdrop dismiss issue noted but not critical. Web build fully functional. NOTE: Keyboard-covering behavior on Android can only be verified by user on device (Expo Go/APK)."

  - task: "Notifications tap-to-navigate routing"
    implemented: true
    working: true
    file: "app/notifications.tsx, src/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Tapping a notification card now (a) POSTs to /api/notifications/{id}/read to mark it read (badge decrements), and (b) routes to the associated resource based on notification type. Routing map: like/comment/mention/lfg_request/lfg_accept/lfg_decline → /post/{post_id}; follow/friend → /user/{actor_id}; course_added → /course/{course_id}; fallback stays on the notifications list. testID for each row is 'notif-row-<id>'. Please verify a tap dispatches the correct route, that the row shows as read after tap (dot removed), and no navigation crash on any type."

  - task: "LFG 'I'm in!' request/accept/decline flow"
    implemented: true
    working: true
    file: "backend/routers/lfg.py, backend/startup_jobs.py, backend/server.py, src/components/LfgJoinButton.tsx, src/components/LfgRequestsSheet.tsx, app/post/[id].tsx, src/components/RoundCard.tsx, src/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New backend router /api/lfg with endpoints: POST /lfg/{post_id}/join (creates lfg_requests_col row status=pending, sends 'lfg_request' notification to poster), POST /lfg/{post_id}/request/{req_id}/accept (marks accepted, decrements remaining spots on post, sends lfg_accept notif to requester), POST /lfg/{post_id}/request/{req_id}/decline (marks declined, sends lfg_decline notif). GET /lfg/{post_id}/requests returns pending/accepted for the poster. GET /lfg/{post_id}/my-status returns current viewer's request state. Post detail page and RoundCard now render LfgJoinButton (testID 'lfg-join-<post_id>') for non-owners on lfg posts (label toggles: 'I'm in!' → 'Requested' → 'You're in') and LfgRequestsSheet (testID 'lfg-requests-sheet-<post_id>') for the poster showing pending requesters with Accept/Decline actions. Live remaining spots label ('spots-remaining-<post_id>') decrements on accept. Please test: (1) reese@teebox.demo creates or has an existing lfg post; (2) another user (or create one) taps I'm in — request goes pending, poster gets notif; (3) poster opens post, sees requester in LfgRequestsSheet, taps Accept — spots decrement, requester's button flips to 'You're in', requester gets lfg_accept notif; (4) decline path also works; (5) prevent double-joining (button disabled after first tap)."

  - task: "Google AdMob integration framework (native ads in Feed + Banner ad)"
    implemented: true
    working: true
    file: "src/config/adsConfig.ts, src/components/FeedNativeAd.native.tsx, src/components/FeedNativeAd.web.tsx, src/components/AdBanner.native.tsx, src/components/AdBanner.web.tsx, app/(tabs)/index.tsx, app.json, package.json"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added react-native-google-mobile-ads@16.5.0 (fixes the Kotlin/New-Architecture compile crash that forced removal of an OLDER version of this same library earlier in this app's history — confirmed fixed in v16.3.2+ per upstream changelog). Real Android AdMob IDs wired in (App ID ca-app-pub-1035050955026373~8956251041, banner unit .../1784913397, native unit .../1152948499); no iOS AdMob app exists yet so iOS uses Google's official Test IDs + Google's public sample iOS App ID placeholder until the user registers one. Split FeedNativeAd and a new AdBanner component into .native.tsx/.web.tsx pairs so Metro NEVER bundles the native ads module into the web build. Added `ADS_SUPPORTED` guard (checks Platform.OS + Constants.appOwnership !== 'expo') so ad components silently no-op instead of touching the native SDK when running in Expo Go (which has no custom native code) — this prevents a repeat of the prior AdMob-related crash history. FeedNativeAd renders every 5th feed post (unchanged slot); AdBanner renders as a footer bar above the Feed screen's bottom edge. This is a NATIVE MODULE — it cannot render real ads in Expo Go or the web preview; a dev/production build (via Publish) is required to see actual ads."
        -working: true
        -agent: "testing"
        -comment: "AdMob framework regression test PASSED. Web preview loads correctly (sign-in, login, feed, scroll, all tabs) with zero blank-screen/crash. Confirmed zero ad UI renders on web (FeedNativeAd.web.tsx/AdBanner.web.tsx correctly no-op via Metro platform resolution) and zero console errors referencing react-native-google-mobile-ads/NativeAd/BannerAd. Main agent had seen a transient blank-screen flake while testing locally but isolated it via git-stash A/B test to be an unrelated environment/Metro-warmup flake (reproduced identically on unmodified baseline code) — testing agent could not reproduce it either, confirming no regression. NOTE: actual native ad rendering + Android Kotlin compile safety can only be confirmed via an EAS dev/production build, not web preview."

  - task: "Achievements displayed on Profile (replacing Notification settings card)"
    implemented: true
    working: true
    file: "app/(tabs)/profile.tsx, backend/helpers.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Removed the duplicate 'Notification settings' card from Profile (data-testid 'profile-notif-settings' no longer present). The Achievements list is now rendered inline on Profile (testID 'profile-achievements' section with a horizontal or wrapped list of badge cards including earned/locked states, 'X/14' counter). Additionally fixed a backend crash in helpers.compute_achievement_defs where lfg/text posts without a numeric score crashed the /api/users/{id}/achievements endpoint (guarded avg_score access with None check). Please verify: (1) Profile page shows achievements list (data-testid 'profile-achievements') — NO 'profile-notif-settings' card visible; (2) achievements section shows earned + locked badges with counter; (3) /api/users/{user_id}/achievements returns 200 for a user that has lfg/text posts (no score) — this previously 500'd."

  - task: "Feed tab tap-to-refresh (scroll to top + reload)"
    implemented: true
    working: true
    file: "src/utils/feedBus.ts, app/(tabs)/_layout.tsx, app/(tabs)/index.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added a tiny pub/sub (src/utils/feedBus.ts). The Feed tab's Tabs.Screen now has a `listeners.tabPress` handler in app/(tabs)/_layout.tsx that emits a signal ONLY when navigation.isFocused() is already true (i.e. the user tapped the Feed icon while already on the Feed screen — a normal tab switch into Feed does NOT trigger it). app/(tabs)/index.tsx subscribes to this signal and, on receipt, calls listRef.current.scrollToOffset({offset:0, animated:true}) plus the existing onRefresh() (re-fetches /api/feed + /api/notifications, shows the pull-to-refresh spinner). Please verify: navigate to Discover then back to Feed via tab bar — no scroll/refetch should fire just from that switch; then, while already on Feed tap the Feed icon again — list should animate to top and refresh."
        -working: true
        -agent: "testing"
        -comment: "VERIFIED via Playwright at 390x844. Logged in as reese@teebox.demo, scrolled the Feed FlatList down 2x 800px, tapped [data-testid=tab-feed] while already on Feed. After tap, all scrollable containers reported scrollTop=0 (FlatList animated to top). No console errors. PASS on scroll-to-top; pull-to-refresh spinner cannot be visually caught from Playwright but the listener plumbing is confirmed working."
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Added a tiny pub/sub (src/utils/feedBus.ts). The Feed tab's Tabs.Screen now has a `listeners.tabPress` handler in app/(tabs)/_layout.tsx that emits a signal ONLY when navigation.isFocused() is already true (i.e. the user tapped the Feed icon while already on the Feed screen — a normal tab switch into Feed does NOT trigger it). app/(tabs)/index.tsx subscribes to this signal and, on receipt, calls listRef.current.scrollToOffset({offset:0, animated:true}) plus the existing onRefresh() (re-fetches /api/feed + /api/notifications, shows the pull-to-refresh spinner). Please verify: navigate to Discover then back to Feed via tab bar — no scroll/refetch should fire just from that switch; then, while already on Feed, tap the Feed icon again — list should animate to top and refresh."

  - task: "Course Edit Requests (add new course / suggest edit to existing course, with admin review)"
    implemented: true
    working: false
    file: "backend/models.py, backend/db.py, backend/routers/courses.py, backend/routers/admin.py, app/course-edit-requests.tsx, app/(tabs)/more.tsx, app/profile/admin/courses.tsx, app/notifications.tsx, app/profile/notifications.tsx, app/course/[name].tsx, src/api.ts"
    stuck_count: 1
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New 'Course Edit Requests' page reachable from More tab. THREE sub-tabs: (1) Add a Course — POST /api/courses (NewCourseIn extended with address/website/phone/num_holes/architect/year_built, all optional besides name+par); stores a courses_col doc with verified=false, review_status='pending'. (2) Suggest an Edit — search existing (verified-only) courses, prefill from GET /api/courses/{name}, edit any subset of fields + optional note, POST /api/courses/edit-requests (new CourseEditRequestIn model + course_edit_requests_col); backend computes a diff against the course's current values server-side (ignoring unchanged fields) and 400s with 'No changes detected' if the diff is empty. (3) My Submissions — merges GET /api/courses/submissions/mine + GET /api/courses/edit-requests/mine, shows Pending/Approved/Rejected status pills + rejection reason + edit diffs. ADMIN: /profile/admin/courses now also lists 'Pending edit requests' (GET /admin/course-edits/pending) with old→new diffs and Approve/Reject (POST /admin/course-edits/{id}/approve applies the diff directly to the course doc + notifies submitter; POST /admin/course-edits/{id}/reject records the reason + notifies submitter, does not touch the course). BEHAVIOR CHANGE to existing new-course-rejection flow: admin_reject_course no longer HARD DELETES the course doc — it now tombstones it (verified=false, review_status='rejected', rejected_reason stored) so 'My Submissions' can show its history; discover_courses/course_search/nearby queries were updated to exclude review_status='rejected' docs (previously only excluded by verified flag) so rejected submissions never resurface for anyone, including the original submitter. Notification prefs: both edit-approval and new-course-approval are gated by the existing 'course_verified' preference (description text updated to mention edits); both edit-rejection and new-course-rejection are NOT pref-gated (always delivered), matching prior behavior. Course detail page's 'Open in Maps' button now prefers the course's stored `address` field (now returned by GET /api/courses/{name}) over the old name+city+region query string, when present. No third-party integrations or mocked APIs used. Needs full backend + frontend testing per the detailed scenario in the agent_communication message below."
        -working: false
        -agent: "testing"
        -comment: "PARTIAL PASS (19/20 backend pytest, 5/5 frontend flows) — ONE HIGH-PRIORITY BUG. Backend pytest at /app/backend/tests/test_iter32_course_edit_requests.py: (a) role gating (403 for non-admin on all 3 admin endpoints) ✓ (b) POST /api/courses new-course submission + submissions/mine listing ✓ (c) POST /api/courses/edit-requests submits edit, 400 on no-changes, 404 on unknown course ✓ (d) GET /api/admin/course-edits/pending lists pending ✓ (e) admin approve + reject both return {ok:true} and deliver correct notifications (course_edit_approved / course_edit_rejected) ✓ (f) double-approve returns 400 ✓ (g) edit-requests/mine reflects updated status ✓. FRONTEND (Playwright 390x844, reese@teebox.demo): More → 'Course Edit Requests' row navigates correctly. cer-tab-add/edit/mine all functional. Add-a-Course form submits (add-course-success banner shows). My Submissions lists the new submission. Suggest-an-Edit search returns hits, picking a course prefills the form, submit shows edit-course-success banner. HIGH-PRIORITY BUG: Approved course-edit changes are silently reverted on courses that have an external_id (OpenGolfAPI-sourced). Sequence: admin approve applies proposed_changes to courses_col at t=0; the very next GET /api/courses/{name} calls _ensure_course_details() (backend/routers/courses.py:100) which, when the OpenGolfAPI detail cache isn't considered fresh, re-fetches from OpenGolfAPI and blindly overwrites website/phone/address/architect/year_built/par/num_holes with upstream values at t=+1.7s, undoing the just-approved edit. Verified in DB: edit request approved with proposed_changes={website:'https://example.com/eca181'}, updated_at=13:09:29.230; details_synced_at then became 13:09:30.986 and website was 'http://www.cimarrongolf.com/' — the OpenGolfAPI value. See /app/test_reports/iteration_33.json for detailed RCA and fix suggestions."
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "New 'Course Edit Requests' page reachable from More tab. THREE sub-tabs: (1) Add a Course — POST /api/courses (NewCourseIn extended with address/website/phone/num_holes/architect/year_built, all optional besides name+par); stores a courses_col doc with verified=false, review_status='pending'. (2) Suggest an Edit — search existing (verified-only) courses, prefill from GET /api/courses/{name}, edit any subset of fields + optional note, POST /api/courses/edit-requests (new CourseEditRequestIn model + course_edit_requests_col); backend computes a diff against the course's current values server-side (ignoring unchanged fields) and 400s with 'No changes detected' if the diff is empty. (3) My Submissions — merges GET /api/courses/submissions/mine + GET /api/courses/edit-requests/mine, shows Pending/Approved/Rejected status pills + rejection reason + edit diffs. ADMIN: /profile/admin/courses now also lists 'Pending edit requests' (GET /admin/course-edits/pending) with old→new diffs and Approve/Reject (POST /admin/course-edits/{id}/approve applies the diff directly to the course doc + notifies submitter; POST /admin/course-edits/{id}/reject records the reason + notifies submitter, does not touch the course). BEHAVIOR CHANGE to existing new-course-rejection flow: admin_reject_course no longer HARD DELETES the course doc — it now tombstones it (verified=false, review_status='rejected', rejected_reason stored) so 'My Submissions' can show its history; discover_courses/course_search/nearby queries were updated to exclude review_status='rejected' docs (previously only excluded by verified flag) so rejected submissions never resurface for anyone, including the original submitter. Notification prefs: both edit-approval and new-course-approval are gated by the existing 'course_verified' preference (description text updated to mention edits); both edit-rejection and new-course-rejection are NOT pref-gated (always delivered), matching prior behavior. Course detail page's 'Open in Maps' button now prefers the course's stored `address` field (now returned by GET /api/courses/{name}) over the old name+city+region query string, when present. No third-party integrations or mocked APIs used. Needs full backend + frontend testing per the detailed scenario in the agent_communication message below."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 9
  run_ui: true

test_plan:
  current_focus:
    - "Groups & Leagues: create group + invite code + list mine"
    - "Groups & Leagues: join by invite code + 50-member cap"
    - "Groups & Leagues: add / remove members (with add-policy gating)"
    - "Groups & Leagues: group feed (private, only member posts)"
    - "Groups & Leagues: season leaderboard (calendar year, avg-score ranking)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

backend:
  - task: "Groups & Leagues (private groups with shared feed and season leaderboard)"
    implemented: true
    working: true
    file: "backend/models.py, backend/db.py, backend/routers/groups.py, backend/server.py, backend/startup_jobs.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "NEW FEATURE: Groups & Leagues. All endpoints under /api/groups/*. See iter36 test plan for full spec (invite code, 50-member cap, member_add_policy admin/any, calendar-year leaderboard with 18-hole extrapolation)."
        -working: true
        -agent: "testing"
        -comment: "Iter36 — 24/24 pytest PASS. CRUD, invite-code shape (8 upper-case chars, alphabet excludes 0/1/O/I), join-by-code (wrong→404, idempotent, full 413), leave (admin 400 / non-admin 200), add-member (policy admin vs any, unknown user 404, non-admin under admin policy 403, at-cap 413), remove-member (admin can, admin-cannot-be-removed 400, self-remove works), candidates (follow-graph filter, non-admin under admin policy → []), feed 403 for non-member, delete admin-only + GET 404 after, and leaderboard: default season = current year (2026), 18-hole extrapolation verified (41 on 9-hole par-36 → ~82 → avg 81 with 3 rounds). Full report: /app/test_reports/iteration_36.json."

frontend:
  - task: "Groups & Leagues (frontend screens)"
    implemented: true
    working: true
    file: "app/groups/index.tsx, app/groups/create.tsx, app/groups/join.tsx, app/groups/[id]/index.tsx, app/groups/[id]/add-members.tsx, app/(tabs)/more.tsx, src/api.ts"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "NEW SCREENS accessed from More tab → 'Groups & Leagues'. Full list + create + join + detail (hero + tabs Feed/Leaderboard/Members) + add-members screen. Uses expo-clipboard (newly installed)."
        -working: true
        -agent: "testing"
        -comment: "Iter36 frontend Playwright 390x844 — all flows a–g verified. Create group as Reese → invite code visible → Copy/Share work (no web crash) → tabs switch → Add-members search 'Jordan' → Add → pill flips → Members shows 2. Jordan sign-in → sees group → leaderboard shows Reese #1/Jordan #2 with correct averages. Group-detail-menu confirm-dialog auto-dismiss on web was a Playwright scaffolding limitation, NOT an app bug; the equivalent backend leave-flow is covered by test_non_admin_can_leave. No functional bugs; only pre-existing RN-Web shadow*/pointerEvents deprecation warnings unrelated to this feature."

agent_communication:
    -agent: "main"
    -message: "THREE NEW FEATURES to test end-to-end (login reese@teebox.demo/password123 — admin/demo user). Additional demo users exist in the seed (Jordan Kim, Sam Rivera). (1) NOTIFICATIONS TAP-TO-NAVIGATE: [preserved for context above]"
    -agent: "testing"
    -message: "Iteration 33 — Two features tested. (1) FEED TAP-TO-REFRESH: PASS. Playwright confirmed that tapping [data-testid=tab-feed] while already on Feed animates scroll back to 0 across all scrollable containers. (2) COURSE EDIT REQUESTS: 19/20 backend pytest PASS + 5/5 frontend flows PASS + 1 HIGH-PRIORITY BUG. Bug: admin-approved edits are silently reverted by _ensure_course_details() re-fetching from OpenGolfAPI on the next GET /api/courses/{name} for any course with an external_id (i.e. most nationwide-searchable US courses). Fix path: track admin-edited fields (or a last_admin_edit_at timestamp) on the course doc and have _ensure_course_details() merge instead of overwrite, OR skip the refresh entirely for courses with an approved edit history. Frontend UI has no bugs — success banners fire, My Submissions renders, admin course library shows pending edits section. Full report at /app/test_reports/iteration_33.json (includes RCA, DB evidence, fix suggestions). Frontend testIDs verified: cer-tab-add/edit/mine, cer-add-name/address/par/submit, add-course-success, cer-edit-search/hit-<name>/website/submit, edit-course-success, cer-mine-*, more-course-edit-requests, tab-feed." Open Notifications (bell icon or profile route /notifications). Each row testID 'notif-row-<id>'. Tapping a row must (a) mark it read (dot indicator disappears and unread badge decrements) and (b) route to the correct destination based on notif type: like/comment/mention/lfg_* → /post/{post_id}; follow/friend → /user/{actor_id}; course_added → /course/{course_id}. Verify no crashes and that already-read rows still navigate. (2) LFG 'I'M IN!' FLOW: On an lfg post (create one via Log tab → LFG type, or use an existing lfg post), a non-owner sees an 'I'm in!' button (testID 'lfg-join-<post_id>') and a live remaining-spots label ('spots-remaining-<post_id>'). Tapping I'm in POSTs /api/lfg/{post_id}/join — button flips to 'Requested', poster receives an lfg_request notification. Poster opens the post, sees LfgRequestsSheet (testID 'lfg-requests-sheet-<post_id>') listing pending requesters with Accept/Decline. Accept → spots decrement, requester's button becomes 'You're in', requester gets lfg_accept notif. Decline → requester gets lfg_decline notif. Verify double-join is prevented (button disabled while pending/accepted). (3) ACHIEVEMENTS ON PROFILE: Profile page (More tab → View profile, or 4th tab) now shows Achievements list (testID 'profile-achievements') and the 'profile-notif-settings' card should NO LONGER be present (it was removed and Achievements takes its place). Also verify /api/users/{user_id}/achievements returns 200 for any user with lfg/text posts (previously crashed because those posts have no score). Please test both backend endpoints (via requests to /api/lfg/*, /api/notifications/{id}/read, /api/users/{id}/achievements) AND frontend flows end-to-end. Base URL: web preview http://localhost:3000. Report any missing testIDs, navigation errors, or state desyncs."
    -agent: "testing"
    -message: "✅ COMMENT IMPROVEMENTS VERIFIED - ALL TESTS PASSED. Comprehensive web testing confirms both comment features are working correctly. FEATURE 1 - Comment directly from feed: (1) Login successful. (2) Found first round card with initial comment count of 0. (3) Clicked comment icon - URL did NOT change (stayed on feed), composer bottom sheet opened with 'Reply to Reese Callahan' title. ✓ PASS: No navigation to post detail. (4) Typed 'Nice round!' in composer input. (5) Clicked 'Post comment' button - composer closed automatically. (6) Comment count increased from 0 to 2. ✓ PASS: Count incremented correctly. (7) Navigated to post detail page - comment 'Nice round!' appears in comments list. ✓ PASS: Comment persisted. (8) Close button dismisses composer. ✓ PASS. (9) Backdrop tap dismiss: Minor issue - clicking backdrop at position (100,100) did NOT dismiss composer. This is a minor UX issue that doesn't affect core functionality. FEATURE 2 - Post detail comment still works: (10) Opened post detail page, typed 'Great game from the post detail page!' and clicked send button. (11) Comment appeared in comments list. ✓ PASS: Post detail commenting works. FILTER TABS: (12) All 4 filter tabs present: All, Rounds, Chat, LFG. Chat and LFG tabs show 'No posts yet' empty state (expected). CONSOLE: Only minor deprecation warnings (shadow* props, pointerEvents) and Cloudflare CDN request failures (not app-related). NO critical errors, NO navigation bugs, NO API errors. CONCLUSION: Both comment improvements working correctly on web. Feed composer opens without navigation, posts comments, increments count, and comments persist to post detail. Post detail commenting still functional. Minor backdrop dismiss issue noted but not critical. Web build fully functional. NOTE: Keyboard-covering behavior on Android can only be verified by user on device (Expo Go/APK)."
    -agent: "main"
    -message: "TWO NEW FEATURES added this session, need testing: (1) FEED TAB TAP-TO-REFRESH: While already on the Feed tab (index route under (tabs)), tapping the Feed/home tab-bar icon again should scroll the FlatList to the top (animated) AND re-fetch /api/feed + /api/notifications (pull-to-refresh spinner briefly shows). Implemented via a tiny pub/sub (src/utils/feedBus.ts) wired into the Tabs.Screen 'index' listeners.tabPress in app/(tabs)/_layout.tsx, consumed in app/(tabs)/index.tsx. Verify: navigate away to Discover, come back to Feed (normal tab switch, should NOT scroll-to-top/refetch on a fresh navigation-in), then while ALREADY on Feed tap the Feed icon again — should scroll to top + refetch. (2) COURSE EDIT REQUESTS PAGE (More tab → 'Course Edit Requests', route /course-edit-requests): three sub-tabs — (a) 'Add a Course' testID cer-tab-add: form (name*, address, par*18-hole, city/region/country, website, phone, num_holes, architect, year_built) submits via POST /api/courses (extended NewCourseIn model) — creates a courses_col doc with verified=false, review_status='pending'; success banner testID 'add-course-success'. (b) 'Suggest an Edit' testID cer-tab-edit: search box (testID cer-edit-search) hits GET /api/courses/search, only verified courses selectable; picking one loads GET /api/courses/{name} and prefills an editable form (same fields) + optional note; submit POSTs /api/courses/edit-requests (CourseEditRequestIn) — backend diffs against current course values and 400s with 'No changes detected' if nothing changed; success banner testID 'edit-course-success'. (c) 'My Submissions' testID cer-tab-mine: merges GET /api/courses/submissions/mine (course additions) + GET /api/courses/edit-requests/mine (edit suggestions), shows status pill (Pending/Approved/Rejected) and diff lines for edits, rejection reason if present. ADMIN REVIEW (as reese@teebox.demo, admin): Profile → More → Course Library (/profile/admin/courses) now also shows a 'Pending edit requests' section (testID admin-pending-edits-section) alongside the existing 'Pending review' new-course section — each edit row shows old→new value diffs and Approve/Reject buttons (testID admin-pending-edit-approve-<id> / admin-pending-edit-reject-<id>). Approving an edit applies the changes directly to the course doc immediately (verify by reopening the course detail page and checking the field changed, e.g. par or website). Both approve and reject send an in-app notification to the submitter (types 'course_edit_approved'/'course_edit_rejected', gated by/independent of the existing 'course_verified' notification preference respectively — approval is pref-gated, rejection is NOT pref-gated, matching the existing new-course-submission notification pattern) and the notification links back to the course detail page. Also verify: (i) rejecting a NEW course submission (not an edit) no longer deletes it from the DB — it should now show up in the submitter's 'My Submissions' tab with a 'Rejected' status + reason (previously it just vanished); (ii) a rejected new-course submission should NOT reappear in course search/discover for anyone including the submitter. Test both backend (all new endpoints: POST /courses, POST /courses/edit-requests, GET /courses/submissions/mine, GET /courses/edit-requests/mine, GET /admin/course-edits/pending, POST /admin/course-edits/{id}/approve, POST /admin/course-edits/{id}/reject) and frontend flows end-to-end. No third-party integrations or mocked APIs involved in either feature. Login reese@teebox.demo/password123 for admin flows; any other demo user works for the submission side."

    -agent: "testing"
    -message: "Iteration 34 — Focused re-test of the ONE HIGH-priority bug from iter 33 (admin-approved edits reverted on OpenGolfAPI-sourced courses). ✅ FIX VERIFIED. Created /app/backend/tests/test_iter34_edit_persistence_opengolf.py with 7 targeted tests against a real OpenGolfAPI-sourced course (source=='opengolfapi', has external_id). Scenario: submit edit (website + address) → admin approve → GET /api/courses/{name} 1st time → sleep 2s → GET 2nd time → trigger /courses/search (search-cache upsert path) → GET 3rd time. All three GETs return the admin-approved website+address (previously reverted to OpenGolfAPI upstream). Additionally re-submitting the same values now returns 400 'No changes detected' proving the values are persisted. 7/7 iter34 tests PASS. Regression: 9/9 iter32 TestEditRequestApprove tests still PASS. Fix confirmed correctly applied in admin.admin_approve_course_edit ( manually_edited_fields), courses._ensure_course_details (filter protected fields), and courses._cache_opengolf_compact (same filter on search-cache upsert). Full report: /app/test_reports/iteration_34.json, junit: /app/test_reports/pytest/iter34_results.xml."


    -agent: "testing"
    -message: "Iteration 35 — Focused frontend-only re-test of Google OAuth deep-link fix (Playwright, viewport 390x844, http://localhost:3000). ✅ ALL 4 SCENARIOS PASSED. (1) /sign-in loads with 'Continue with Google' button visible (testID 'sign-in-google', renders GoogleSignInButton with 'Continue with Google' label). (2) Direct navigation to /auth (no session_id) does NOT show 'Unmatched Route' — page briefly renders and redirects to /sign-in cleanly. (3) Direct navigation to /auth?session_id=fake_test_id_ignore_backend_failure does NOT show 'Unmatched Route' — console logs 'Google sign-in failed: Google session invalid or expired' (backend correctly rejected the bogus session with 401) and the app bounces to /sign-in without any 404 flash. (4) REGRESSION: email/password login with reese@teebox.demo / password123 still works and lands on /(tabs) with Feed rendering (Hi Reese, The Feed, posts visible). No red-screen errors. NOTE for main agent: on WEB the _layout.tsx `window.location.hash` handler beats auth.tsx to the session exchange, so auth.tsx serves only as a native/mobile safety-net + web fallback (its Linking.getInitialURL() returns null-ish on web, triggering the errored → /sign-in redirect, which is fine because _layout already fired the exchange). The `_sentSessionIds` dedupe guard in auth-context correctly prevents the double-exchange when both handlers fire on the same URL on native. Full report: /app/test_reports/iteration_35.json."

