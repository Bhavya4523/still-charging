# Still Charging

**A privacy-first recurring-charge ledger with open-weight AI where it helps and deterministic rules where transaction evidence matters.** Built for Hacktoberfest 2026, “Ghost in the Machine.”

Still Charging parses CSV and text-based PDF statements in your browser, detects recurring charges and possible price increases with deterministic code, and helps you review what to keep or plan to cancel. AI is optional and has three explicit modes: No AI, local Gemma through Ollama, or cloud Groq. The app never cancels a subscription or sends a message.

## Project structure

```text
still-charging/
├── frontend/                 React + Vite app
│   ├── src/App.jsx           Dashboard, mode selection, consent, review actions
│   ├── src/parsing.js        Browser-only CSV/PDF parsing and recurrence rules
│   └── src/styles.css        Responsive haunted-ledger UI and print styles
├── backend/                  Express AI API; no statement upload route
│   ├── src/providers/        Ollama local Gemma and Groq cloud providers
│   ├── src/routes/ai.js      Strict field allowlist, output validation, rate limit
│   └── test/                 Privacy and provider-boundary tests
├── frontend/test/            Deterministic recurrence tests
├── scripts/evaluate-matching.mjs
├── render.yaml
└── sample-recurring-statement.pdf
```

## Run the app

Requirements: Node.js 20 or newer and npm.

```powershell
cd path\to\still-charging
Copy-Item .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`. Vite serves the UI on port 3000 and forwards same-origin `/api` requests to the Express backend on port 3001. The bundled sample data works without AI credentials. The included PDF is fictional test data.

For a production-style local run:

```powershell
npm run build
npm start
```

The backend serves `frontend/dist` on `PORT` or `BACKEND_PORT` (default 3001). For a convenient local-only core analysis, use No AI mode; it makes no AI status or inference requests. Once the app assets are loaded, statement parsing and deterministic analysis do not require an internet connection. This offline behavior has not been tested in a fully disconnected browser session.

## AI modes

### No AI

This is the default. CSV/PDF parsing, recurrence detection, price comparisons, evidence, decisions, print view, and fixed cancellation guidance continue to work in the browser. The browser does not call an AI API or check provider availability in this mode.

### Local Gemma with Ollama

Ollama must be running on this computer and the model must be downloaded. The default model is `gemma4:e2b-it-q4_K_M`, configurable with `OLLAMA_MODEL`. The endpoint defaults to `http://127.0.0.1:11434`, configurable with `OLLAMA_BASE_URL`.

Install Ollama for your operating system, then run:

```powershell
ollama pull gemma4:e2b-it-q4_K_M
ollama run gemma4:e2b-it-q4_K_M
```

Leave Ollama running. In another terminal, check that the model is listed:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Then choose **Local Gemma** in the Privacy & AI panel. The app checks the configured model through the local Ollama tags endpoint. A request goes only to the app backend and that configured local Ollama endpoint. It never falls back to Groq. Local AI does not need `GROQ_API_KEY`. Small models need suitable memory and may be slower on CPU. If Ollama or the model is unavailable, the app shows a fix and the rest of the app keeps working.

The default tag is listed by the [official Ollama Gemma model tags](https://ollama.com/library/gemma4/tags). Ollama’s [`/api/chat` endpoint](https://docs.ollama.com/api/chat) accepts JSON-schema constrained output and returns the assistant content used by the app.

### Cloud Groq

Cloud mode requires internet access and a Groq API key stored only in the backend `.env`:

```dotenv
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

Restart the backend after changing `.env`, then choose **Cloud Groq**. Before every request, a confirmation shows the operation, the sanitized merchant description, and language. You must confirm each request. The selected provider never changes automatically.

### AI request boundary

The backend accepts only `mode`, `task`, one `description`, `language`, and `consent`. It rejects unknown fields, including amounts, dates, account details, statements, and transaction arrays. It strips date-like values, currency amounts, and long reference numbers from descriptions before forwarding the request. Provider output must be valid JSON matching the task’s expected fields or it is rejected. Results remain suggestions; a name suggestion never changes the original transaction descriptions or recurrence grouping. Drafts are not sent automatically and do not prove cancellation.

Merchant names can still be sensitive. The confirmation previews the fields sent for the AI operation. Provider credentials stay in backend environment variables and are not bundled into Vite assets. AI requests are rate-limited to 20 per minute per client. App decisions and name suggestions remain in tab memory and clear after refresh.

## Detection rules and limitations

- CSV rows and PDF text are parsed in the browser. The statement file is not uploaded to the backend. The app supports CSV and text-based PDFs; scanned and password-protected PDFs are unsupported.
- Merchant normalization removes common payment metadata and a small list of known aliases. Other merchants are grouped only when normalized descriptions match exactly; fuzzy matching is intentionally avoided.
- Cadence windows are weekly (5–9 days), every two weeks (12–17), monthly (25–35), quarterly (80–100), and annual (350–380). A candidate requires at least two intervals in its cadence window when that history exists; two-charge candidates are low-confidence. Three or more repeat observations are still only suspected until reviewed.
- Price rises are flagged when the latest matching amount exceeds the previous charge by more than 3%. Evidence shows the source descriptions, dates, intervals, and amounts. It does not infer missing charges.
- Annual cost is a cadence-based estimate assuming observed repeats continue. Potential savings count only items you explicitly mark **Plan to cancel**; they are not actual savings. **Cancelled by user** is a note you record; Still Charging does not cancel anything.
- AI drafts support English, Hindi, and Marathi. The interface is English. Model output can be wrong and should be reviewed.
- Cancellation instructions are fixed and source-linked. They are not AI-generated, and app or issuer labels can vary.
- The “For someone who has passed” mode changes tone and palette only; it does not create a memorial or infer anything about a person.

## Tests and reproducible synthetic evaluation

Run the automated checks:

```powershell
npm test
npm run build
```

The evaluation uses only the synthetic merchant descriptions in the script. It reports exact-label correct, incorrect, unresolved, precision, and recall for deterministic normalization. If the configured local Ollama model is available, it also runs the same cases through that model, reports the model/runtime/CPU and measured inference latency, and compares the results. Otherwise it says the AI evaluation was not run and gives the reason. It never substitutes illustrative metrics for measured results.

```powershell
npm run evaluate:matching
```

The evaluation excludes its explicitly ambiguous case from precision/recall and counts it separately. The external inference cost is zero for local inference; electricity consumption is not measured. A result is specific to the installed model, hardware, and run.

## Render deployment

`render.yaml` describes one Node web service. It can run core analysis in No AI mode and Cloud Groq if `GROQ_API_KEY` is configured. Render does not provide this app’s local Ollama instance; Local Gemma mode requires an Ollama service reachable from the backend and should be treated as unavailable on the default Render setup. Do not expose provider keys as `VITE_*` variables.

To deploy, create a Render Blueprint from this repository, set `GROQ_API_KEY` only if cloud mode is wanted, and verify `/api/health` and the live app after deployment. The project has not been deployed or verified on Render. See [Render Blueprint documentation](https://render.com/docs/blueprint-spec) and [Render free service limits](https://render.com/docs/free).

## Hackathon demo outline

1. Start with **No AI**, load the synthetic ledger, and inspect recurrence evidence and the Netflix price rise.
2. Mark one candidate **Plan to cancel** and show that potential savings is an estimate, not a completed cancellation.
3. Choose **Local Gemma**, show Ollama’s ready status, preview the merchant-only request, confirm, and review the validated name suggestion or draft.
4. If a Groq key is configured, choose **Cloud Groq** and show the per-request confirmation and exact transmitted fields. Explain that Local Gemma never silently switches to cloud.
5. Open the fixed cancellation guide and print the plain black-on-white list.
6. Switch to the gentle remembrance theme and explain that it is a palette/copy choice only.

## Suggested submission write-up

> Still Charging uses open-weight AI for the narrow tasks where language understanding helps: interpreting a merchant label and drafting a cancellation request. Recurrence and price-change decisions remain deterministic and explainable, and the original transaction evidence is preserved. People can run Gemma locally with Ollama, so merchant descriptions need not leave their machine for AI assistance. Cloud Groq is a separate opt-in mode with an explicit per-request preview. The app never receives a statement file, never sends a cancellation, and leaves every decision with the user.

## Fixed cancellation guidance sources

- [Google Pay India: manage recurring payments](https://support.google.com/pay/india/answer/10840624?hl=en-IN)
- [NPCI: UPI AutoPay lifecycle operations](https://www.npci.org.in/uploads/UPI_OC_223_Enhancement_of_UPI_Autopay_3e6a1cdb33.pdf)
- [RBI: recurring e-mandates and customer protections](https://www.rbi.org.in/commonman/Upload/English/PressRelease/PDFs/PR72151BDEC79C76948C68A6DE914991CC848.pdf)

## License

MIT. See [LICENSE](LICENSE).
