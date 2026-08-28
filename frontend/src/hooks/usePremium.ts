import { useAuth } from '@/src/auth-context';

/**
 * Single source of truth for "is this user a premium subscriber?".
 *
 * Right now this reads the `is_premium` flag off the authed user, which is
 * always undefined/false until the Premium subscription flow is wired to
 * the backend. Once premium is live, all ad slots and any other gated
 * features should just call this hook — nothing else needs to change.
 */
export function usePremium(): boolean {
  const { user } = useAuth();
  return !!user?.is_premium;
}
