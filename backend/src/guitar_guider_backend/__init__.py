import logging
import os


def main() -> None:
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "guitar_guider_backend.api:app",
        host=os.environ.get("GG_HOST", "127.0.0.1"),
        port=int(os.environ.get("GG_PORT", "8000")),
        reload=os.environ.get("GG_RELOAD") == "1",
    )
