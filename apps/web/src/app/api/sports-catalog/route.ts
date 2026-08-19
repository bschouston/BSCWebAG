import { NextResponse } from "next/server";
import { listSkillLevels, listSports } from "@/lib/sports-catalog-admin";

export const dynamic = "force-dynamic";

/** Public catalog of active sports + skill levels (seeded on first read). */
export async function GET() {
  try {
    const [sports, skillLevels] = await Promise.all([
      listSports(true),
      listSkillLevels(true),
    ]);
    return NextResponse.json({ sports, skillLevels });
  } catch (err) {
    console.error("GET /api/sports-catalog error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
