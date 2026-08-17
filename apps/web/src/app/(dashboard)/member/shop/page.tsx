import { redirect } from "next/navigation";

/** Legacy stub shop retired — token purchases live on Wallet. */
export default function MemberShopRedirectPage() {
  redirect("/member/wallet");
}
