/**
 * Display names. A person's name lives on their sign-in account; fault
 * reports and profile rows also keep a copy of it from the time they were
 * written. When an account is renamed (for example in the Appwrite Console)
 * those copies become out of date, so data sent to the pages is given the
 * account's current name. Pure functions: no Appwrite, no Next.js.
 */

/** Current name for each account ID. An ID that is absent keeps its stored name. */
export type NameMap = ReadonlyMap<string, string>;

type NamedReport = {
  studentId: string;
  studentName: string;
  assignedToId: string | null;
  assignedTo: string | null;
};

/** The report with the reporter's and the technician's current names. */
export function withCurrentNames<T extends NamedReport>(report: T, names: NameMap): T {
  const studentName = names.get(report.studentId) || report.studentName;
  // A technician assigned by name only (no account ID) keeps the stored name.
  const assignedTo = (report.assignedToId && names.get(report.assignedToId)) || report.assignedTo;
  if (studentName === report.studentName && assignedTo === report.assignedTo) return report;
  return { ...report, studentName, assignedTo };
}

/** The profile with the account's current name. */
export function withCurrentName<T extends { id: string; name: string }>(profile: T, names: NameMap): T {
  const name = names.get(profile.id) || profile.name;
  return name === profile.name ? profile : { ...profile, name };
}
