from fastapi import FastAPI
from pydantic import BaseModel
from agent import ask as ask_agent, ask_stream
from rag import chain
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class Question(BaseModel):
    question: str
@app.post("/ask")
def ask(q: Question):
    answer = ask_agent(q.question)
    return {"answer": answer}

@app.post("/stream")
async def stream(q: Question):
    async def gen():
        async for token in ask_stream(q.question):
            yield token
    return StreamingResponse(gen(), media_type="text/plain")