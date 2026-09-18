/**
 * Veent HRIS — Discord time-tracking bot (standalone, run with `bun run bot`).
 *
 * Registers slash commands /in and /out. A member types the command (which is not a regular
 * chat message); the bot sends an HMAC-signed POST to the HRIS /api/v1/timesheets/log
 * endpoint, then posts a PUBLIC announcement in the channel ("✅ Elena clocked in") so everyone
 * can see who is in and out. The invoker gets a private (ephemeral) acknowledgement, and any
 * error (e.g. an unlinked Discord account) is shown only to them.
 *
 * Breaks are not punched: the shift's unpaid meal break is deducted from the derived day
 * automatically (see services/attendance/derive.ts), so there is no /break command.
 *
 * Required env (see scripts/README.md and .env.example):
 *   DISCORD_BOT_TOKEN   – bot token from the Discord developer portal
 *   HRIS_API_URL        – base URL of the HRIS, e.g. http://localhost:5173
 *   TIMELOG_API_SECRET  – shared secret, identical to the HRIS env value
 * Slash commands are registered to every guild the bot has joined (instant availability).
 */

import 'dotenv/config'
import {
	Client,
	GatewayIntentBits,
	Events,
	SlashCommandBuilder,
	MessageFlags,
	type Interaction,
	type TextChannel
} from 'discord.js'
import { signPayload } from '../src/lib/server/hmac'

const { DISCORD_BOT_TOKEN, HRIS_API_URL, TIMELOG_API_SECRET } = process.env

for (const [key, value] of Object.entries({
	DISCORD_BOT_TOKEN,
	HRIS_API_URL,
	TIMELOG_API_SECRET
})) {
	if (!value) {
		console.error(`[bot] Missing required env var: ${key}`)
		process.exit(1)
	}
}

type PunchCommand = 'in' | 'out'

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

/** Parse a typed time-of-day ("9:00", "13:30", "1:30pm", "9am") into a UTC ISO for today (PHT). */
function parseTimeToISO(input: string): string {
	const m = input
		.trim()
		.toLowerCase()
		.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
	if (!m) throw new Error(`Couldn't read the time "${input}". Try e.g. 9:00, 13:30, or 1:30pm.`)
	let hh = parseInt(m[1], 10)
	const mm = m[2] ? parseInt(m[2], 10) : 0
	if (m[3] === 'pm' && hh < 12) hh += 12
	if (m[3] === 'am' && hh === 12) hh = 0
	if (hh > 23 || mm > 59) throw new Error(`"${input}" isn't a valid time.`)
	const phtDay = new Date(Date.now() + MANILA_OFFSET_MS).toISOString().slice(0, 10)
	return new Date(
		`${phtDay}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`
	).toISOString()
}

/** Format a UTC ISO timestamp as a PHT wall-clock time, e.g. "9:00 AM". */
function formatPhtTime(iso: string): string {
	const d = new Date(new Date(iso).getTime() + MANILA_OFFSET_MS)
	let h = d.getUTCHours()
	const m = d.getUTCMinutes()
	const ap = h >= 12 ? 'PM' : 'AM'
	h = h % 12 || 12
	return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

async function sendPunch(discordId: string, command: PunchCommand, timestampIso?: string) {
	const punchType = command === 'in' ? 'IN' : 'OUT'
	const payload: Record<string, string> = { discordId, punchType }
	if (timestampIso) payload.timestamp = timestampIso
	const rawBody = JSON.stringify(payload)
	const timestamp = Math.floor(Date.now() / 1000).toString()
	const signature = signPayload(rawBody, timestamp, TIMELOG_API_SECRET as string)

	const res = await fetch(`${HRIS_API_URL}/api/v1/timesheets/log`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-hris-signature': signature,
			'x-hris-timestamp': timestamp
		},
		body: rawBody
	})
	if (!res.ok) {
		const err = (await res.json().catch(() => ({}))) as { error?: string }
		throw new Error(err.error ?? `HRIS responded ${res.status}`)
	}
	return res.json() as Promise<{
		data: {
			punchType: string
			timestamp: string
			employee: { firstName: string; lastName: string }
		}
	}>
}

/** Public announcement text from the recorded punch type, with the effective time. */
function announce(name: string, mention: string, resolved: string, at: string): string {
	switch (resolved) {
		case 'IN':
			return `🟢 **${name}** (${mention}) clocked **in** at ${at}`
		case 'OUT':
			return `🔴 **${name}** (${mention}) clocked **out** at ${at}`
		default:
			return `**${name}** (${mention}) recorded a punch at ${at}`
	}
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

const timeOption = (b: SlashCommandBuilder) =>
	b.addStringOption((o) =>
		o
			.setName('time')
			.setDescription('Optional time if you forgot, e.g. 9:00 or 1:30pm — defaults to now')
			.setRequired(false)
	)

const COMMANDS = [
	timeOption(new SlashCommandBuilder().setName('in').setDescription('Clock in')).toJSON(),
	timeOption(new SlashCommandBuilder().setName('out').setDescription('Clock out')).toJSON()
]

client.once(Events.ClientReady, async (c) => {
	console.log(`[bot] Logged in as ${c.user.tag}`)
	for (const guild of c.guilds.cache.values()) {
		await guild.commands.set(COMMANDS)
	}
	console.log(`[bot] Registered /in, /out in ${c.guilds.cache.size} guild(s)`)
})

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
	if (!interaction.isChatInputCommand()) return
	const command = interaction.commandName as PunchCommand
	if (!['in', 'out'].includes(command)) return

	await interaction.deferReply({ flags: MessageFlags.Ephemeral })

	try {
		// Optional typed time (e.g. "9:00"); defaults to now when omitted.
		const timeInput = interaction.options.getString('time')
		const timestampIso = timeInput ? parseTimeToISO(timeInput) : undefined

		const { data } = await sendPunch(interaction.user.id, command, timestampIso)
		const name = `${data.employee.firstName} ${data.employee.lastName}`
		const text = announce(
			name,
			`<@${interaction.user.id}>`,
			data.punchType,
			formatPhtTime(data.timestamp)
		)

		// Public announcement in the channel; private ack to the invoker.
		const channel = interaction.channel
		if (channel && channel.isTextBased() && 'send' in channel) {
			await (channel as TextChannel).send(text)
		}
		await interaction.editReply('✅ Recorded.')
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Something went wrong'
		await interaction.editReply(
			`⚠️ Could not record your punch: ${message}\nIf this persists, ask HR to link your Discord account.`
		)
	}
})

client.login(DISCORD_BOT_TOKEN)
