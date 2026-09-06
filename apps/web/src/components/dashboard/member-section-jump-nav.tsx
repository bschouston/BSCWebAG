"use client";

const PILL_CLASS =
  "inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors " +
  "border-[color:color-mix(in_srgb,#1a3556_40%,transparent)] bg-[color:color-mix(in_srgb,#1a3556_12%,white)] text-[#1a3556] " +
  "hover:bg-[color:color-mix(in_srgb,#1a3556_20%,white)] " +
  "dark:border-[color:color-mix(in_srgb,#ffd700_40%,transparent)] dark:bg-[color:color-mix(in_srgb,#ffd700_14%,transparent)] dark:text-[#ffd700] " +
  "dark:hover:bg-[color:color-mix(in_srgb,#ffd700_24%,transparent)]";

export type MemberJumpNavItem = {
  id: string;
  label: string;
};

export function MemberSectionJumpNav({ items }: { items: MemberJumpNavItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav className="mb-8 flex flex-wrap gap-2" aria-label="On this page">
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`} className={PILL_CLASS}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function WeeklyEventJumpNav({
  showTeams,
  showDescription,
}: {
  showTeams: boolean;
  showDescription?: boolean;
}) {
  const items: MemberJumpNavItem[] = [
    ...(showDescription ? [{ id: "description", label: "Description" }] : []),
    ...(showTeams ? [{ id: "teams", label: "Teams" }] : []),
    { id: "rsvp", label: "RSVP" },
  ];
  return (
    <nav className="flex flex-wrap gap-2" aria-label="On this page">
      {items.map((item) => (
        <a key={item.id} href={`#${item.id}`} className={PILL_CLASS}>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
