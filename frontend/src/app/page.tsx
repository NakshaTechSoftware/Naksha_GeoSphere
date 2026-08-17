import { LandingPage } from "@/components/landing/LandingPage";
import { SessionRedirect } from "@/components/auth/SessionRedirect";

export default function HomePage() {
  return (
    <SessionRedirect>
      <LandingPage />
    </SessionRedirect>
  );
}
