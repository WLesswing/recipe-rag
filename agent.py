from phoenix.otel import register
register(project_name="recipe-rag", auto_instrument=True)

from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_ollama import ChatOllama
from tools import usda_lookup
from rag import chain, format_docs
from langchain_core.messages import SystemMessage, HumanMessage
import os 
base_url=os.getenv("OLLAMA_URL", "http://localhost:11434")


tools = [usda_lookup]
llm = ChatOllama(model="llama3.1:8b", base_url=base_url).bind_tools(tools)


def rag_step(state: MessagesState):
    question = state["messages"][-1].content
    recipe_answer = chain.invoke(question)
    return {"messages": [HumanMessage(content=
        f"Recipe answer from the database:\n{recipe_answer}\n\n"
        "Use usda_lookup to get calories per 100g for the original ingredient "
        "AND its healthier substitute, then give the final answer with both numbers.")]}

def agent(state: MessagesState):
    return {"messages": [llm.invoke(state["messages"])]}

graph = StateGraph(MessagesState)
graph.add_node("rag", rag_step)
graph.add_edge(START, "rag")
graph.add_edge("rag", "agent")
graph.add_node("agent", agent)
graph.add_node("tools", ToolNode(tools))
graph.add_conditional_edges("agent", tools_condition)
graph.add_edge("tools", "agent")
app = graph.compile()



def ask(question: str) -> str:
    result = app.invoke({"messages": [("user", question)]})
    return result["messages"][-1].content


async def ask_stream(question: str):
    async for token, meta in app.astream(
        {"messages": [("user", question)]},
        stream_mode= "messages"
    ):
        if meta["langgraph_node"] == "agent" and token.content:
            yield token.content

if __name__ == "__main__":
    print(ask(input("Ask: ")))