import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signInAction } from "@/app/(auth)/actions";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  // Already signed in: no reason to show a form.
  if (await getCurrentUser()) redirect("/dashboard");
  return <AuthForm mode="sign-in" action={signInAction} />;
}
