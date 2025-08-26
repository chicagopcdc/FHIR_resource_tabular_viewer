from pydantic import BaseModel, AnyHttpUrl, Field
from typing import Optional, Literal

class AuthConfig(BaseModel):
    type: Literal["none", "bearer", "apiKey"] = "none"
    token: Optional[str] = None
    headerName: Optional[str] = None  # only for apiKey

class ServerRegistration(BaseModel):
    baseUrl: AnyHttpUrl = Field(..., description="FHIR server base URL")
    auth: AuthConfig = AuthConfig()
