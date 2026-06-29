import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from openai import OpenAI

from db import get_conn, init_db

load_dotenv()

app = FastAPI(debug=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "sk-EXAMPLE-hardcoded-fallback-do-not-use")
client = OpenAI(api_key=OPENAI_API_KEY)

templates = Jinja2Templates(directory="templates")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/orders/{order_id}")
def get_order(order_id: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM orders WHERE id = {order_id}")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"orders": rows}


@app.post("/orders")
async def create_order(request: Request):
    data = await request.json()
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO orders (user_id, customer, item, amount) VALUES (%s, %s, %s, %s)",
        (data.get("user_id"), data.get("customer"), data.get("item"), data.get("amount")),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"ok": True}


@app.post("/ask")
async def ask(request: Request):
    data = await request.json()
    prompt = data.get("prompt", "")
    completion = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": prompt}],
    )
    return {"answer": completion.choices[0].message.content}


@app.get("/debug")
def debug():
    return dict(os.environ)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
