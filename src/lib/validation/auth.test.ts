import { describe, it, expect } from "vitest";
import {
  isObviousPassword,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";

const VALID_SIGNUP = {
  name: "Phil",
  email: "traveler@example.com",
  password: "a long enough passphrase",
  confirmPassword: "a long enough passphrase",
};

function signUpError(overrides: Record<string, unknown>, path: string) {
  const result = signUpSchema.safeParse({ ...VALID_SIGNUP, ...overrides });
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path.join(".") === path)
    ?.message;
}

describe("signUpSchema", () => {
  it("accepts a reasonable signup", () => {
    expect(signUpSchema.safeParse(VALID_SIGNUP).success).toBe(true);
  });

  it("requires a name", () => {
    expect(signUpError({ name: "  " }, "name")).toBeDefined();
  });

  it("rejects a malformed email", () => {
    expect(signUpError({ email: "not-an-email" }, "email")).toBeDefined();
    expect(signUpError({ email: "" }, "email")).toBeDefined();
  });

  it("lowercases and trims the email", () => {
    const result = signUpSchema.safeParse({
      ...VALID_SIGNUP,
      email: "  Traveler@Example.COM  ",
    });
    expect(result.success && result.data.email).toBe("traveler@example.com");
  });

  it("requires a long enough password", () => {
    expect(
      signUpError(
        { password: "short", confirmPassword: "short" },
        "password",
      ),
    ).toMatch(/at least 12/i);
  });

  it("accepts a long passphrase with no symbols or digits", () => {
    // Composition rules push people toward Password1! — length is the thing
    // that actually matters.
    const result = signUpSchema.safeParse({
      ...VALID_SIGNUP,
      password: "correct horse battery staple",
      confirmPassword: "correct horse battery staple",
    });
    expect(result.success).toBe(true);
  });

  it("requires the confirmation to match", () => {
    expect(
      signUpError({ confirmPassword: "something else entirely" }, "confirmPassword"),
    ).toMatch(/do not match/i);
  });

  it("rejects a password containing the email", () => {
    expect(
      signUpError(
        {
          email: "traveler@example.com",
          password: "traveler traveler traveler",
          confirmPassword: "traveler traveler traveler",
        },
        "password",
      ),
    ).toMatch(/does not contain your email/i);
  });

  it("does not flag a short email local part appearing by chance", () => {
    const result = signUpSchema.safeParse({
      ...VALID_SIGNUP,
      email: "pat@example.com",
      password: "a path through the woods",
      confirmPassword: "a path through the woods",
    });
    expect(result.success).toBe(true);
  });
});

describe("signInSchema", () => {
  it("accepts an existing short password", () => {
    // The rules may have changed since the account was made; rejecting a
    // valid old password would lock someone out of their own trips.
    const result = signInSchema.safeParse({
      email: "traveler@example.com",
      password: "old",
    });
    expect(result.success).toBe(true);
  });

  it("still requires something to be typed", () => {
    expect(
      signInSchema.safeParse({ email: "traveler@example.com", password: "" })
        .success,
    ).toBe(false);
  });
});

describe("isObviousPassword", () => {
  it("rejects known bad choices", () => {
    expect(isObviousPassword("password1234")).toBe(true);
    expect(isObviousPassword("PASSWORD1234")).toBe(true);
  });

  it("rejects a single repeated character", () => {
    expect(isObviousPassword("aaaaaaaaaaaaaa")).toBe(true);
  });

  it("accepts a real passphrase", () => {
    expect(isObviousPassword("correct horse battery staple")).toBe(false);
  });
});
