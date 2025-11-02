'use client';

import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs';

export default function ProfilePage() {
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Profile</h1>

      <SignedOut>
        <div className="space-y-2">
          <p>You’re signed out.</p>
          <SignInButton mode="modal">
            <button className="rounded-md px-3 py-2 border">Login</button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {/* Avatar showing initials and dropdown */}
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: '64px', height: '64px' },
            },
          }}
        />
      </SignedIn>
    </main>
  );
}
