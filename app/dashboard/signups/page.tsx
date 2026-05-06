import { redirect } from "next/navigation";

export default function LegacySignupsPage() {
  redirect("/dashboard/users");
}
