import type { MemberItem } from "@/lib/queries";

export function Avatar({ member }: { member: MemberItem | undefined }) {
  if (!member) {
    return (
      <span
        title="Unassigned"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-zinc-300 text-xs text-zinc-600 dark:text-zinc-400 dark:border-zinc-700"
      >
        ?
      </span>
    );
  }
  return member.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={member.image} alt={member.name} title={member.name} className="h-6 w-6 rounded-full" />
  ) : (
    <span
      title={member.name}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium dark:bg-zinc-700"
    >
      {member.name.charAt(0).toUpperCase()}
    </span>
  );
}
