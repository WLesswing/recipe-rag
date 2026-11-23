from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_qdrant import QdrantVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
import os

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")

embeddings = OllamaEmbeddings(model="nomic-embed-text")
store = QdrantVectorStore.from_existing_collection(
    embedding=embeddings,
    url= QDRANT_URL,
    collection_name="recipes",
)
retriever = store.as_retriever(search_kwards = {"k": 4})

def format_docs(docs):
    return "\n\n".join(f"{d.page_content}\nCalories: {d.metadata["calories"]}" for d in docs)

prompt = ChatPromptTemplate.from_template (
   """You are a nutrition-minded chef. Using ONLY the recipes below,
answer the question and suggest healthier ingredient substitutions. Please also
include the old calories from the context.
Recipes:
{context}
Question: {question}"""

)
llm = ChatOllama(model="llama3.1:8b", tempature=0.3)

chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough() }
    | prompt
    | llm
    | StrOutputParser()
    
)
