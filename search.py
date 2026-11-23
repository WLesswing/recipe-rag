from langchain_ollama import OllamaEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import models

calorie_filter = models.Filter(
    must=[
        models.FieldCondition(
            key="metadata.calories",
            range=models.Range(lte=400)
        ),
        models.FieldCondition(
            key="metadata.tags",
            match=models.MatchValue(value="vegetarian")
        )
    ]
)








embeddings = OllamaEmbeddings(model='nomic-embed-text:latest')

store = QdrantVectorStore.from_existing_collection(
    embedding=embeddings,
    url="http://localhost:6333",
    collection_name="recipes",
)
query = "healthy chicken dinner"
results = store.similarity_search_with_score(query, k = 5, filter= calorie_filter)

for doc, score in results:
    print(round(score, 3), doc.metadata["name"], doc.metadata["calories"])

