"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember, changeRole, removeMember } from "@/actions/members";
import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { ROLES } from "@/lib/roles";
import type { MemberItem } from "@/lib/queries";

const field =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function MembersSection({
  projectKey,
  members,
  currentUserId,
}: {
  projectKey: string;
  members: MemberItem[];
  currentUserId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function onAdd(formData: FormData) {
    startTransition(async () => {
      const res = await addMember(projectKey, formData.get("email"), formData.get("role"));
      if (res.ok) {
        toast("Member added");
        formRef.current?.reset();
      } else toast(res.error, "error");
    });
  }

  function onRole(member: MemberItem, role: string) {
    startTransition(async () => {
      const res = await changeRole(projectKey, member.id, role);
      if (res.ok) toast(`${member.name} is now ${role}`);
      else {
        toast(res.error, "error");
        // The select still shows the rejected value: re-read the real one.
        router.refresh();
      }
    });
  }

  function onRemove(member: MemberItem) {
    const self = member.id === currentUserId;
    const question = self
      ? "Remove yourself from this project? You will lose access."
      : `Remove ${member.name} from this project? Their issues become unassigned.`;
    if (!window.confirm(question)) return;
    startTransition(async () => {
      const res = await removeMember(projectKey, member.id);
      if (!res.ok) return toast(res.error, "error");
      toast(self ? "You left the project" : `${member.name} removed`);
      if (self) router.push("/projects");
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar member={m} />
                    {m.name}
                    {m.id === currentUserId && <span className="text-xs text-zinc-600 dark:text-zinc-400">(you)</span>}
                  </span>
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{m.email}</td>
                <td className="px-4 py-2">
                  <select
                    key={m.role}
                    defaultValue={m.role}
                    disabled={pending}
                    onChange={(e) => onRole(m, e.target.value)}
                    aria-label={`Role of ${m.name}`}
                    className={`${field} py-1 capitalize`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(m)}
                    disabled={pending}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form ref={formRef} action={onAdd} className="flex flex-wrap items-center gap-3">
        <input
          name="email"
          type="email"
          required
          placeholder="Email of an existing user"
          aria-label="Email"
          className={`${field} min-w-0 flex-1`}
        />
        <select name="role" defaultValue="member" aria-label="Role" className={`${field} capitalize`}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add member
        </button>
      </form>

    </div>
  );
}
