from langchain_ollama import OllamaEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client.models import Filter, FieldCondition, Range

embeddings = OllamaEmbeddings(model="nomic-embed-text", base_url="http://localhost:11434")

store = QdrantVectorStore.from_existing_collection(
    embedding=embeddings,
    url="http://localhost:6333",
    collection_name="recipes",
)

query = "cozy soup for a cold night"

print("=== No filter ===")
for doc in store.similarity_search(query, k=5):
    m = doc.metadata
    print(f"{m['name']} | {m['calories']} cal | {m['minutes']} min")

print("\n=== Under 300 calories and 45 minutes ===")
f = Filter(must=[
    FieldCondition(key="metadata.calories", range=Range(lt=300)),
    FieldCondition(key="metadata.minutes", range=Range(lt=45)),
])
for doc in store.similarity_search(query, k=5, filter=f):
    m = doc.metadata
    print(f"{m['name']} | {m['calories']} cal | {m['minutes']} min")