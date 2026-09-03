import { useState } from 'react';
import { Link } from 'react-router';
import { useMe, useMarkNotificationRead, useMyActivity, useNotifications } from '@/lib/api/hooks';
import { apiErrorMessage } from '@/lib/api/errors';
import type { MemberActivityRecord } from '@/lib/api/me';
import type { Notification } from '@/lib/api/notifications';
import { formatBaseUnits } from '@/lib/susu/amounts';
import { describeEvent } from '@/lib/susu/events';
import { AddressChip, Button, Card, Notice, Page, PageHeader, Spinner } from '@/components/ui';

/**
 * What happened, to this account.
 *
 * TWO RECORDS, SHOWN SIDE BY SIDE ON PURPOSE
 * The notifications are this service's own derived messages — written by the API
 * from indexed events, and useful because they say what a thing *meant*. The feed
 * below is the decoded events themselves, from the groups this account's wallet
 * belongs to. They answer different questions, and neither is authoritative:
 * both trail the chain, and the chain is where a member checks anything that
 * matters. Neither of them is shown as a balance.
 *
 * WHY A WALLET HAS TO BE LINKED FOR THE FEED
 * Membership is by wallet, so a feed is scoped to the wallet proved against this
 * account. An account with no linked wallet is in no group and has nothing to
 * show — which is a state to explain, not an error to report, and not something
 * to paper over with a spinner that never resolves.
 */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function NotificationRow({
  notification,
  onMarkRead,
  pending,
}: {
  notification: Notification;
  onMarkRead: () => void;
  pending: boolean;
}) {
  const unread = notification.readAt === null;
  const when = formatWhen(notification.createdAt);

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className="text-sm">
          {unread ? (
            <span
              aria-label="Unread"
              className="mr-2 inline-block size-2 rounded-full bg-neutral-900 align-middle dark:bg-neutral-100"
            />
          ) : null}
          {notification.title}
        </p>
        {notification.body === null ? null : (
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            {notification.body}
          </p>
        )}
        {when === '' ? null : <p className="mt-1 text-xs text-neutral-500">{when}</p>}
      </div>
      {unread ? (
        <Button variant="ghost" pending={pending} onClick={onMarkRead}>
          Mark read
        </Button>
      ) : null}
    </li>
  );
}

function NotificationList() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notifications = useNotifications(unreadOnly);
  const markRead = useMarkNotificationRead();

  const rows = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount = notifications.data?.pages[0]?.unreadCount ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          Notifications
          {unreadCount > 0 ? (
            <span className="ml-2 rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900">
              {unreadCount} unread
            </span>
          ) : null}
        </h2>
        <Button variant="ghost" onClick={() => setUnreadOnly((value) => !value)}>
          {unreadOnly ? 'Show all' : 'Show unread only'}
        </Button>
      </div>

      {notifications.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Reading notifications…
        </p>
      ) : null}

      {notifications.isError ? (
        <div className="mt-3">
          <Notice tone="warning" title="Notifications could not be read">
            {apiErrorMessage(notifications.error)}
          </Notice>
        </div>
      ) : null}

      {notifications.isSuccess && rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          {unreadOnly ? 'Nothing unread.' : 'Nothing yet.'}
        </p>
      ) : null}

      {rows.length === 0 ? null : (
        <ul className="mt-4 space-y-4">
          {rows.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              pending={markRead.isPending && markRead.variables?.id === notification.id}
              onMarkRead={() => markRead.mutate({ id: notification.id })}
            />
          ))}
        </ul>
      )}

      {notifications.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            pending={notifications.isFetchingNextPage}
            onClick={() => void notifications.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/**
 * One decoded event.
 *
 * Every row links to the transaction it came from, because the event is a
 * summary of an artifact and the artifact is the thing anyone can check. A row
 * whose payload could not be read still renders: a missing amount or address is
 * a decoder mismatch, and hiding the row would make the record incomplete.
 */
function ActivityRow({ record }: { record: MemberActivityRecord }) {
  const event = describeEvent(record.name, record.payload);

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
      <span className="flex flex-wrap items-baseline gap-2">
        <span>{event.title}</span>
        {event.address === undefined ? null : <AddressChip value={event.address} />}
        {event.detail === undefined ? null : (
          <span className="text-xs text-neutral-500">{event.detail}</span>
        )}
      </span>
      <span className="flex items-baseline gap-3">
        {event.amount === undefined ? null : (
          <span className="font-mono">{formatBaseUnits(event.amount)} USDC</span>
        )}
        <span className="font-mono text-xs text-neutral-500">{record.ledger}</span>
        <Link
          to={`/app/groups/${record.contractId}`}
          className="text-xs font-medium underline underline-offset-2"
        >
          group
        </Link>
        <Link
          to={`/app/transactions/${record.txHash}`}
          className="text-xs font-medium underline underline-offset-2"
        >
          tx
        </Link>
      </span>
    </li>
  );
}

function ChainActivity() {
  const account = useMe();
  const wallet = account.data?.walletAddress ?? undefined;

  // Enabled once the account is known, so an account with no wallet does not poll
  // a feed that is guaranteed to be empty.
  const feed = useMyActivity(wallet !== undefined);
  const rows = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Chain activity</h2>
        <p className="text-xs text-neutral-500">From the index, which trails the chain</p>
      </div>

      {account.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Reading your account…
        </p>
      ) : null}

      {account.isError ? (
        <div className="mt-3">
          <Notice tone="warning" title="Your account could not be read">
            {apiErrorMessage(account.error)}
          </Notice>
        </div>
      ) : null}

      {account.isSuccess && wallet === undefined ? (
        <div className="mt-3">
          <Notice tone="neutral" title="No wallet is linked to this account">
            Activity is grouped by wallet, so there is nothing to show until one is linked.{' '}
            <Link to="/app/settings" className="font-medium underline underline-offset-2">
              Link a wallet in Settings
            </Link>
            .
          </Notice>
        </div>
      ) : null}

      {wallet !== undefined && feed.isPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
          <Spinner /> Reading activity…
        </p>
      ) : null}

      {wallet !== undefined && feed.isError ? (
        <div className="mt-3">
          <Notice tone="warning" title="Activity could not be read">
            {apiErrorMessage(feed.error)}
          </Notice>
        </div>
      ) : null}

      {wallet !== undefined && feed.isSuccess && rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500">
          Nothing recorded for this wallet’s groups yet.
        </p>
      ) : null}

      {rows.length === 0 ? null : (
        <ul className="mt-4 space-y-2">
          {rows.map((record) => (
            <ActivityRow key={record.eventIdentity} record={record} />
          ))}
        </ul>
      )}

      {feed.hasNextPage ? (
        <div className="mt-4">
          <Button
            variant="secondary"
            pending={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            Show more
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export function Activity() {
  return (
    <Page>
      <PageHeader
        title="Activity"
        description="Notifications from this service, and the events the contracts emitted for the groups your wallet belongs to. Both are derived from the chain and can lag it."
      />

      <div className="mt-8 space-y-6">
        <NotificationList />
        <ChainActivity />
      </div>
    </Page>
  );
}
