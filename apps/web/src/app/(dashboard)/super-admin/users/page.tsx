import { redirect } from "next/navigation";

export default function SuperAdminUsersRedirect() {
  redirect("/admin/members");
}
