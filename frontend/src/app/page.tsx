import { redirect } from "next/navigation";

export default function HomePage() {
  // Temporarily skip the welcome/landing page and go directly to the explore page.
  // The welcome page will be re-enabled in a future phase.
  redirect("/explore");
}
