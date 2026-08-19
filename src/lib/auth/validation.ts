/**
 * Client-side validation for the authentication forms.
 *
 * WHAT THIS IS AND IS NOT
 * This exists to give immediate, specific feedback — the error appears next to
 * the field the user is still looking at, without a round trip. It is not a
 * security control. Nothing here is trusted, because everything here runs on a
 * machine the user controls. Supabase's project settings are the authority on
 * password policy, and it re-checks every rule regardless of what this module
 * allowed through.
 *
 * The consequence is that these rules are deliberately kept *looser* than or
 * equal to the server's. A rule that rejected something the server would accept
 * would make the server's policy unreachable and hand the user a failure they
 * cannot fix by reading our message.
 */

import { z } from 'zod';

/**
 * Supabase's floor for a password.
 *
 * Raised above the provider's own default of 6. The default is a minimum that
 * exists to stop the field being empty, not a recommendation, and 8 is the
 * point at which a password stops being trivially enumerable. The project
 * setting must be at least this, or a password accepted here would be refused
 * after submission.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The length at which bcrypt stops reading.
 *
 * Supabase hashes with bcrypt, which considers only the first 72 bytes. A
 * longer password is therefore truncated, and the characters past that point
 * are accepted but never checked — so two different long passwords can unlock
 * the same account. Refusing them is more honest than silently ignoring the
 * part the user typed carefully.
 *
 * Measured in bytes rather than characters because that is what bcrypt counts:
 * a 24-character passphrase of accented text or emoji can exceed 72 bytes.
 */
export const MAX_PASSWORD_BYTES = 72;

const encoder = new TextEncoder();

export function passwordByteLength(value: string): number {
  return encoder.encode(value).length;
}

/**
 * An email address, normalised.
 *
 * Trimmed and lowercased because both are what the user meant. A trailing space
 * from a paste, or a capitalised first letter from a phone keyboard, produces
 * an address that is valid but not the one on the account, and the resulting
 * "wrong password" is a confusing way to learn that.
 *
 * The shape check is intentionally permissive. Email addresses are far more
 * varied than the common pattern allows, and the only real test of an address
 * is whether a message sent to it arrives — which is precisely what the
 * confirmation email does. A stricter regex here would reject valid addresses
 * that Supabase would have accepted.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .toLowerCase()
  .pipe(z.string().email('That does not look like an email address.'));

/**
 * A new password, of a length bcrypt will actually read.
 *
 * Only for signup and password change. Sign-in uses `existingPasswordSchema`
 * below, and the difference matters.
 */
export const newPasswordSchema = z
  .string()
  .min(1, 'Enter a password.')
  .refine(
    (value) => value.length >= MIN_PASSWORD_LENGTH,
    `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  )
  .refine(
    (value) => passwordByteLength(value) <= MAX_PASSWORD_BYTES,
    `Use at most ${MAX_PASSWORD_BYTES} bytes. Some characters use more than one, ` +
      `and anything beyond that would be ignored when your password is checked.`,
  );

/**
 * A password being submitted to sign in.
 *
 * Deliberately checks only that it is non-empty. Applying the signup rules here
 * would be a quiet bug with two consequences: an account whose password predates
 * a policy change, or was set through a flow that allowed a shorter one, could
 * never sign in again — locked out by their own client. It would also leak the
 * policy to anyone who typed a short password, before any credential was
 * checked.
 */
export const existingPasswordSchema = z.string().min(1, 'Enter your password.');

export const signInSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
});

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

/** Field-level messages, keyed by field name. */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Runs a schema and returns either the parsed values or per-field messages.
 *
 * Returns a result rather than throwing so a form can render errors beside the
 * fields without a try/catch around validation, and so a validated value can
 * never be used without the caller having handled the failure case.
 *
 * A message attached to the form rather than a field (a mismatch between two
 * fields, for instance) is reported under `form`, since there is no single input
 * it belongs beside.
 */
export function validate<T extends z.ZodType>(
  schema: T,
  values: unknown,
):
  { ok: true; values: z.infer<T> } | { ok: false; errors: FieldErrors<z.infer<T>>; form?: string } {
  const result = schema.safeParse(values);

  if (result.success) {
    return { ok: true, values: result.data };
  }

  const errors: Record<string, string> = {};
  let form: string | undefined;

  for (const issue of result.error.issues) {
    const key = issue.path[0];

    if (typeof key === 'string') {
      // First message wins: a field with several failures should show the one
      // the user can act on, not a list they have to read past.
      errors[key] ??= issue.message;
    } else {
      form ??= issue.message;
    }
  }

  // `form` is included only when it has a value. Assigning `undefined` to an
  // optional property is not the same as leaving it out under
  // `exactOptionalPropertyTypes`, and the difference is real here: a caller
  // checking `'form' in result` should not see a key that carries nothing.
  return form === undefined
    ? { ok: false, errors: errors as FieldErrors<z.infer<T>> }
    : { ok: false, errors: errors as FieldErrors<z.infer<T>>, form };
}
