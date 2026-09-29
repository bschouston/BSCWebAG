import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyTeamsAnnouncedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function isCronAuthorized(request: NextRequest) {
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret && (cronSecretHeader === cronSecret || bearerToken === cronSecret));
}

/**
 * One-shot Mailjet smoke test against production env.
 * POST /api/cron/mail-test  { "to": "you@example.com" }
 * Header: x-cron-secret: <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { to?: string };
    const to = body.to?.trim();
    if (!to) {
      return NextResponse.json({ error: "Missing to" }, { status: 400 });
    }

    const result = await sendWeeklyTeamsAnnouncedEmail({
      to,
      name: "Production Mail Test",
      eventTitle: "Mailjet Production Smoke Test",
      eventId: "mailjet-prod-smoke",
      startLabel: "Test send — ignore",
      yourTeam: "Team Gold",
      yourTeamColor: "#c9a227",
      roster: [
        {
          name: "Team Gold",
          color: "#c9a227",
          members: ["Production Mail Test", "Mailjet Check"],
        },
      ],
    });

    return NextResponse.json({
      success: true,
      to,
      from: process.env.EMAIL_FROM ?? null,
      logoConfigured: Boolean(process.env.EMAIL_LOGO_URL),
      mailjetConfigured: Boolean(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET),
      result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Mail test failed";
    console.error("mail-test error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
