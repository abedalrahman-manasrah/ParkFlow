# Email authentication verification — 2026-10-14

Normal customer, administrator and parking operator registration/sign-in uses
email and an emailed six-digit code. `AUTH_LOGIN_METHOD=email` is the default;
both development shortcuts are disabled in the running instance. Phone request,
verification and shortcut endpoints reject requests in this mode. Their existing
implementation remains available only when phone mode is explicitly configured.

## Behavior and security

- Customer registration is name -> email -> code -> profile -> optional vehicle.
  Staff welcome offers existing-account sign-in. Accounts and wallets are created
  only after verification; new registrations have role USER.
- Existing roles, memberships, wallet data and completed profiles are preserved.
  Unknown login addresses do not become new accounts after verification.
- Codes use cryptographic randomness, expire in five minutes, and are consumed
  once. Redis holds keyed hashes, not codes. Challenges remain in frontend memory,
  never in URLs or persisted form state.
- A 60-second resend cooldown, five sends/hour and ten/day per address, and the
  existing IP limits apply. Resend invalidates the previous challenge and retains
  failed-attempt accounting. Five wrong guesses lock an address for 15 minutes.
- Challenge preparation, replacement, readiness, consumption and budget/lock
  changes use atomic Redis operations. Pending/failed delivery cannot authenticate.
  Failed-provider cleanup cannot remove a later challenge; send budgets remain.
- Existing legacy contact emails require a reviewed ownership/linking process.
  A matching email cannot transfer roles or merge accounts.
- Email-verified users can complete profiles and update name/national ID without
  a phone. Identity values remain encrypted and only masked values are returned.
  Direct replacement/removal of a verified primary login email is rejected.
- Frontend verification rejects abandoned responses before persistence and checks
  again after an asynchronous secure write. Auth writes are serialized and newer
  sign-in/logout epochs invalidate older commits. Canceled writes are restored
  before a later auth write. Challenge cleanup survives OTP wrapper unmount.

## Verification performed

| Check | Result |
| --- | --- |
| Full frontend suite | 99 passed, 0 failed |
| All five frontend/shared TypeScript workspaces | Passed |
| Full server suite on dedicated test DB and Redis DB 15 | 356 passed in 28 files |
| Server TypeScript and Docker backend/worker builds | Passed |
| Customer export | Web, Android and iOS succeeded |
| Management export | Web succeeded |
| Independent security review | No unresolved Critical/Important findings |

RED cases were observed for normal email configuration, email OTP screens,
registration/profile behavior, send/guess/readiness limits, and slow secure
persistence before implementing the fixes. The reviewer independently reproduced
the secure-persistence race and verified that the final implementation preserves
the newer account.

The running backend reports `loginMethod=email` with both bypass flags false.
Live valid requests to all three phone auth endpoints return 403
`AUTH_METHOD_DISABLED`; the email shortcut returns 403 `DEV_LOGIN_DISABLED`.
The common backend reports ready. Browser checks covered customer name/email
registration, customer sign-in, Arabic staff sign-in, and a failed delivery staying
on the email page without an authenticated session.

## Delivery dependency

The local `SMTP_PASSWORD` is not configured. SMTP failure therefore returns an
error and no session. Public inbox delivery and a complete live OTP sign-in were
not claimed or tested. Test suites intercept delivery, so they do not send email.
See [EMAIL_OTP.md](../../EMAIL_OTP.md) to configure the real sender privately.

An address such as `admin@parkflow.local` cannot receive public email. Existing
administrator identity must be linked to a real receiving address through a
reviewed ownership process, preserving the intended account. Sender configuration
does not automatically grant administrator rights to the sending mailbox.

Native exports verify bundles; physical-device installation remains a separate
check. Local provider settings, backups, logs, screenshots and secrets are ignored
by Git. No phone/SMS request was sent to an external provider during verification.
