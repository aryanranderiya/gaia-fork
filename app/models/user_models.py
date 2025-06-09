from datetime import datetime
from typing import Optional, Dict, Any
import re

from pydantic import BaseModel, Field, field_validator


class CurrentUserModel(BaseModel):
    user_id: str = Field(..., description="Unique identifier for the user")
    name: str = Field(..., description="Name of the user")
    email: str = Field(..., description="Email address of the user")
    cached_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when the user data was cached",
    )
    picture: str = Field(
        default=None, description="URL of the user's profile picture"
    )
    is_active: bool = Field(default=True, description="Indicates if the user is active")

    class Config:
        arbitrary_types_allowed = True


class UserUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, description="New name for the user")


class UserUpdateResponse(BaseModel):
    user_id: str = Field(..., description="Unique identifier for the user")
    name: str = Field(..., description="Name of the user")
    email: str = Field(..., description="Email address of the user")
    picture: Optional[str] = Field(None, description="URL of the user's profile picture")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")


class OnboardingPreferences(BaseModel):
    country: Optional[str] = Field(None, min_length=2, max_length=2, description="ISO 3166-1 alpha-2 country code")
    profession: Optional[str] = Field(None, min_length=1, max_length=50, description="User's profession or main area of focus")
    response_style: Optional[str] = Field(None, description="Preferred communication style: brief, detailed, casual, professional")
    custom_instructions: Optional[str] = Field(None, max_length=500, description="Custom instructions for the AI assistant")
    
    @field_validator('country')
    @classmethod
    def validate_country(cls, v):
        if v is not None:
            if not re.match(r'^[A-Z]{2}$', v):
                raise ValueError('Country must be a valid ISO 3166-1 alpha-2 code (e.g., US, GB, DE)')
        return v
    
    @field_validator('profession')
    @classmethod
    def validate_profession(cls, v):
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('Profession cannot be empty')
            if len(v) > 50:
                raise ValueError('Profession must be 50 characters or less')
        return v
    
    @field_validator('response_style')
    @classmethod
    def validate_response_style(cls, v):
        if v is not None:
            valid_styles = {'brief', 'detailed', 'casual', 'professional'}
            # Allow custom response styles (anything that's not in the predefined list)
            if v not in valid_styles and len(v.strip()) == 0:
                raise ValueError('Response style cannot be empty')
        return v
    
    @field_validator('custom_instructions')
    @classmethod
    def validate_custom_instructions(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) > 500:
                raise ValueError('Custom instructions must be 500 characters or less')
        return v


class OnboardingData(BaseModel):
    completed: bool = Field(default=False, description="Whether onboarding is completed")
    completed_at: Optional[datetime] = Field(None, description="Timestamp when onboarding was completed")
    preferences: Optional[OnboardingPreferences] = Field(None, description="User's onboarding preferences")


class OnboardingRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="User's preferred name")
    country: str = Field(..., min_length=2, max_length=2, description="ISO 3166-1 alpha-2 country code")
    profession: str = Field(..., min_length=1, max_length=50, description="User's profession")
    response_style: str = Field(..., description="Preferred response style")
    instructions: Optional[str] = Field(None, max_length=500, description="Custom instructions")
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Name cannot be empty')
        if not re.match(r'^[a-zA-Z\s\-\'\.]+$', v):
            raise ValueError('Name can only contain letters, spaces, hyphens, apostrophes, and periods')
        return v
    
    @field_validator('country')
    @classmethod
    def validate_country(cls, v):
        if not re.match(r'^[A-Z]{2}$', v):
            raise ValueError('Country must be a valid ISO 3166-1 alpha-2 code (e.g., US, GB, DE)')
        return v
    
    @field_validator('profession')
    @classmethod
    def validate_profession(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Profession cannot be empty')
        return v
    
    @field_validator('response_style')
    @classmethod
    def validate_response_style(cls, v):
        valid_styles = {'brief', 'detailed', 'casual', 'professional'}
        # Allow custom response styles (anything that's not in the predefined list)
        if v not in valid_styles and len(v.strip()) == 0:
            raise ValueError('Response style cannot be empty')
        return v
    
    @field_validator('instructions')
    @classmethod
    def validate_instructions(cls, v):
        if v is not None:
            v = v.strip()
            if len(v) > 500:
                raise ValueError('Custom instructions must be 500 characters or less')
        return v


class OnboardingResponse(BaseModel):
    success: bool = Field(..., description="Whether onboarding was successful")
    message: str = Field(..., description="Response message")
    user: Optional[Dict[str, Any]] = Field(None, description="Updated user data")
