export type InvitationGroupCount = { group_size: number | null };

/** Count invitation groups and people using guests.group_size as the source of truth. */
export function summarizeInvitationGroups(rows: readonly InvitationGroupCount[]) {
  let invited = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.group_size) || row.group_size === null || row.group_size < 1) {
      throw new Error("Invalid invitation group size");
    }
    invited += row.group_size;
  }
  return { groups: rows.length, invited };
}
