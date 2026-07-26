"""
AI LinkedIn Post Generator — Flask Backend
--------------------------------------------
Runs as a standalone JSON API (CORS-enabled) that builds a well-structured
prompt and forwards it to the Google Gemini API to produce a ready-to-post
LinkedIn update.

The frontend (index.html) is a fully static file — open it directly by
double-clicking it, or serve it any way you like. It talks to this API at
http://127.0.0.1:5000.

Setup:
    1. pip install -r requirements.txt
    2. Copy .env.example to .env and add your GEMINI_API_KEY
    3. python app.py                 (starts the API on port 5000)
    4. Double-click index.html to open the frontend in your browser
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

# Allow the standalone index.html (opened via file:// or any static server)
# to call this API from a different origin.
CORS(app, resources={r"/generate": {"origins": "*"}})

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning(
        "GEMINI_API_KEY is not set. /generate will return a 500 error "
        "until a valid key is added to your .env file."
    )

# Allowed values — mirrored on the frontend, re-validated here for safety.
VALID_TONES = {"Professional", "Casual", "Technical", "Motivational", "Inspirational"}
VALID_POST_TYPES = {
    "Project Showcase", "Achievement", "Internship", "Certification",
    "Hackathon", "Event", "Career Update", "Portfolio",
}
VALID_LENGTHS = {"Short", "Medium", "Long"}

LENGTH_GUIDE = {
    "Short": "120-160 words, 2-3 short paragraphs",
    "Medium": "180-260 words, 3-5 short paragraphs",
    "Long": "280-400 words, 5-7 short paragraphs with more depth and storytelling",
}


# ----------------------------------------------------------------------
# Prompt construction
# ----------------------------------------------------------------------
def build_prompt(topic: str, description: str, tone: str, post_type: str, length: str) -> str:
    """Builds the structured prompt sent to the Gemini API."""
    length_instruction = LENGTH_GUIDE.get(length, LENGTH_GUIDE["Medium"])

    return f"""You are an expert LinkedIn content writer and personal branding specialist.
Generate an engaging, professional, human-like LinkedIn post based on the provided
topic, description, tone, post type, and length. Start with a compelling hook,
explain the topic clearly, include valuable insights, use short paragraphs, add
relevant emojis only where appropriate, end with a question or call-to-action,
and generate 8-12 relevant hashtags. The content should be original, engaging,
and ready to post on LinkedIn. Return only the LinkedIn post without any
additional explanation.

Topic: {topic}
Description: {description}
Tone: {tone}
Post Type: {post_type}
Target length: {length} ({length_instruction})

Formatting rules:
- No markdown headers, no asterisks used as bullet markers.
- Use line breaks between paragraphs the way real LinkedIn posts are formatted.
- Place the hashtags on their own block at the very end, separated by a blank line.
- Do not wrap the output in quotes or code blocks.
"""


# ----------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "message": "LinkedIn Post Generator API is running. Open index.html directly in your browser."
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
    if len(topic) > 200:
        return jsonify({"success": False, "error": "Topic is too long (max 200 characters)."}), 400
    if len(description) > 3000:
        return jsonify({"success": False, "error": "Description is too long (max 3000 characters)."}), 400

    prompt = build_prompt(topic, description, tone, post_type, length)

    try:
        model = genai.GenerativeModel(GEMINI_MODEL_NAME)
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.9,
                top_p=0.95,
                max_output_tokens=1024,
            ),
        )

        post_text = (getattr(response, "text", "") or "").strip()

        if not post_text:
            logger.error("Gemini returned an empty response for topic=%s", topic)
            return jsonify({
                "success": False,
                "error": "The AI did not return any content. Please try again."
            }), 502

        return jsonify({"success": True, "post": post_text})

    except Exception as exc:  # noqa: BLE001 — surface a clean message to the client
        logger.exception("Gemini generation failed")
        message = str(exc)

        if "API key not valid" in message or "API_KEY_INVALID" in message:
            friendly = "Your Gemini API key is invalid. Please check your .env file."
        elif "quota" in message.lower() or "rate" in message.lower():
            friendly = "The AI service is rate-limited or out of quota. Please try again shortly."
        else:
            friendly = "Something went wrong while generating your post. Please try again."

        return jsonify({"success": False, "error": friendly}), 502


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"success": False, "error": "Not found."}), 404


@app.errorhandler(500)
def server_error(_e):
    return jsonify({"success": False, "error": "Internal server error."}), 500


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
