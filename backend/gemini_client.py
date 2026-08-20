import os
from dotenv import load_dotenv

load_dotenv()

from google import genai

client = genai.Client(
    vertexai=True,
    project="studypilot-500616",
    location="us-central1",
)

MODEL_NAME = "gemini-2.5-flash"  # or gemini-2.5-pro if you need the bigger model


def generate(prompt: str) -> str:
    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
    )
    return response.text
