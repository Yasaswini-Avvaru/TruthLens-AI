# TRUTHLENS AI

An evidence-led fact verification platform with text, screenshot and video verification, multilingual reports, voice-assisted claim submission, scam warning indicators, a government scheme assistant, and browser-local verification history. Results use retrieved evidence and are not mocked.

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+
- MongoDB locally or a MongoDB Atlas connection string (optional for the health endpoint)

## Setup

1. Copy `backend/.env.example` to `backend/.env`. Configure `SEARCH_API_KEY` (Tavily), `LLM_API_KEY` (OpenAI-compatible chat completions API), and `MONGODB_URI` for saved reports. Set `FRONTEND_ORIGIN` to the frontend origin when deploying.
2. Copy `frontend/.env.example` to `frontend/.env` if you need to change the API URL.
3. From the repository root, run `npm install`.

## Run locally

Run both applications with `npm run dev` from the repository root. The frontend runs at http://localhost:5173 and the API at http://localhost:5000. Check API health at http://localhost:5000/api/health. In development, Vite proxies `/api` requests to `VITE_API_PROXY_TARGET`, falling back to `VITE_API_BASE_URL`, so changing Vite's local port does not require a CORS update.

Run only the frontend with `npm run dev --workspace frontend`, or only the backend with `npm run dev --workspace backend`.

## Environment variables

Backend variables are documented in `backend/.env.example`: `PORT`, `MONGODB_URI`, `FRONTEND_ORIGIN`, `LLM_API_KEY`, `SEARCH_API_KEY`, `LLM_API_URL`, `LLM_MODEL`, `LANGUAGE_DETECTION_PROVIDER`, `MODEL_INPUT_LANGUAGES`, and `MODEL_RESPONSE_LANGUAGES`. Declare only languages supported by the configured model using comma-separated `tag:Name` entries; keep input and report-generation capabilities distinct. The service detects input language before evidence analysis, uses the dominant language by default, and accepts an optional response-language override. Unsupported input or response languages are reported instead of defaulting to English. Search uses Tavily; the LLM endpoint defaults to OpenAI-compatible Chat Completions. Keep all keys on the backend. If MongoDB is not connected, a completed report is temporary. The frontend uses `VITE_API_BASE_URL` from `frontend/.env.example`.

## Claim verification

The frontend submits text to `POST /api/verification/analyze` with an optional response-language override (`auto` by default). The backend detects language, extracts up to five verbatim factual claims, searches each claim, assesses returned snippets, validates verdicts and cited source IDs, and persists the report when MongoDB is connected. Results provide a per-claim evidence comparison; an overall mixed verdict is `Inconclusive`. Domain categories are only automated clues, not reliability guarantees. Evidence coverage is a heuristic, not probability. `GET /api/languages` reports configured model language capabilities. The API limits verification requests to 10 per minute per IP. Missing or unsupported language capability and provider failures return explicit errors rather than fabricated results. Image and video processing are planned phases and are not implemented yet.

The current text workflow shows the detected language(s), dominant language, original text, and report language. Language capability lists must reflect the actual configured models; for example, add `fr:French` only when the configured model supports French input or response generation. Run deterministic language service tests with `npm test`; these use mocked provider responses and do not assert live model accuracy.

## Voice Mode

Microphone input is transcribed by Sarvam Saaras v4 through the backend. The browser uploads audio to `POST /api/verification/transcribe-audio`; the backend returns the transcript, detected language code, and Sarvam language confidence. The interface asks the user to review and edit the transcript before sending it to the existing text-verification endpoint. Saaras v4 uses automatic language detection (`language_code=unknown`) and `mode=transcribe`. The synchronous API limit is 30 seconds and 10 MB by default.

 Set `VOICE_API_KEY` in `backend/.env` to your Sarvam API key. The same key is used by both Saaras STT and Bulbul TTS. `SARVAM_API_BASE_URL` defaults to `https://api.sarvam.ai`; `SARVAM_STT_MODEL` is `saaras:v4`; `SARVAM_STT_MODE` is fixed to `transcribe`; and `SARVAM_TTS_MODEL` defaults to `bulbul:v4-flash`. Never put provider keys in frontend files or commit a populated `.env` file. The example template (`backend/.env.example`) contains placeholders only.

Speech output is generated on demand from the final report explanation through the backend. Configured Bulbul v4 speakers currently cover English, Hindi, Telugu, Tamil, Kannada, Bengali, Gujarati, Marathi, and Punjabi. Other detected languages remain available as written reports; the backend rejects unsupported TTS languages without calling Sarvam. TTS requests are limited to 2,500 characters and return MP3 audio. The browser's audio player provides playback controls.

To enable voice input/output:

1. Copy `backend/.env.example` to `backend/.env` if you have not already done so.
2. Set `VOICE_API_KEY` to a Sarvam API key in `backend/.env` (never paste it into frontend files or chat).
3. Restart the backend so it loads the key. No additional npm package is required for the Sarvam HTTP APIs.
4. Allow microphone access in the browser, record a short supported audio clip, review the returned language and transcript, then press **Verify claim**. The application sends the edited text through the existing claim-analysis workflow.

If Saaras cannot identify a language, the UI reports that detection is uncertain. If Bulbul does not support the report language or an API request fails, the written report remains available and the UI reports the audio limitation. Provider results require a valid key and account access; automated tests use mocked provider responses and do not validate account entitlements.

Longer video transcription continues to use the configured video-transcription path rather than Saaras synchronous REST. Voice input, text verification, and video transcription therefore retain separate provider configuration and limits. Raw microphone audio is transient and is not saved by the app.
## Build

Run `npm run build` to build the frontend for production. Run the backend with `npm start` from the repository root.
