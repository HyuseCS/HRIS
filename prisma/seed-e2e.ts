import { PrismaClient } from '@prisma/client'
import { seedE2E } from './seed-core'

// Full demo roster for the Playwright suite (and local development): the production
// baseline plus manager / employee / verifier / approver accounts and the employee's
// leave balances. Run with `pnpm db:seed:e2e` before the E2E suite.
const db = new PrismaClient()

seedE2E(db)
	.then(() => {
		console.log('E2E seed complete. Logins:')
		console.log('  CEO:         ceo@veent.ph / Ceo@1234  (Veent + JoJo + Sweetleaf)')
		console.log('  Super Admin: admin@veent.ph / Admin@1234')
		console.log('  HR Admin:    hr@veent.ph / Hr@1234')
		console.log('  Manager:     manager@veent.ph / Manager@1234')
		console.log('  Employee:    employee@veent.ph / Employee@1234')
		console.log('  Verifier:    verifier@veent.ph / Verifier@1234')
		console.log('  Approver:    approver@veent.ph / Approver@1234')
		console.log('  Two-hat:     verifier.approver@veent.ph / TwoHat@1234  (VERIFIER + APPROVER)')
		console.log('  JoJo Potato: manager@jojo.ph / Manager@1234  (Head of Operations)')
		console.log('  Sweetleaf:   manager@sweetleaf.ph / Manager@1234  (Head of Operations)')
	})
	.catch(console.error)
	.finally(() => db.$disconnect())
