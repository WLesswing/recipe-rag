import pandas as pd
import ast

df = pd.read_csv("data/RAW_recipes.csv")

print(type(df.iloc[0]["ingredients"]))
list_cols = ["tags", "steps", "ingredients", "nutrition"]
for col in list_cols:
    df[col] = df[col].apply(ast.literal_eval)
print(type(df.iloc[0]["ingredients"]))
nutr_cols = ["calories", "fat_pdv", "sugar_pdv", "sodium_pdv", "protein_pdv", "sat_fat_pdv", "carbs_pdv"]
df[nutr_cols] = pd.DataFrame(df["nutrition"].tolist(), index=df.index, columns=nutr_cols)
print(df[["name", "calories", "protein_pdv"]].head())

print(len(df))
print(df.columns)
mask = ((df["calories"] > 0 )& (df["calories"] < 3000) & (df["minutes"] < 600))
print(mask.head())
df = df[mask]
print(len(df))

def build_chunk(row):
   desc = str(row["description"] or "")[:300]
   tags = ", ".join(row["tags"][:15])
   steps = " ".join(f"{i}. {s}" for i, s in enumerate(row["steps"][:8], start=1))
   chunk = "\n".join([
        f"Recipe: {row['name']}",
        f"Description: {desc}",  
        f"Ingredients: {', '.join(row['ingredients'])}", 
        f"Tags: {tags}",
        f"Steps: {steps}"])
    
   return chunk 

print(build_chunk(df.iloc[0]))

df["chunk"] = df.apply(build_chunk, axis =1)

df = df.sample(n = 3000,random_state=42)

cols = ["id", "name", "chunk", "steps", "calories", "protein_pdv", "fat_pdv",
        "sugar_pdv", "carbs_pdv", "minutes", "n_ingredients", "ingredients", "tags"]
df[cols].to_json("data/recipes_sample.json1", orient="records", lines=cols)

print(len(df))                      # should be 3000 after sampling
print(df["chunk"].iloc[0])          # one full chunk, to eyeball the format
print(df[cols].head(3))             # first 3 rows of the columns you saved
print(df["chunk"].str.len().describe())  # chunk lengths: min, max, average


