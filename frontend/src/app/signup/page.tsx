import { Suspense } from "react";
import { SignupPage } from "@/components/auth/SignupPage";

export default function Signup() {
  return (
    <Suspense fallback={null}>
      <SignupPage />
    </Suspense>
  );
}
