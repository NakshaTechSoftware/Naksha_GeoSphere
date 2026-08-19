import { Suspense } from "react";
import { SignInPage } from "@/components/auth/SignInPage";

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInPage />
    </Suspense>
  );
}
