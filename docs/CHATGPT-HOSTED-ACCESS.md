# Request ChatGPT plan access for the mobile app

The desktop app uses OpenAI’s documented local/open-source OAuth flow. The owner-only hosted mobile preview currently uses Claude API credits. Its built-in ChatGPT site sign-in establishes identity only; it does not authorize model requests against a ChatGPT plan.

OpenAI directs paid or remotely hosted apps to its [Sign in with ChatGPT interest form](https://openai.com/form/sign-in-with-chatgpt-interest/). See the [official plan-usage overview](https://developers.openai.com/siwc/token-sharing-open-source). Access and eligibility are determined by OpenAI; submission does not guarantee approval.

## Form preparation

- Enter your own contact name and email.
- Describe your organization accurately. If this is a personal project, say that you are an independent developer working on Queue Companion; do not invent a registered company.
- Use the public project URL: `https://github.com/W7RP/spotify-queue-companion`. The hosted preview remains owner-only and cannot serve as an unrestricted reviewer demo.
- Choose **Sign in and ChatGPT plan use for AI requests**. Identity-only access does not meet this app’s request.
- Paste or adapt the description below. Review it before submitting.

> Queue Companion is an open-source music-queue companion with a desktop version and an owner-only hosted iPhone web-app preview. We request Sign in with ChatGPT plus eligible ChatGPT plan usage for the hosted app, so users can authorize music-selection requests without supplying an API key. The intended integration uses OAuth with PKCE, explicit plan-usage consent, server-side token protection and the Responses API. Only the user’s typed music request and requested song count would be sent for inference; Spotify API data would stay outside model requests. Suggested song titles and artists would be resolved separately through Spotify’s API and appended to the active Spotify queue. The project is currently a personal preview, not a commercial service. Source: https://github.com/W7RP/spotify-queue-companion . Private preview: https://queue-companion-mobile.quirkycoati256.chatgpt.site . Please confirm hosted-app eligibility, registration requirements and approved HTTPS callback configuration.

## After submission

Retain OpenAI’s confirmation and any issued registration instructions. Do not paste client secrets, access tokens or refresh tokens into chat or commit them. Once hosted access and callback requirements are confirmed, implement a separate provider connection in Settings with explicit inference consent, model selection, encrypted credentials and disconnect/revocation. Preserve Sites authentication for page access.

Do not reuse desktop OAuth credentials or substitute the local dynamic-client registration into a hosted HTTPS callback without the applicable provider approval and configuration.
