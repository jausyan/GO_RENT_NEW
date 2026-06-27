#!/usr/bin/env node
// Usage: node scripts/setup-admin.js <username> <password>
//
// Hashes the password with bcrypt (10 rounds) and prints the SQL to paste
// into the Supabase SQL Editor to create or update an admin account.

import bcrypt from 'bcryptjs'

const [,, username, password] = process.argv

if (!username || !password) {
  console.error('Usage: node scripts/setup-admin.js <username> <password>')
  console.error('Example: node scripts/setup-admin.js admin MyStr0ngPass!')
  process.exit(1)
}

const hash = await bcrypt.hash(password, 10)

console.log('\n── Paste this into the Supabase SQL Editor ─────────────────────────\n')
console.log(`INSERT INTO public.admin_users (username, password_hash)`)
console.log(`VALUES ('${username}', '${hash}')`)
console.log(`ON CONFLICT (username) DO UPDATE`)
console.log(`  SET password_hash = '${hash}', is_active = true;`)
console.log('\n─────────────────────────────────────────────────────────────────────\n')
