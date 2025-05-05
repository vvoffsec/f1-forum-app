"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-f1-charcoal">
      <div className="w-full max-w-md bg-f1-card rounded-2xl p-6">
        <SignIn routing="path" path="/sign-in" />
      </div>
    </div>
  );
}