# Project Presser sign-in UX pilot (2026-10-25)

Status: DRAFT, not merged, not deployed, no Supabase account changes.

## Context

Existing PR #7 replaces the email-OTP switcher with email + password but leaves a technical-looking "Temporary password" field, no show-password button, and no recovery route. This branch builds on PR #7. Preserve existing Supabase auth, profiles, RLS, and saved leads.

## What changes

- One simple, phone-friendly sign-in screen: email, password, Show/Hide, clear error text, sign-in button.
- Remember the email only, never the password.
- Add "Forgot your password?" with non-enumerating confirmation and a real Supabase password-reset request.
- Support a browser-opened email recovery link, including token-hash/manual-confirm and code-exchange flows; require a human click before consuming a token in those flows.
- New-password/confirmation form with explicit success and errors.
- Keep demo link visible without allowing it to modify private data.

## Deployment requirements (not performed)

1. Restore the inactive Supabase project and verify the real authenticated users and owner-scope permissions. Do not reactivate it automatically.
2. Deploy an isolated preview of this stacked branch using an authenticated Vercel environment. Do not change live/production.
3. Supabase Authentication URL Configuration must explicitly permit the preview and eventual production `/auth/reset-password` redirect URLs. If recovery email templates contain hard-coded links, ensure they point to the approved host. Keep existing login confirmations working.
4. **Preferred for email-scanner safety:** after the route is deployed, configure the *recovery* email template with a manual-confirm link using `{{ .TokenHash }}` and `type=recovery`, analogous to the existing `/auth/confirm` screen. No template edit is authorized by this draft.
5. Verify password reset end-to-end on an actual Android phone (and Safari for Brendan if relevant), with the email opened in a different browser. Test expired and used links, incorrect password, missing profile, slow/offline connection, and keyboard access.
6. Run `npm run typecheck`, `npm test`, `npm run build` on the exact branch SHA; inspect the result, don't infer from PR #7.
7. No automatic account invitations, password resets, magic-link sends, RLS migrations, customer sharing, or production merger.

## Test criteria

- Email/password login succeeds for an approved account; unauthorized/missing profile doesn't expose the board.
- Show/Hide is keyboard operable; HTML autocomplete supports password managers.
- Password recovery doesn't reveal whether an email exists. A single user action consumes the recovery link.
- Recovery can change only the authenticated account's password; a stale session cannot bypass an invalid recovery token.
- No lead, voice, and customer tables change as part of sign-in UX.
- Demo is visibly separate and read-only.

Soul review note: The user explicitly requested friendlier sign-in. No live account security or public release authorization was inferred.
