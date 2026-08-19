import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  emailSchema,
  newPasswordSchema,
  passwordByteLength,
  signInSchema,
  signUpSchema,
  validate,
} from './validation';

describe('emailSchema', () => {
  it('trims and lowercases, because that is what the user meant', () => {
    // A trailing space from a paste, or a capitalised first letter from a phone
    // keyboard, produces an address that is valid but is not the one on the
    // account. The resulting "wrong password" is a confusing way to find out.
    expect(emailSchema.parse('  Ada@Example.COM ')).toBe('ada@example.com');
  });

  it('rejects an empty or missing address', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
    expect(emailSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects something that is not an address', () => {
    expect(emailSchema.safeParse('ada').success).toBe(false);
    expect(emailSchema.safeParse('ada@').success).toBe(false);
    expect(emailSchema.safeParse('@example.com').success).toBe(false);
  });

  it('accepts addresses a stricter pattern would wrongly reject', () => {
    // The only real test of an address is whether mail to it arrives, which is
    // what the confirmation email does. A narrow regex here would refuse valid
    // addresses that Supabase would have accepted, and the user would have no
    // way to proceed.
    for (const address of [
      'ada+groups@example.com',
      "o'brien@example.co.uk",
      'ada_lovelace@sub.domain.example',
      'ada@example.museum',
      'A.B.C@example.com',
    ]) {
      expect(emailSchema.safeParse(address).success, address).toBe(true);
    }
  });
});

describe('newPasswordSchema', () => {
  it('requires the minimum length', () => {
    expect(newPasswordSchema.safeParse('a'.repeat(MIN_PASSWORD_LENGTH - 1)).success).toBe(false);
    expect(newPasswordSchema.safeParse('a'.repeat(MIN_PASSWORD_LENGTH)).success).toBe(true);
  });

  it('counts bytes, not characters, because bcrypt does', () => {
    // The reason this matters: a password of 40 accented characters is 40
    // characters but 80 bytes. A length check would accept it, and bcrypt would
    // then ignore everything past the 72nd byte — silently, so the user's
    // carefully chosen tail is never actually checked.
    const accented = 'é'.repeat(40);
    expect(accented.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(passwordByteLength(accented)).toBeGreaterThan(MAX_PASSWORD_BYTES);
    expect(newPasswordSchema.safeParse(accented).success).toBe(false);

    // Emoji are four bytes each, so this is 80 bytes in 20 characters.
    const emoji = '🔐'.repeat(20);
    expect(emoji.length).toBeLessThan(MAX_PASSWORD_BYTES);
    expect(newPasswordSchema.safeParse(emoji).success).toBe(false);
  });

  it('accepts exactly the byte limit', () => {
    expect(newPasswordSchema.safeParse('a'.repeat(MAX_PASSWORD_BYTES)).success).toBe(true);
  });
});

describe('signInSchema', () => {
  it('accepts a password the signup rules would refuse', () => {
    // A regression guard, and an important one. Applying the signup policy here
    // would lock out any account whose password predates a policy change, or was
    // set through a flow that allowed a shorter one — the user would be unable
    // to sign in from their own client, with no way to understand why. It would
    // also disclose the policy to anyone who typed a short password, before any
    // credential was checked.
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(newPasswordSchema.safeParse(short).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'ada@example.com', password: short }).success).toBe(
      true,
    );
  });

  it('still requires a password to be present', () => {
    expect(signInSchema.safeParse({ email: 'ada@example.com', password: '' }).success).toBe(false);
  });

  it('normalises the email before it is sent', () => {
    const parsed = signInSchema.parse({ email: ' Ada@Example.com ', password: 'x' });
    expect(parsed.email).toBe('ada@example.com');
  });
});

describe('signUpSchema', () => {
  const valid = {
    email: 'ada@example.com',
    password: 'correct horse',
    confirmPassword: 'correct horse',
  };

  it('accepts a matching pair', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('attaches a mismatch to the confirmation field, not the form', () => {
    // It belongs beside the field the user must fix. Reported at the form level
    // it would appear above the inputs, away from the one that is wrong.
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: 'different' });
    expect(result.success).toBe(false);
    if (result.success) return;

    const issue = result.error.issues.find((candidate) =>
      candidate.message.includes('do not match'),
    );
    expect(issue?.path).toEqual(['confirmPassword']);
  });
});

describe('validate', () => {
  it('returns the parsed values, not the raw input', () => {
    // The caller must send what validation produced. Sending the raw input would
    // mean the trimming and lowercasing never reached the provider, so signup
    // and signin could disagree about the same address.
    const result = validate(signInSchema, { email: ' Ada@Example.com ', password: 'x' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.email).toBe('ada@example.com');
  });

  it('keys messages by field so each one can be shown in place', () => {
    const result = validate(signUpSchema, {
      email: 'not-an-address',
      password: 'short',
      confirmPassword: 'short',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBeDefined();
    expect(result.errors.password).toBeDefined();
  });

  it('keeps only the first message per field', () => {
    // A field with several failures should show the one to act on, not a list
    // the user has to read past.
    const result = validate(signUpSchema, {
      email: 'ada@example.com',
      password: '',
      confirmPassword: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    const shown = result.errors.password;
    expect(typeof shown).toBe('string');
    expect(shown).not.toContain(';');
  });

  it('omits `form` entirely when there is no form-level issue', () => {
    // Not just falsy: the key must be absent, so a caller checking `'form' in
    // result` does not see a key carrying nothing.
    const result = validate(signInSchema, { email: 'ada@example.com', password: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('form' in result).toBe(false);
  });

  it('reports an issue that belongs to no field as a form error', () => {
    // Some rules cannot be attached to one input — the passphrase schema below
    // is the shape, even though nothing here uses it yet.
    const crossField = z
      .object({ a: z.string(), b: z.string() })
      .refine((values) => values.a !== values.b, { message: 'These must differ.' });

    const result = validate(crossField, { a: 'same', b: 'same' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.form).toBe('These must differ.');
  });
});
