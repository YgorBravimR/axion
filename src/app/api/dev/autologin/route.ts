import { NextResponse, type NextRequest } from "next/server"
import { signIn } from "@/auth"

// NextAuth's signIn throws a NEXT_REDIRECT error on success; we must re-throw it
// so Next.js can perform the redirect (and set the session cookie).
const isRedirectError = (err: unknown): boolean =>
	typeof err === "object" &&
	err !== null &&
	"digest" in err &&
	typeof (err as { digest: unknown }).digest === "string" &&
	((err as { digest: string }).digest.startsWith("NEXT_REDIRECT") ||
		(err as { digest: string }).digest === "NEXT_REDIRECT")

const isDevEnabled = () =>
	process.env.NODE_ENV !== "production" && process.env.DEV_AUTOLOGIN === "true"

export async function GET(req: NextRequest) {
	if (!isDevEnabled()) {
		return new NextResponse("Not found", { status: 404 })
	}

	const email = process.env.DEV_AUTOLOGIN_EMAIL
	const password = process.env.DEV_AUTOLOGIN_PASSWORD
	if (!email || !password) {
		return new NextResponse(
			"DEV_AUTOLOGIN_EMAIL and DEV_AUTOLOGIN_PASSWORD must be set",
			{ status: 500 }
		)
	}

	const raw = req.nextUrl.searchParams.get("callbackUrl") || "/"
	const isUnsafe =
		!raw.startsWith("/") ||
		raw.startsWith("/login") ||
		raw.startsWith("/api/dev/autologin") ||
		/^\/[a-z]{2}(-[A-Z]{2})?\/login(\/|$|\?)/.test(raw)
	const callbackUrl = isUnsafe ? "/" : raw

	try {
		await signIn("credentials", {
			email,
			password,
			redirectTo: callbackUrl,
		})
	} catch (err) {
		if (isRedirectError(err)) {
			throw err
		}
		return new NextResponse(`Auto-login failed: ${String(err)}`, {
			status: 500,
		})
	}

	return NextResponse.redirect(new URL(callbackUrl, req.nextUrl.origin))
}
