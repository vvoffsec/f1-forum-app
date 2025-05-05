"use client";

import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-f1-charcoal">
      <div className="w-full max-w-md bg-f1-card rounded-2xl p-6">
        <SignUp routing="path" path="/sign-up" />
      </div>
    </div>
  );
}