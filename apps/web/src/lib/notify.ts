import "server-only";
import {
  sendWeeklyBelowMinAdminEmail,
  sendWeeklyEventMovedEmail,
  sendWeeklyEventUpdatedEmail,
  sendWeeklyOverdueDigestEmail,
  sendWeeklyRsvpEmail,
  sendWeeklyRsvpCancelledEmail,
  sendWeeklySettleEmail,
  sendWaitlistPromotedEmail,
  sendWeeklyTeamsAnnouncedEmail,
} from "@/lib/email";
import { calendarFeedPayload, ensureCalendarFeedToken } from "@/lib/calendar-feed";

/** Email now; SMS is a no-op until a provider is wired. */
export async function notifySmsStub(_opts: { to?: string | null; body: string }) {
  return;
}

export async function notifyWeeklyRsvp(
  opts: Parameters<typeof sendWeeklyRsvpEmail>[0] & { phone?: string | null; userId?: string | null }
) {
  let googleCalendarUrl = opts.googleCalendarUrl;
  let appleCalendarUrl = opts.appleCalendarUrl;
  if (opts.userId && (!googleCalendarUrl || !appleCalendarUrl)) {
    try {
      const token = await ensureCalendarFeedToken(opts.userId);
      const feed = calendarFeedPayload(token).myEvents;
      googleCalendarUrl = googleCalendarUrl || feed.googleUrl;
      appleCalendarUrl = appleCalendarUrl || feed.appleUrl;
    } catch (e) {
      console.error("calendar feed for rsvp email", e);
    }
  }
  await sendWeeklyRsvpEmail({
    ...opts,
    googleCalendarUrl,
    appleCalendarUrl,
  });
  await notifySmsStub({ to: opts.phone, body: `RSVP ${opts.status} for ${opts.eventTitle}` });
}

export async function notifyWeeklyRsvpCancelled(
  opts: Parameters<typeof sendWeeklyRsvpCancelledEmail>[0] & { phone?: string | null }
) {
  await sendWeeklyRsvpCancelledEmail(opts);
  await notifySmsStub({ to: opts.phone, body: `RSVP cancelled: ${opts.eventTitle}` });
}

export async function notifyWaitlistPromoted(opts: Parameters<typeof sendWaitlistPromotedEmail>[0] & { phone?: string | null }) {
  await sendWaitlistPromotedEmail(opts);
  await notifySmsStub({ to: opts.phone, body: `Promoted from waitlist: ${opts.eventTitle}` });
}

export async function notifyEventMoved(opts: Parameters<typeof sendWeeklyEventMovedEmail>[0] & { phone?: string | null }) {
  await sendWeeklyEventMovedEmail(opts);
  await notifySmsStub({ to: opts.phone, body: `Schedule change: ${opts.eventTitle}` });
}

export async function notifyWeeklyEventUpdated(
  opts: Parameters<typeof sendWeeklyEventUpdatedEmail>[0] & { phone?: string | null }
) {
  await sendWeeklyEventUpdatedEmail(opts);
  await notifySmsStub({ to: opts.phone, body: `Event update: ${opts.eventTitle}` });
}

export const notifyBelowMinAdmin = sendWeeklyBelowMinAdminEmail;
export const notifyWeeklyOverdueDigest = sendWeeklyOverdueDigestEmail;
export const notifyWeeklySettle = sendWeeklySettleEmail;
export const notifyWeeklyTeamsAnnounced = sendWeeklyTeamsAnnouncedEmail;
