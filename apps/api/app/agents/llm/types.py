"""Shared types for the LLM client layer."""

from collections.abc import Callable
from enum import StrEnum

from langchain_core.language_models import LanguageModelInput
from langchain_core.messages import AIMessage
from langchain_core.runnables import Runnable, RunnableSerializable
from typing_extensions import TypedDict


class LLMProviderKey(StrEnum):
    """Lazy-loader registry keys. Single source of truth for the ``@lazy_provider``
    names and the lookup in ``_get_available_providers``."""

    GEMINI = "gemini_llm"
    OPENROUTER = "openrouter_llm"
    CUSTOM = "custom_llm"


# configurable_fields() returns a RunnableConfigurableFields, not a BaseChatModel,
# and only RunnableSerializable declares configurable_alternatives().
ProviderLLM = RunnableSerializable[LanguageModelInput, AIMessage]


class LLMProvider(TypedDict):
    name: str
    instance: ProviderLLM


# A fallback may be passed as a ready runnable or as a zero-arg factory, so
# expensive preparation (e.g. re-binding the full tool list) only happens in
# the rare case the primary actually fails.
LLMFallback = Runnable | Callable[[], Runnable | None] | None
