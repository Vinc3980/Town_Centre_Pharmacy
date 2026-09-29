import { prisma } from "../config/prisma";

const ROLE_PREFIXES: Record<string, string> = {
  staff: "ST",
  branch_manager: "BM",
  admin: "AD",
};

export async function generateStaffId(role: string): Promise<string> {
  const prefix = ROLE_PREFIXES[role] ?? "ST";
  const last = await prisma.user.findFirst({
    where: { staffId: { startsWith: `${prefix}-` } },
    orderBy: { staffId: "desc" },
    select: { staffId: true },
  });
  const lastSeq = last ? parseInt(last.staffId.split("-")[1], 10) : 0;
  const seq = lastSeq + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}
