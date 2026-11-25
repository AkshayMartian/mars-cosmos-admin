/**
 * Makes the Ed25519 licence key pair.
 *   npm run licence:keygen -w server -- ./licence-private.pem
 * The private key file stays on the server (set LICENCE_PRIVATE_KEY_FILE in .env; *.pem is git-ignored).
 * The PUBLIC key is printed: put it in the desktop app (src/main/services/licenceKey.ts).
 */
import { existsSync, writeFileSync } from 'node:fs'
import { generateLicenceKeyPair } from '../src/lib/licence.js'

const out = process.argv[2]
if (!out) { console.error('Usage: npm run licence:keygen -w server -- <private-key-file.pem>'); process.exit(1) }
if (existsSync(out)) { console.error(`${out} already exists. Not overwriting a licence key.`); process.exit(1) }
const { privatePem, publicPem } = generateLicenceKeyPair()
writeFileSync(out, privatePem, { mode: 0o600 })
console.log(`Private key written to ${out}. Keep it off shop PCs and out of git.\n\nPublic key (for the desktop app):\n${publicPem}`)
