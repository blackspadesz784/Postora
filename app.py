"""
AI LinkedIn Post Generator — Flask Backend
--------------------------------------------
Runs as a standalone JSON API (CORS-enabled) that builds a well-structured
prompt and forwards it to the Google Gemini API to produce a ready-to-post
LinkedIn update.
"""

import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai

# ----------------------------------------------------------------------
# Setup & configuration
# ----------------------------------------------------------------------
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("linkedin-post-generator")

app = Flask(__name__)

# Allow the standalone index.html to call this API from any origin
CORS(app, resources={r"/generate": {"origins": "*"}})

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
FALLBACK_MODELS = ["gemini-flash-latest", "gemini-2.0-flash-lite", "gemini-2.0-flash"]

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning(
        "GEMINI_API_KEY is not set. /generate will return a 500 error "
        "until a valid key is added to your .env file."
    )

VALID_TONES = {"Professional", "Casual", "Technical", "Motivational", "Inspirational"}
VALID_POST_TYPES = {
    "Project Showcase", "Achievement", "Internship", "Certification",
    "Hackathon", "Event", "Career Update", "Portfolio",
}
VALID_LENGTHS = {"Short", "Medium", "Long"}

LENGTH_GUIDE = {
    "Short": "180-250 words (800-1200 characters), 3-4 short paragraphs",
    "Medium": "180-250 words (800-1200 characters), 3-5 short paragraphs",
    "Long": "180-250 words (800-1200 characters), 4-6 short paragraphs with storytelling",
}


# ----------------------------------------------------------------------
# Prompt construction
# ----------------------------------------------------------------------
def build_prompt(topic: str, description: str, tone: str, post_type: str, length: str) -> str:
    """Builds the structured prompt sent to the Gemini API."""
    length_instruction = LENGTH_GUIDE.get(length, LENGTH_GUIDE["Medium"])

    return f"""You are an expert LinkedIn content writer and personal branding specialist.
Generate a complete, engaging, professional, human-like LinkedIn post based on the provided topic, description, tone, post type, and length.

Target output length: 180–250 words (800–1200 characters). ({length_instruction})

Structure requirements:
1. Start with a compelling hook.
2. Explain the topic clearly with valuable insights and details.
3. Use short, readable paragraphs separated by blank line breaks.
4. Add tasteful, relevant emojis throughout the post.
5. End with an engaging question or call-to-action to spark discussion.
6. Include 8 to 12 relevant hashtags on their own line at the very end.

Topic: {topic}
Description: {description}
Tone: {tone}
Post Type: {post_type}
Target length: {length}

Formatting rules:
- Do not use markdown headers (no # or ##).
- Do not use asterisks as bullet points.
- Format with authentic LinkedIn line breaks between paragraphs.
- Do not wrap output in quotes or code blocks. Return the complete, unabridged post text directly.
"""


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "message": "LinkedIn Post Generator API is running."
    })


@app.route("/generate", methods=["POST"])
def generate():
    if not GEMINI_API_KEY:
        return jsonify({
            "success": False,
            "error": "Server is missing GEMINI_API_KEY. Add it to your .env file and restart the server."
        }), 500

    data = request.get_json(silent=True) or {}

    topic = (data.get("topic") or "").strip()
    description = (data.get("description") or "").strip()
    tone = (data.get("tone") or "").strip()
    post_type = (data.get("post_type") or "").strip()
    length = (data.get("length") or "").strip()

    # ---- Validation ----
    if not topic:
        return jsonify({"success": False, "error": "Topic is required."}), 400
    if not description:
        return jsonify({"success": False, "error": "Description is required."}), 400
    if tone not in VALID_TONES:
        return jsonify({"success": False, "error": "Invalid tone selected."}), 400
    if post_type not in VALID_POST_TYPES:
        return jsonify({"success": False, "error": "Invalid post type selected."}), 400
    if length not in VALID_LENGTHS:
        return jsonify({"success": False, "error": "Invalid length selected."}), 400

    prompt = build_prompt(topic, description, tone, post_type, length)

    models_to_try = [GEMINI_MODEL_NAME]
    for fallback in FALLBACK_MODELS:
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    last_error = None
    for model_name in models_to_try:
        try:
            logger.info("Attempting generation with model '%s'", model_name)
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.85,
                    top_p=0.95,
                    max_output_tokens=2048,
                ),
            )

            post_text = (getattr(response, "text", "") or "").strip()
            if post_text:
                return jsonify({"success": True, "post": post_text})

            logger.warning("Model '%s' returned empty output", model_name)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            logger.warning("Generation with model '%s' failed: %s", model_name, exc)
            msg = str(exc)
            if "API key not valid" in msg or "API_KEY_INVALID" in msg:
                break

    message = str(last_error) if last_error else "Empty response from Gemini models"
    logger.error("Gemini generation failed: %s", message)

    if "API key not valid" in message or "API_KEY_INVALID" in message:
        friendly = "Your Gemini API key is invalid. Please check your .env file."
    elif "quota" in message.lower() or "rate" in message.lower() or "resourceexhausted" in message.lower():
        friendly = "The AI service rate limit or quota was exceeded. Please try again shortly."
    elif "not found" in message.lower() or "no longer available" in message.lower():
        friendly = "The configured Gemini model is unavailable. Please check your GEMINI_MODEL setting in .env."
    else:
        friendly = f"Something went wrong while generating your post: {message}"

    return jsonify({"success": False, "error": friendly}), 502


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"success": False, "error": "Not found."}), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"success": False, "error": "Internal server error."}), 500


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
