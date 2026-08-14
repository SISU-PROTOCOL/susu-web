#!/usr/bin/env node
/**
 * Fails if the built bundle contains credential material.
 *
 * ## Why this replaced a name-based check
 *
 * The previous version of this check grepped the bundle for the *names* of the
 * variables that must never be exposed -- `VITE_SUPABASE_SERVICE_ROLE_KEY`,
 * `service_role` and similar. That was fine only while the bundle happened not
 * to mention them. `src/lib/env.ts` is the guard that refuses those credentials,
 * so it necessarily contains their names, and as soon as the Stellar client
 * became reachable from the entry point the guard's own vocabulary entered the
 * bundle. The check then failed on the guard rather than on a leak.
 *
 * So this looks for credential *material* instead. A leaked service-role key is
 * a JWT whose payload claims `service_role`; a leaked secret key is a value with
 * a known prefix; a leaked database password is a credentialed URL. None of
 * those appear in the guard, and all of them would be a real leak.
 *
 * The check is deliberately about the built output. `src/lib/env.test.ts`
 * already covers the guard's own behaviour.
 *
 * Usage: node scripts/check-bundle-credentials.mjs [directory]   (default: dist)
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Supabase secret keys and personal access tokens are values, not identifiers,
 * and are detected by prefix. Built from parts so that this file does not itself
 * contain a credential-shaped literal for a secret scanner to flag.
 */
const SECRET_VALUE_PREFIXES = ['sb' + '_' + 'secret' + '_', 'sbp' + '_'];

/** A `postgres://user:password@host` URL carries a password in the bundle. */
const CREDENTIALED_DATABASE_URL = /postgres(?:ql)?:\/\/[^\s"'`<>/]{1,64}:[^\s"'`<>@]{1,256}@/;

/** Three dot-separated base64url runs: the shape of a JWT. */
const JWT_CANDIDATE = /[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/**
 * Never print a credential back into a public build log.
 *
 * Only a leading portion is ever shown: a JWT's head is its (non-secret) header
 * and a URL's head is its scheme, whereas a tail could be part of a password.
 */
function redact(text) {
  const head = text.slice(0, 8);
  return text.length <= 8 ? `${head}…` : `${head}… (${text.length} chars)`;
}

function decodeSegment(segment) {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    const value = JSON.parse(json);
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every credential material found in `text`.
 *
 * Returns descriptions only -- never the credential itself -- so a finding can
 * be printed safely in CI.
 */
export function findCredentialMaterial(text) {
  const findings = [];

  for (const prefix of SECRET_VALUE_PREFIXES) {
    if (text.includes(prefix)) {
      findings.push(`a value with the secret-key prefix ${redact(prefix)}`);
    }
  }

  const databaseUrl = CREDENTIALED_DATABASE_URL.exec(text);
  if (databaseUrl !== null) {
    // Reported without echoing the match: this is the one finding whose text
    // contains a password.
    findings.push('a password-bearing database URL');
  }

  for (const candidate of text.matchAll(JWT_CANDIDATE)) {
    const token = candidate[0];
    // Either decoding may be the payload depending on the algorithm's header
    // length, and only a decoded JSON object tells us which this is.
    for (const segment of token.split('.').slice(0, 2)) {
      const payload = decodeSegment(segment);
      if (payload === undefined) continue;
      if (payload['role'] === 'service_role') {
        findings.push(`a service_role token (${redact(token)})`);
        break;
      }
    }
  }

  return [...new Set(findings)];
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function main() {
  const target = process.argv[2] ?? 'dist';

  try {
    const info = await stat(target);
    if (!info.isDirectory()) throw new Error('not a directory');
  } catch {
    console.log(`No ${target}/ to scan; nothing to check.`);
    return 0;
  }

  const files = await collectFiles(target);
  const problems = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    // A bundle is text; a stray binary asset is not worth decoding.
    if (content.includes('\u0000')) continue;

    for (const finding of findCredentialMaterial(content)) {
      problems.push(`${file}: ${finding}`);
    }
  }

  if (problems.length > 0) {
    console.error('::error::Credential material was found in the built bundle:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      'The frontend must only ever carry the Supabase publishable/anon key. ' +
        'Check what the build had in its environment.',
    );
    return 1;
  }

  console.log(`Scanned ${files.length} built file(s): no credential material found.`);
  return 0;
}

// Only run when invoked directly, so the pure helper above can be imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
