interface PasswordResetTemplateParams {
	code: string
	expiresInMinutes: number
}

const passwordResetTemplate = ({ code, expiresInMinutes }: PasswordResetTemplateParams): string => {
	const digits = code.split("")

	return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #13131a; border-radius: 12px; border: 1px solid #1e1e2e;">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #1e1e2e;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #c9a55a; letter-spacing: 0.5px;">
                BRAVO JOURNAL
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #e4e4e7;">
                Password Reset
              </h2>
              <p style="margin: 0 0 24px; font-size: 14px; color: #9ca3af; line-height: 1.6;">
                Use the code below to reset your password. This code expires in ${expiresInMinutes} minutes.
              </p>

              <!-- OTP Code -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 16px 0 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        ${digits.map((digit) => `
                        <td style="padding: 0 4px;">
                          <div style="width: 44px; height: 52px; background-color: #1a1a2e; border: 1px solid #2a2a3e; border-radius: 8px; text-align: center; line-height: 52px; font-size: 24px; font-weight: 700; color: #c9a55a; letter-spacing: 2px;">
                            ${digit}
                          </div>
                        </td>
                        `).join("")}
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #1e1e2e; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #4b5563;">
                Bravo Journal &mdash; Your trading companion
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim()
}

export { passwordResetTemplate }
