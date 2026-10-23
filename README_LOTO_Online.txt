LOTO KENO ONLINE — INDIVIDUAL ACCOUNT / WALLET REQUEST BUILD

PACKAGE FILES
- LOTO_Online.html: preserved LOTO KENO interface with automatic Supabase connection, account login, unique account ID, personal wallet, deposit/withdrawal requests, admin review UI, balance transaction history, mobile layout improvements, and individual practice draws. The manual connection form is removed. The balance starts at $0.00 until an authenticated profile is loaded, and a visible PRACTICE MODE banner clarifies that draws never affect wallet funds.
- online-config.js: one-time website configuration containing the project URL and publishable/anon key. It is loaded automatically by the HTML page.
- supabase_setup.sql: Supabase schema, row-level security, zero starting balance, ledger, deposit/withdrawal request RPCs, admin review, and admin-only verified credit function.

IMPORTANT SAFETY / PRODUCTION STATUS
This is a secure-foundation prototype, not a production real-money gambling/payment system. No payment gateway is integrated. No real-money wagers are enabled. The existing KENO animation runs as PRACTICE DRAW only and does not change account balances. Do not bypass this lock in the browser.

Before accepting deposits, withdrawals, or wagers, confirm applicable laws and licensing in every jurisdiction served, age verification, KYC/AML/sanctions requirements, responsible-gambling requirements, tax/reporting obligations, privacy/security requirements, and written approval from a payment provider that supports the business category. Use a server-side payment webhook/Edge Function to verify provider events; never credit deposits solely because a player supplied a reference. Use server-authoritative game draws and wager settlement, idempotency keys, audit logs, rate limits, and fraud controls before real-money play.

SETUP
1. Create a Supabase project at https://supabase.com/dashboard.
2. Open SQL Editor and run all of supabase_setup.sql.
3. In Authentication settings, configure your site URL and redirect URLs for the GitHub Pages domain you will use.
4. The supplied project URL and publishable key are already configured in online-config.js. Upload online-config.js and LOTO_Online.html to the same GitHub Pages folder. If you rotate the publishable key later, update it in online-config.js. Never use the service_role key or a secret key in the browser.
5. Register an account and confirm the email if email confirmation is enabled.
6. In SQL Editor, promote only your trusted administrator account (replace the email):
   update public.profiles p
   set role='admin'
   from auth.users u
   where p.id=u.id and u.email='YOUR-EMAIL';
7. Sign out and sign in again. The admin payment review panel should be available in the PLAYER WALLET panel.
8. Test with separate player/admin accounts: player cannot approve requests or credit balances; deposits stay pending until verified; withdrawal requests reserve funds; rejected withdrawals refund funds; the transaction history reflects database ledger entries.
9. Test the page on desktop and mobile, including email confirmation and refresh/re-login behavior.
10. Upload LOTO_Online.html, online-config.js, and this SQL/guide as needed. Keep online-config.js in the same published folder as the HTML. Rename LOTO_Online.html to index.html if it should be the homepage, then enable GitHub Pages. The browser now connects automatically; players no longer enter URL/key.

WALLET FLOW
- Deposit: player submits amount/method/reference; the request remains pending and does not change balance until an admin independently verifies the actual receipt and approves it.
- Withdrawal: the amount is reserved immediately from the available balance; approval marks the request approved after the operator completes the payout externally. Rejection returns the reserved balance automatically.
- Manual admin credit requires an audit reason and creates a ledger record. Use only for verified receipts or documented corrections.
- Players can refresh and review the latest 30 wallet ledger entries; practice draws are excluded.
- Responsive layout and request submission controls were improved to reduce accidental repeated clicks.

LIMITATIONS
- No payment processor, bank API, KYC/age verification, or automated payout is connected.
- No production wager engine, authoritative random draw, or server-side wager settlement is included. The draw button is PRACTICE DRAW only.
- Configure and test RLS/functions with separate player and admin accounts in a non-production project before publishing.
