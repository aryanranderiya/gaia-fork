from pydantic import BaseModel, EmailStr
from typing import List, Optional
from typing_extensions import TypedDict


class WaitlistItem(BaseModel):
    email: EmailStr


class FeedbackFormData(BaseModel):
    firstName: str
    lastName: str
    currentPage: int
    ageRange: str
    occupation: str
    email: EmailStr
    devices: List[str]
    operatingSystems: List[str]
    openAIUsage: int
    googleBardUsage: int
    usesDigitalAssistant: str
    digitalAssistantDetails: List[str]
    currentUsefulFeatures: str
    desiredFeatures: str
    challenges: str
    helpfulSituations: List[str]
    interactionFrequency: str
    customisationLevel: int
    mobileAppLikelihood: int
    concerns: str
    factorsToUse: str
    integrations: str
    additionalComments: str
    accountCreation: int
    calendarServiceUsage: str
    learningBehaviourComfortable: str


class MessageDict(TypedDict):
    role: str
    content: str
    # mostRecent: bool


class MessageRequestWithHistory(BaseModel):
    message: str
    conversation_id: str
    messages: List[MessageDict]
    search_web: Optional[bool] = None
    pageFetchURL: Optional[str] = None


class MessageRequest(BaseModel):
    message: str


class MessageRequestPrimary(BaseModel):
    message: str
    conversation_id: str


class DescriptionUpdateRequestLLM(BaseModel):
    userFirstMessage: str
    model: str = "@cf/meta/llama-3.2-3b-instruct"


class DescriptionUpdateRequest(BaseModel):
    description: str
