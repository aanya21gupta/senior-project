import os

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

NGROK_URL = os.environ["NGROK_URL"].rstrip("/")

app = FastAPI()


@app.post("/api/predict")
async def proxy_predict(request: Request) -> Response:
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            upstream = await client.post(
                f"{NGROK_URL}/predict",
                content=body,
                headers={"Content-Type": "application/json"},
            )
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type="application/json",
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Colab server: {exc}")


app.mount("/", StaticFiles(directory="static", html=True), name="static")
