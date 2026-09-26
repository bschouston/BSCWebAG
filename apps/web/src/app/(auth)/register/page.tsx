import { redirect } from "next/navigation";

/** Auth signup is Google via /login (creates account if new). Keep /register for old links. */
export default function RegisterPage() {
  redirect("/login");
}
