/**
 * Notifications, as this app uses them.
 *
 * A notification is this service's own derived record — "your payout was
 * confirmed", "a round is due" — written by the API from indexed chain events.
 * It is therefore neither the chain nor authoritative: it can be missed while the
 * indexer is behind, and the screens that matter read the contract or the index
 * rather than this list. What it is good for is telling someone that something
 * happened without making them hunt through a group's ledger.
 *
 * The unread count comes back with the page rather than from a second endpoint,
 * because the API includes it in the same answer.
 */
import { apiRequest, apiRequestPageBody, type ApiPage } from './client';

export type Notification = {
  readonly id: string;
  /** The API's own kind, for grouping and iconography. Not an open set to render. */
  readonly kind: string;
  readonly title: string;
  readonly body: string | null;
  /** Whatever the writer attached — usually the group and the transaction. */
  readonly data: unknown;
  /** ISO 8601, or `null` while unread. */
  readonly readAt: string | null;
  readonly createdAt: string;
};

/** A page of notifications, with how many are unread overall. */
export type NotificationPage = ApiPage<Notification> & {
  readonly unreadCount: number;
};

/**
 * Lists notifications, newest first.
 *
 * `unreadOnly` is answered by the API rather than filtered here, because a client
 * that filtered a page would be filtering the wrong set: "the unread ones" is not
 * a subset of "the first twenty of all of them".
 */
export async function listNotifications(
  query: { unreadOnly?: boolean; limit?: number; offset?: number },
  token: string,
  signal?: AbortSignal,
): Promise<NotificationPage> {
  const search = new URLSearchParams();
  if (query.unreadOnly !== undefined) search.set('unread', String(query.unreadOnly));
  if (query.limit !== undefined) search.set('limit', String(query.limit));
  if (query.offset !== undefined) search.set('offset', String(query.offset));
  const encoded = search.toString();

  const { page, body } = await apiRequestPageBody<Notification>(
    `notifications${encoded === '' ? '' : `?${encoded}`}`,
    { token, ...(signal ? { signal } : {}) },
  );

  // A missing or malformed count is reported as zero rather than as `NaN`: a badge
  // is decoration, and a badge reading "NaN" would be worse than none. The rows
  // themselves were already validated by the page reader.
  const unreadCount = typeof body.unreadCount === 'number' ? body.unreadCount : 0;

  return { ...page, unreadCount };
}

/**
 * Marks one notification read.
 *
 * Idempotent at the API, which answers `already_read` for a row that was already
 * marked. That matters because marking is done from a click and from a page view,
 * and neither can know the other happened.
 */
export async function markNotificationRead(id: string, token: string): Promise<void> {
  await apiRequest<unknown>(`notifications/${encodeURIComponent(id)}/read`, {
    method: 'POST',
    token,
  });
}
