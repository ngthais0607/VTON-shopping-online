from pydantic import BaseModel


class EngineResponse(BaseModel):
    name: str
    type: str
    cloth_types: list[str]
    sends_images_off_host: bool
    is_default: bool
    loaded: bool


PNG_RESPONSE = {200: {"content": {"image/png": {}}}}
