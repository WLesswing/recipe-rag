import json
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings # type: ignore
from langchain_qdrant import QdrantVectorStore # type: ignore

docs = []
with open("data/recipes_sample.jsonl") as f:
    for line in f:
        r = json.loads(line)
        docs.append(Document(
            page_content=r["chunk"],
            metadata={
                "recipe_id": r["id"],
                "name": r["name"],
                "calories": r["calories"],
                "protein_pdv": r["protein_pdv"],
                "minutes": r["minutes"],
                "n_ingredients": r["n_ingredients"],
                "ingredients": r["ingredients"],
                "steps": r["steps"],
                "tags": r["tags"],
            },
        ))

print(f"Loaded {len(docs)} recipes")

embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url="http://localhost:11434")

QdrantVectorStore.from_documents(
    docs,
    embeddings,
    url="http://localhost:6333",
    collection_name="recipes",
    batch_size=64,
)

print("Done: recipes embedded and stored in Qdrant")