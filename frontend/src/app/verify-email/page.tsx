import { Suspense } from "react";
import { VerifyEmailPage } from "@/components/auth/VerifyEmailPage";

export default function VerifyEmail() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailPage />
    </Suspense>
  );
}
