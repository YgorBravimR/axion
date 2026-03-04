import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

const DEFAULT_FROM = process.env.EMAIL_FROM ?? "Bravo Journal <noreply@bravojournal.com>"

interface SendEmailParams {
	to: string
	subject: string
	html: string
}

interface SendEmailResult {
	success: boolean
	error?: string
}

const sendEmail = async ({ to, subject, html }: SendEmailParams): Promise<SendEmailResult> => {
	const { error } = await resend.emails.send({
		from: DEFAULT_FROM,
		to,
		subject,
		html,
	})

	if (error) {
		console.error("[email] Failed to send:", error.message)
		return { success: false, error: error.message }
	}

	return { success: true }
}

export { sendEmail, type SendEmailParams, type SendEmailResult }
