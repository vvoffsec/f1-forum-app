"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

import "styles/tailwind.css";
import "styles/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary:         "#e10600",
          colorBackground:      "#2e2e2e",
          colorText:            "#ffffff",
          colorTextSecondary:   "#bbbbbb",
          colorInputBackground: "#1f1f1f",
          colorInputText:       "#eeeeee",
          fontFamily:           "Inter, sans-serif",
        },
        elements: {
          card:                 "bg-transparent shadow-none border-none",
          headerTitle:          "text-3xl font-bold drop-shadow-sm",
          formButtonPrimary:    "bg-f1-red hover:bg-opacity-90 text-white rounded-lg px-4 py-2 shadow-sm",
          formFieldInput:       "bg-f1-charcoal placeholder-f1-gray text-f1-white rounded-md px-3 py-2 shadow-sm ring-1 ring-f1-red/20",
        },
        // layout: {
        //   // disable "Development Mode" banner - REMOVE THIS BEFORE FINAL SUBMISSION
        //   unsafe_disableDevelopmentModeWarnings: true,
        // }
      }}
    >
      <html lang="en" className="h-full">
        <body className="h-full bg-f1-charcoal text-f1-white antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}