import { redirect } from "next/navigation";

export default async function SuperAdminUserDetailRedirect({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  redirect(`/admin/members/${uid}`);
}
