import pandas as pd
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_qdrant import QdrantVectorStore
import os

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

df = pd.read_json("data/recipes_sample.json1", lines=True)

docs = []

for _, row in df.iterrows():
    doc = Document(
        page_content = row["chunk"],
        metadata={
            "id": int(row["id"]),
            "name" : row["name"],
            "calories": float(row["calories"]),
            "minutes": int(row["minutes"]),
            "tags": row["tags"]
        }
    )
    docs.append(doc)
print(len(docs))
print(docs[0])


embeddings = OllamaEmbeddings(model="nomic-embed-text:latest")

store = QdrantVectorStore.from_documents(
    docs,
    embedding = embeddings,
    url = QDRANT_URL,
    collection_name = "recipes",
    force_recreate = True,

)
print("stored:", store.client.count("recipes").count)


