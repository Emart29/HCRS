# Turning on real PayPal sandbox payments

CareRoute runs end to end without PayPal keys, using a clearly labelled **simulated** PayPal flow. To switch to the **real PayPal sandbox**, which judges and the demo video should show, follow these steps. It takes about 10 minutes.

## 1. Create a sandbox app
1. Sign in at https://developer.paypal.com and open **Apps & Credentials**.
2. Make sure the toggle is set to **Sandbox**.
3. Click **Create App**, name it `CareRoute`, choose type **Merchant**, and pick the default sandbox business account.
4. Copy the **Client ID** and **Secret**.

## 2. Enable the features we use
On the app's page, under **Features**, make sure these are enabled:
- **Accept payments** (Orders: authorize and capture)
- **Payouts** (to pay providers). If Payouts is off, capture still works, but the payout step returns an authorization error.

## 3. Add the keys
Put them in `.env` (local) or in the Render dashboard's environment variables (deployed):
```
PAYPAL_CLIENT_ID=your-sandbox-client-id
PAYPAL_CLIENT_SECRET=your-sandbox-secret
PAYPAL_MODE=sandbox
```
Restart the app. The header badge should now read **PayPal: Sandbox**, and the patient flow shows real PayPal buttons.

## 4. Pay as a test patient
PayPal creates a sandbox **Personal** account for you automatically. You'll find it under **Testing Tools > Sandbox Accounts**: click it, then **View/Edit account** to see its email and password. Use that login in the PayPal popup. No real money moves.

## 5. Optional: provider payout recipients
The seeded providers in `backend/app/knowledge/providers.json` have placeholder emails (`sb-...@business.example.com`). Sandbox payouts to unknown emails still succeed, with status *UNCLAIMED*. To show a payout landing in a real sandbox inbox, create a sandbox Business account under **Sandbox Accounts** and paste its email into a provider's `paypal_email`.

## 6. Optional: webhooks (needs a public URL, such as your Render deploy)
1. On the app's page, under **Webhooks**, click **Add Webhook**.
2. URL: `https://<your-app>.onrender.com/api/paypal/webhook`
3. Events: `Payment authorization created`, `Payment authorization voided`, `Payment capture completed`, `Payment capture refunded`, `Payouts batch success`, `Payouts batch denied`, and `Checkout order approved`.
4. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID`. Incoming events are then signature-verified and recorded in each case's audit log.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `PayPal authentication failed` | Wrong client ID or secret, or a live key with `PAYPAL_MODE=sandbox` |
| Payout step returns an authorization error | Enable **Payouts** on the app (step 2) |
| `ORDER_NOT_APPROVED` on authorize | The popup was closed before approving. Try again. |
| Buttons don't render | Check the browser console. An ad blocker can block `paypal.com/sdk/js`. |

## Gemini (AI) key
Get a free key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY`. The header badge changes from **AI: rules** to **AI: Gemini**. To evaluate the Gemini path:
```bash
python eval/run_eval.py --sleep 4    # pause between calls to stay under free-tier rate limits
```
If a call fails (for example, a rate limit), the agent falls back to the rules engine for that case and records it in the trace.
