import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const ACCESS_KEY = 'teebox_access_v2';
const REFRESH_KEY = 'teebox_refresh_v2';

export type User = {
  id: string;
  email?: string;
  display_name: string;
  home_course?: string;
  handicap?: number | null;
  bio?: string;
  avatar?: string | null;
  is_admin?: boolean;
  email_verified?: boolean;
  notification_prefs?: NotificationPrefs;
  public_group_ids?: string[];
};

export type NotificationPrefs = {
  comment_like: boolean;
  achievement_unlocked: boolean;
  post_like: boolean;
  post_comment: boolean;
  mention: boolean;
  follow: boolean;
  course_verified: boolean;
  lfg_interest: boolean;
  lfg_response: boolean;
  direct_message: boolean;
  group_invite: boolean;
  group_invite_response: boolean;
  group_join_request: boolean;
  group_join_response: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  comment_like: true,
  achievement_unlocked: true,
  post_like: true,
  post_comment: true,
  mention: true,
  follow: true,
  course_verified: true,
  lfg_interest: true,
  lfg_response: true,
  direct_message: true,
  group_invite: true,
  group_invite_response: true,
  group_join_request: true,
  group_join_response: true,
};

export type ImportJob = {
  id: string;
  kind: 'global' | 'country';
  country?: string;
  tile_deg?: number;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  total_tiles: number;
  processed_tiles: number;
  inserted: number;
  errors: number;
  total_courses_after?: number;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  updated_at?: string;
  error?: string;
};

export async function saveTokens(access: string, refresh: string) {
  await storage.secureSet(ACCESS_KEY, access);
  await storage.secureSet(REFRESH_KEY, refresh);
}

export async function getAccessToken(): Promise<string | null> {
  const v = await storage.secureGet<string>(ACCESS_KEY, '');
  return v && typeof v === 'string' && v.length > 0 ? v : null;
}

export async function getRefreshToken(): Promise<string | null> {
  const v = await storage.secureGet<string>(REFRESH_KEY, '');
  return v && typeof v === 'string' && v.length > 0 ? v : null;
}

export async function clearTokens() {
  await storage.secureRemove(ACCESS_KEY);
  await storage.secureRemove(REFRESH_KEY);
}

// ------- Refresh queue: serialize concurrent refreshes so we never double-rotate -------
let refreshInFlight: Promise<string | null> | null = null;
let onAuthLostHandler: (() => void) | null = null;

export function setOnAuthLost(handler: () => void) {
  onAuthLostHandler = handler;
}

// Fetch with an abort-controller timeout. Prevents cold-start freezes when the
// backend is unreachable (offline / DNS / slow network) — a bare fetch() would
// hang forever and the app would sit on the splash screen indefinitely.
async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function performRefresh(): Promise<string | null> {
  const rt = await getRefreshToken();
  if (!rt) return null;
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) throw new Error(`refresh failed ${res.status}`);
    const data = await res.json();
    await saveTokens(data.access_token, data.refresh_token);
    return data.access_token as string;
  } catch {
    await clearTokens();
    onAuthLostHandler?.();
    return null;
  }
}

function refreshAccess(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(path: string, opts: RequestInit = {}, auth = true, _retry = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetchWithTimeout(`${BASE}/api${path}`, { ...opts, headers });
  if (res.status === 401 && auth && !_retry) {
    // Attempt a single refresh + retry
    const newAccess = await refreshAccess();
    if (newAccess) return request<T>(path, opts, auth, true);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : 'Request failed');
  }
  return data as T;
}

export const api = {
  register: (payload: {
    email: string;
    password: string;
    display_name: string;
    home_course?: string;
    handicap?: number;
  }) =>
    request<{ access_token: string; refresh_token: string; user: User }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
      false,
    ),
  login: (email: string, password: string) =>
    request<{ access_token: string; refresh_token: string; user: User }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    ),
  logout: async () => {
    const rt = await getRefreshToken();
    if (rt) {
      try {
        await fetch(`${BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
      } catch {}
    }
    await clearTokens();
  },
  me: () => request<User>('/auth/me'),
  updateMe: (payload: Partial<User>) =>
    request<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),

  feed: (scope: 'followers' | 'all' = 'followers') =>
    request<any[]>(`/feed?scope=${scope}`),
  createRound: (payload: any) => request<any>('/rounds', { method: 'POST', body: JSON.stringify(payload) }),
  updateRound: (id: string, payload: any) =>
    request<any>(`/rounds/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  getRound: (id: string) => request<any>(`/rounds/${id}`),
  deleteRound: (id: string) => request<any>(`/rounds/${id}`, { method: 'DELETE' }),
  toggleLike: (id: string) => request<{ liked: boolean; like_count: number }>(`/rounds/${id}/like`, { method: 'POST' }),
  getRoundLikers: (id: string) => request<any[]>(`/rounds/${id}/likes`),
  getCommentLikers: (roundId: string, commentId: string) =>
    request<any[]>(`/rounds/${roundId}/comments/${commentId}/likes`),
  getComments: (id: string) => request<any[]>(`/rounds/${id}/comments`),
  addComment: (id: string, text: string, mentions: string[] = []) =>
    request<any>(`/rounds/${id}/comments`, { method: 'POST', body: JSON.stringify({ text, mentions }) }),
  updateComment: (roundId: string, commentId: string, text: string, mentions: string[] = []) =>
    request<any>(`/rounds/${roundId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text, mentions }),
    }),
  deleteComment: (roundId: string, commentId: string) =>
    request<{ ok: boolean }>(`/rounds/${roundId}/comments/${commentId}`, { method: 'DELETE' }),
  getUserCoursesPlayed: (userId: string) =>
    request<any[]>(`/users/${userId}/courses-played`),
  toggleCommentLike: (roundId: string, commentId: string) =>
    request<{ liked: boolean; like_count: number }>(
      `/rounds/${roundId}/comments/${commentId}/like`,
      { method: 'POST' },
    ),
  requestPasswordReset: (email: string) =>
    request<{ ok: boolean; message: string }>('/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, new_password: string) =>
    request<{ ok: boolean; message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean; message: string }>('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  resendVerification: (email: string) =>
    request<{ ok: boolean; message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  googleSignIn: (session_id: string) =>
    request<{ access_token: string; refresh_token: string; user: User }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ session_id }),
    }),

  getUser: (id: string) => request<any>(`/users/${id}`),
  getUserRounds: (id: string) => request<any[]>(`/users/${id}/rounds`),
  getUserAchievements: (id: string) => request<{ total: number; achievements: any[] }>(`/users/${id}/achievements`),
  getUserWishlist: (id: string) => request<any[]>(`/users/${id}/wishlist`),
  getUserFriends: (id: string) => request<any[]>(`/users/${id}/friends`),
  pinRound: (roundId: string) =>
    request<{ pinned: boolean; round_id: string }>(`/rounds/${roundId}/pin`, { method: 'POST' }),
  unpinRound: () => request<{ pinned: boolean }>(`/users/me/pin`, { method: 'DELETE' }),
  addWishlist: (course_name: string) =>
    request<{ added: boolean }>('/wishlist', { method: 'POST', body: JSON.stringify({ course_name }) }),
  removeWishlist: (course_name: string) =>
    request<{ removed: boolean }>(`/wishlist/${encodeURIComponent(course_name)}`, { method: 'DELETE' }),
  checkWishlist: (course_name: string) =>
    request<{ on_wishlist: boolean }>(`/wishlist/check/${encodeURIComponent(course_name)}`),
  toggleFollow: (id: string) => request<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' }),

  discoverUsers: (q: string, connectionsOnly?: boolean) =>
    request<any[]>(
      `/discover/users?q=${encodeURIComponent(q)}${connectionsOnly ? '&connections_only=true' : ''}`,
    ),
  getUserByName: (name: string) =>
    request<{ id: string; display_name: string; avatar?: string | null }>(
      `/users/by-name/${encodeURIComponent(name)}`,
    ),
  discoverCourses: (q: string, coords?: { lat: number; lng: number }) =>
    request<any[]>(
      `/discover/courses?q=${encodeURIComponent(q)}${coords ? `&lat=${coords.lat}&lng=${coords.lng}` : ''}`,
    ),
  discoverCoursesNearby: (lat: number, lng: number, radiusKm = 80) =>
    request<Array<{
      course_name: string;
      city?: string | null;
      region?: string | null;
      country?: string | null;
      par?: number | null;
      num_holes?: number | null;
      distance_km: number;
      play_count: number;
      review_count: number;
      avg_rating?: number | null;
    }>>(`/discover/courses/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`),
  courseReviews: (name: string) => request<any[]>(`/courses/${encodeURIComponent(name)}/reviews`),
  courseRounds: (name: string) => request<any[]>(`/courses/${encodeURIComponent(name)}/rounds`),
  courseInfo: (name: string) => request<any>(`/courses/${encodeURIComponent(name)}`),
  createReview: (payload: { course_name: string; rating: number; text: string }) =>
    request<any>('/courses/reviews', { method: 'POST', body: JSON.stringify(payload) }),

  // ---- Course search / community submission ----
  searchCourses: (q: string, coords?: { lat: number; lng: number }) =>
    request<Array<{
      id: string;
      name: string;
      city?: string | null;
      region?: string | null;
      country?: string | null;
      lat?: number | null;
      lng?: number | null;
      par?: number | null;
      num_holes?: number | null;
      verified: boolean;
      submitted_by_me: boolean;
    }>>(
      `/courses/search?q=${encodeURIComponent(q)}${coords ? `&lat=${coords.lat}&lng=${coords.lng}` : ''}`,
    ),
  submitCourse: (payload: {
    name: string;
    par: number;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    website?: string;
    phone?: string;
    num_holes?: number;
    architect?: string;
    year_built?: number;
  }) =>
    request<{ course: any; created: boolean }>('/courses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  myCourseSubmissions: () =>
    request<Array<{
      id: string; name: string; par?: number | null; address?: string | null;
      city?: string | null; region?: string | null; country?: string | null;
      website?: string | null; phone?: string | null;
      status: 'pending' | 'approved' | 'rejected'; rejected_reason?: string | null; created_at: string;
    }>>('/courses/submissions/mine'),

  // ---- Suggested edits to existing courses ----
  submitCourseEditRequest: (payload: {
    course_name: string;
    par?: number;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    website?: string;
    phone?: string;
    num_holes?: number;
    architect?: string;
    year_built?: number;
    note?: string;
  }) =>
    request<any>('/courses/edit-requests', { method: 'POST', body: JSON.stringify(payload) }),
  myCourseEditRequests: () =>
    request<Array<{
      id: string; course_name: string; proposed_changes: Record<string, any>;
      previous_values: Record<string, any>; note?: string | null;
      status: 'pending' | 'approved' | 'rejected'; reason?: string | null; created_at: string;
    }>>('/courses/edit-requests/mine'),

  // ---- Notifications ----
  listNotifications: () =>
    request<{ notifications: Array<{
      id: string; type: string; title: string; body: string; read: boolean; created_at: string;
      course_name?: string; reason?: string; round_id?: string; comment_id?: string;
      actor_id?: string; actor_name?: string; achievement_key?: string; interest_id?: string;
      group_id?: string; group_name?: string; invite_id?: string; request_id?: string;
    }>; unread: number }>('/notifications'),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),

  // ---- LFG: "I'm in!" join requests ----
  lfgToggleInterest: (roundId: string) =>
    request<{
      status: 'pending' | null;
      interest_id: string | null;
      lfg_accepted_count: number;
      lfg_pending_count: number;
      lfg_spots_remaining: number | null;
    }>(`/rounds/${roundId}/lfg/interest`, { method: 'POST' }),
  lfgListInterests: (roundId: string) =>
    request<Array<{
      id: string;
      round_id: string;
      user_id: string;
      status: 'pending' | 'accepted' | 'declined';
      created_at: string;
      responded_at?: string;
      user?: { id: string; display_name: string; avatar?: string | null };
    }>>(`/rounds/${roundId}/lfg/interests`),
  lfgRespond: (roundId: string, interestId: string, accept: boolean) =>
    request<{
      ok: boolean;
      status: 'accepted' | 'declined';
      lfg_accepted_count: number;
      lfg_pending_count: number;
      lfg_spots_remaining: number | null;
    }>(`/rounds/${roundId}/lfg/interests/${interestId}/${accept ? 'accept' : 'decline'}`, { method: 'POST' }),

  // ---- Admin: pending courses ----
  adminListPendingCourses: () =>
    request<Array<{ id: string; name: string; par: number; city?: string; region?: string; country?: string; submitted_by_name?: string; created_at: string; round_count: number }>>('/admin/courses/pending'),
  adminVerifyCourse: (id: string) =>
    request<{ ok: boolean }>(`/admin/courses/${id}/verify`, { method: 'POST' }),
  adminRejectCourse: (id: string, reason: string) =>
    request<{ ok: boolean }>(`/admin/courses/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // ---- Admin: pending course edit requests ----
  adminListPendingCourseEdits: () =>
    request<Array<{
      id: string; course_name: string; proposed_changes: Record<string, any>;
      previous_values: Record<string, any>; note?: string | null;
      submitted_by_name?: string; created_at: string;
    }>>('/admin/course-edits/pending'),
  adminApproveCourseEdit: (id: string) =>
    request<{ ok: boolean }>(`/admin/course-edits/${id}/approve`, { method: 'POST' }),
  adminRejectCourseEdit: (id: string, reason: string) =>
    request<{ ok: boolean }>(`/admin/course-edits/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // ---- Admin: bulk OSM course import ----
  adminCourseStats: () =>
    request<{ total_courses: number; by_source: Record<string, number>; supported_countries: string[] }>(
      '/admin/courses/stats',
    ),
  adminImportGlobal: (tile = 20, delay = 2) =>
    request<{ job_id: string; total_tiles: number; status: string }>(
      `/admin/courses/import-osm-global?tile=${tile}&delay=${delay}`,
      { method: 'POST' },
    ),
  adminImportCountry: (country: string, tile = 10, delay = 2) =>
    request<{ job_id: string; total_tiles: number; country: string; status: string }>(
      `/admin/courses/import-osm-country?country=${encodeURIComponent(country)}&tile=${tile}&delay=${delay}`,
      { method: 'POST' },
    ),
  adminGetJob: (id: string) => request<ImportJob>(`/admin/courses/import-jobs/${id}`),
  adminListJobs: () =>
    request<{ jobs: ImportJob[]; total_courses: number }>('/admin/courses/import-jobs'),
  adminCancelJob: (id: string) =>
    request<{ ok: boolean }>(`/admin/courses/import-jobs/${id}/cancel`, { method: 'POST' }),

  // ---- Groups & Leagues ----
  listMyGroups: () => request<Group[]>('/groups/mine'),
  createGroup: (payload: { name: string; description?: string; member_add_policy: 'admin' | 'any' }) =>
    request<Group>('/groups', { method: 'POST', body: JSON.stringify(payload) }),
  getGroup: (id: string) => request<Group>(`/groups/${id}`),
  updateGroup: (id: string, payload: Partial<{ name: string; description: string; member_add_policy: 'admin' | 'any' }>) =>
    request<Group>(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGroup: (id: string) => request<{ ok: boolean }>(`/groups/${id}`, { method: 'DELETE' }),
  joinGroupByCode: (invite_code: string) =>
    request<Group>('/groups/join', { method: 'POST', body: JSON.stringify({ invite_code }) }),
  leaveGroup: (id: string) => request<{ ok: boolean }>(`/groups/${id}/leave`, { method: 'POST' }),
  addGroupMember: (id: string, user_id: string) =>
    request<{ invited: boolean; invite_id: string; already_pending: boolean }>(
      `/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ user_id }) },
    ),
  respondGroupInvite: (groupId: string, inviteId: string, accept: boolean) =>
    request<{ ok: boolean; status: 'accepted' | 'declined' }>(
      `/groups/${groupId}/invites/${inviteId}/${accept ? 'accept' : 'decline'}`,
      { method: 'POST' },
    ),
  removeGroupMember: (id: string, user_id: string) =>
    request<{ ok: boolean }>(`/groups/${id}/members/${user_id}`, { method: 'DELETE' }),
  groupAddCandidates: (id: string, q = '') =>
    request<Array<{ id: string; display_name: string; avatar?: string | null }>>(
      `/groups/${id}/candidates?q=${encodeURIComponent(q)}`,
    ),
  groupPreview: (id: string) =>
    request<GroupPreview>(`/groups/${id}/preview`),
  requestJoinGroup: (id: string) =>
    request<{ requested: boolean; request_id: string; already_pending: boolean }>(
      `/groups/${id}/join-requests`, { method: 'POST' },
    ),
  respondJoinRequest: (groupId: string, requestId: string, approve: boolean) =>
    request<{ ok: boolean; status: 'approved' | 'denied' }>(
      `/groups/${groupId}/join-requests/${requestId}/${approve ? 'approve' : 'deny'}`,
      { method: 'POST' },
    ),
  groupFeed: (id: string) => request<any[]>(`/groups/${id}/feed`),
  groupLeaderboard: (id: string, season?: number) =>
    request<{
      season: number;
      entries: Array<{
        id: string;
        display_name: string;
        avatar?: string | null;
        rank: number | null;
        round_count: number;
        avg_score: number | null;
        best_score: number | null;
        last_played: string | null;
      }>;
    }>(`/groups/${id}/leaderboard${season ? `?season=${season}` : ''}`),
  groupSeasons: (id: string) => request<{ seasons: number[] }>(`/groups/${id}/seasons`),
  groupChatMessages: (id: string, before?: string) =>
    request<ChatMessage[]>(`/groups/${id}/chat${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  sendGroupChatMessage: (id: string, text: string) =>
    request<ChatMessage>(`/groups/${id}/chat`, { method: 'POST', body: JSON.stringify({ text }) }),
  markGroupChatRead: (id: string) =>
    request<{ ok: boolean }>(`/groups/${id}/chat/read`, { method: 'POST' }),

  // ---- Direct messaging ----
  startConversation: (user_id: string) =>
    request<Conversation>('/messages/conversations', { method: 'POST', body: JSON.stringify({ user_id }) }),
  listConversations: () => request<Conversation[]>('/messages/conversations'),
  unreadMessageCount: () => request<{ unread_conversations: number }>('/messages/unread-count'),
  getMessages: (conversationId: string, before?: string) =>
    request<ChatMessage[]>(
      `/messages/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  sendMessage: (conversationId: string, text: string) =>
    request<ChatMessage>(`/messages/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  markConversationRead: (conversationId: string) =>
    request<{ ok: boolean }>(`/messages/conversations/${conversationId}/read`, { method: 'POST' }),
};

export type Group = {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  admin_id: string;
  member_add_policy: 'admin' | 'any';
  member_count: number;
  max_members: number;
  created_at: string;
  is_admin: boolean;
  is_member: boolean;
  members: Array<{ id: string; display_name: string; avatar?: string | null; handicap?: number | null; home_course?: string | null }>;
};

export type GroupPreview = {
  id: string;
  name: string;
  description: string;
  member_count: number;
  max_members: number;
  is_member: boolean;
  is_admin: boolean;
  admins: Array<{ id: string; display_name: string; avatar?: string | null; home_course?: string | null }>;
  mutual_members: Array<{ id: string; display_name: string; avatar?: string | null }>;
  pending_request_id: string | null;
  created_at: string;
};

export type PublicGroup = {
  id: string;
  name: string;
  description: string;
  member_count: number;
};

export type ChatMessage = {
  id: string;
  thread_type: 'dm' | 'group';
  thread_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  sender?: { id: string; display_name: string; avatar?: string | null } | null;
};

export type Conversation = {
  id: string;
  other_user: { id: string; display_name: string; avatar?: string | null; home_course?: string | null } | null;
  last_message_text: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread: boolean;
  created_at: string;
};
