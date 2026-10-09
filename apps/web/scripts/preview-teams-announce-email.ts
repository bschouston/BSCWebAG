/**
 * One-off preview of the teams-announce email layout.
 *   npx tsx --env-file=.env.local scripts/preview-teams-announce-email.ts
 */
import { sendWeeklyTeamsAnnouncedEmail } from "../src/lib/email";

async function main() {
  const to = process.argv[2]?.trim() || "msalim@gmail.com";
  const result = await sendWeeklyTeamsAnnouncedEmail({
    to,
    name: "Mohammed Salim",
    eventTitle: "Weekly Men's Soccer",
    eventId: "preview-teams-email",
    startLabel: "Mon, September 28 at 10:00 PM",
    yourTeam: "Team Red",
    yourTeamColor: "#ef4444",
    roster: [
      {
        name: "Team Red",
        color: "#ef4444",
        captainName: "Mohammed Salim",
        members: [
          "Burhanuddin Motiwala",
          "Huzeifa Dawoodbhai",
          "Mohammed Rashid",
          "Mohammed Salim",
          "Mustafa Kadibhai",
          "Mustansir Janoowalla",
          "Quresh Tyebji",
          "Taha Amijee",
        ],
      },
      {
        name: "Team Blue",
        color: "#3b82f6",
        captainName: "Yusuf Adamjee",
        members: [
          "Abdulqadir Maimoon",
          "Husain Master",
          "Hussain Marvi",
          "Murtaza Manaqibwala",
          "Mustafa Mohamedali",
          "Shabbir Gondalwala",
          "Yusuf Adamjee",
          "Yusuf Presswala",
        ],
      },
    ],
  });
  console.log("Preview sent to", to, result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
