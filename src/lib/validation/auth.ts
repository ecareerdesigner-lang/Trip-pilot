import { z } from "zod";

/**
 * Sign-in and sign-up input.
 *
 * Shared by the forms and the server actions, so the browser gets immediate
 * feedback and the server gets the copy that counts.
 */

/**
 * Password rules.
 *
 * Length, and nothing else. Composition rules — a digit, a symbol, mixed
 * case — push people toward `Password1!` and away from a long passphrase,
 * which is worse on both counts. Twelve characters of anything beats eight
 * characters of theatre.
 */
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200;

export const emailSchema = z
  .string({ message: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(3, { message: "Enter your email address." })
  .max(254, { message: "That email address is too long." })
  .email({ message: "That does not look like an email address." });

export const passwordSchema = z
  .string({ message: "Choose a password." })
  .min(MIN_PASSWORD, {
    message: `Use at least ${MIN_PASSWORD} characters. A phrase you can remember works well.`,
  })
  .max(MAX_PASSWORD, { message: "That password is too long." });

export const signInSchema = z.object({
  email: emailSchema,
  // Not length-checked on sign-in: the rules may have changed since the
  // account was made, and rejecting a valid old password would lock someone
  // out of their own trips.
  password: z.string({ message: "Enter your password." }).min(1, {
    message: "Enter your password.",
  }),
});

export const signUpSchema = z
  .object({
    name: z
      .string({ message: "What should we call you?" })
      .trim()
      .min(1, { message: "What should we call you?" })
      .max(80, { message: "That name is too long." }),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string({ message: "Type the password again." }),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "The passwords do not match.",
      });
    }

    // A password containing the email is the most guessable thing a person
    // can choose that still passes a length check.
    const local = value.email.split("@")[0] ?? "";
    if (local.length >= 4 && value.password.toLowerCase().includes(local)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Choose a password that does not contain your email address.",
      });
    }
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;

/** Obvious choices, rejected outright. Not a substitute for length. */
const OBVIOUS = new Set([
  "password1234",
  "123456789012",
  "qwertyuiopas",
  "passwordpassword",
  "letmeinletmein",
  "trippilotai12",
]);

export function isObviousPassword(password: string): boolean {
  const normalized = password.toLowerCase().replace(/\s+/g, "");
  if (OBVIOUS.has(normalized)) return true;
  // A single character repeated is long without being hard to guess.
  return /^(.)\1+$/.test(normalized);
}
