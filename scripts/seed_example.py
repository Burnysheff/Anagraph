"""
Seed script: uploads a test document to the running backend.
Usage: python scripts/seed_example.py
"""
import requests
import time
import sys

API_URL = "http://localhost:8000/api"

EXAMPLE_TEXT = """
Компания Google разработала модель BERT в 2018 году. BERT использует архитектуру Transformer,
предложенную Vaswani et al. Transformer является основой большинства современных больших
языковых моделей, включая GPT-4 от OpenAI и LLaMA от Meta.

OpenAI была основана в 2015 году Сэмом Альтманом и Илоном Маском.
Google также разработала TensorFlow — фреймворк для машинного обучения.
Meta разработала PyTorch, который конкурирует с TensorFlow.
"""


def main():
    print("Uploading example document...")

    with open("/tmp/example_kg.txt", "w") as f:
        f.write(EXAMPLE_TEXT)

    with open("/tmp/example_kg.txt", "rb") as f:
        resp = requests.post(
            f"{API_URL}/documents",
            files={"file": ("example_kg.txt", f, "text/plain")},
            data={"language": "ru"},
        )

    if resp.status_code != 202:
        print(f"Error: {resp.status_code} {resp.text}")
        sys.exit(1)

    doc = resp.json()
    doc_id = doc["id"]
    print(f"Document uploaded: {doc_id}")
    print("Waiting for extraction to complete...")

    for _ in range(120):
        time.sleep(2)
        status = requests.get(f"{API_URL}/documents/{doc_id}").json()
        print(f"  Status: {status['status']}, triplets: {status.get('triplets_extracted', 0)}")
        if status["status"] in ("completed", "error"):
            break

    stats = requests.get(f"{API_URL}/graph/stats").json()
    print(f"\nGraph stats: {stats['total_nodes']} nodes, {stats['total_edges']} edges")
    print("Done!")


if __name__ == "__main__":
    main()
