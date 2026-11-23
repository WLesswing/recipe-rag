import os, requests
from dotenv import load_dotenv
from langchain_core.tools import tool
from rag import retriever, format_docs


load_dotenv()

@tool
def search_recipes(query: str) -> str:
    """Search the recipe database for dishes matching a description, like 'cheesy pasta dinner'."""
    docs = retriever.invoke(query)
    return format_docs(docs)

def lookup_one(food: str) -> str:
    print("query:", repr(food))
    r = requests.get(
            "https://api.nal.usda.gov/fdc/v1/foods/search",
            params={"query": food, "pageSize": 1, "api_key": os.getenv('USDA_API_KEY')}
    
        )
    if r.status_code != 200:
        return f"USDA error {r.status_code} for {food}"
    data = r.json()
    foods = data.get("foods")
    if not foods:
        return "Not Found"
    item = foods[0]
    for n in item["foodNutrients"]:
        if "Energy" in n["nutrientName"] and n.get("unitName") == 'KCAL':
            return f"{item['description']}: {n['value']} kcal per 100g"
    return "Not Found"


@tool
def usda_lookup(foods: list[str]) -> str:
    """For one or more food ingredients look up calories per 100g for a food ingredient.
    Pass every food in a single call as a list, e.g. ["sour cream", "greek yogurt"]."""

    # print(f"USDA called with: {food}")

    results = [lookup_one(f) for f in foods]
    return "\n".join(results)




 