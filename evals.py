from agent import ask, app
from tools import usda_lookup
# print(usda_lookup.invoke("greek yogurt"))
cases = [
    {"question": "healthier swap for sour cream in tacos", "must_include": ["greek yogurt", "kcal"]},
    {"question": "healthier swap for whole eggs in omlette", "must_include": ["egg whites", "kcal"]},
    {"question": "healthier swap for butter in pan prepared dishes", "must_include": ["olive oil", "kcal"]},
    {"question": "healthier swap for flour", "must_include": ["whole wheat flour", "kcal"]},    
    {"question": "healthier swap for rice", "must_include": ["cauliflower rice", "kcal"]},
    {"question": "make my mac and cheese healthier", "must_include": ["kcal"]},
    {"question": "helthier swap for mayonaise in chicken salad", "must_include": ["greek yogurt", "kcal"]},
    {"question": "healthier swaps for butter and sugar in cookies", "must_include": ["butter", "sugar", "kcal"]},
    {"question": "healthier swap for gochujang in bibimbap", "must_include": ["kcal"]},
    {"question": "healthier swap for steamed broccoli", "must_include": ["already"]},
    {"question": "what's the weather in Nashville", "must_include": ["recipe"]},


]

def tool_calls_made(question: str) -> list[str]:
    result = app.invoke({"messages": [("user", question)]})
    names = []
    for m in result["messages"]:
        for call in getattr(m, "tool_calls", []):
            names.append(call["name"])
    return names


def run_case(question: str):
    result = app.invoke({"messages": [("user", question)]})
    answer = result["messages"][-1].content.lower()
    foods= []
    for m in result["messages"]:
        for call in getattr(m, "tool_calls", []):
            foods.extend(call["args"].get("foods", []))
    return answer, foods


passed = 0
for case in cases:
    answer = ask(case["question"]).lower()
    ok = all(word in answer for word in case["must_include"])
    calls = tool_calls_made(case["question"])
    used_usda = calls.count("usda_lookup") >= 2   # 
    print("PASS" if ok else "FAIL", "|", case["question"], "Total call made: ", len(calls))
    if ok and used_usda:
        passed += 1
print(f"Score: {passed}/{len(cases)}")


