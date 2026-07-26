# Postora

A premium, dark-themed, fully responsive LinkedIn post generator. Vanilla
HTML/CSS/JS frontend, Flask backend, Google Gemini API for generation.

The frontend is a **standalone static file** — once the backend is running,
you open `index.html` by double-clicking it. No frontend server needed.

## Folder structure

```
linkedin-post-generator/
├── app.py                 # Flask API — /generate endpoint (CORS-enabled)
├── requirements.txt
├── .env.example            # copy to .env and add your API key
├── index.html               # open this directly in your browser
└── static/
    ├── css/style.css
    └── js/script.js
```

## Setup

1. Create a virtual environment (recommended):
   ```bash
   python3 -m venv venv
   source venv/bin/activate      # Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Get a free Gemini API key at https://aistudio.google.com/app/apikey,
   then create your `.env` file:
   ```bash
   cp .env.example .env
   ```
   and paste your key into `GEMINI_API_KEY`.

4. Start the backend:
   ```bash
   python app.py
   ```
   This starts the API on `https://postora-j62g.onrender.com`. Leave this terminal running.

5. Open the frontend — just **double-click `index.html`** (or right-click →
   Open with → your browser). It calls the API at `127.0.0.1:5000` automatically.

   > If you ever move the backend to a different host/port, update
   > `API_BASE_URL` at the top of `static/js/script.js` to match.

### Why this works

`app.py` no longer renders `index.html` as a template — it's a pure JSON
API with CORS enabled on `/generate`, so a page opened from `file://`
(or any other origin) is allowed to call it. `script.js` targets the API
by its full address (`https://postora-j62g.onrender.com`) instead of a relative path,
which is required once the page isn't being served by Flask itself.

If `index.html` shows a toast saying it can't reach the backend, it almost
always means step 4 (`python app.py`) isn't running yet.

## Using OpenAI instead of Gemini

The backend is isolated in `build_prompt()` / the `/generate` route in
`app.py`. To swap in the OpenAI API:

1. `pip install openai` and remove `google-generativeai` if you like.
2. Replace the `genai.configure(...)` block with an `OpenAI(api_key=...)` client.
3. In the `/generate` route, replace the `genai.GenerativeModel(...)` call with
   an OpenAI chat completion call (`client.chat.completions.create(...)`),
   passing the same `prompt` built by `build_prompt()`.
4. Return `response.choices[0].message.content` as the `post` value.

## Notes

- History is stored client-side only (`localStorage`), capped at the last 5 posts.
- Tone, post type, and length options are re-validated server-side.
- All copy/toast/typing-animation logic lives in `static/js/script.js`, fully vanilla JS, no build step.
