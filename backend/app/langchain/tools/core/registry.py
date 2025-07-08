from app.langchain.tools import (
    calendar_tool,
    code_exec_tool,
    document_tool,
    file_tools,
    flowchart_tool,
    goal_tool,
    google_docs_tool,
    image_tool,
    mail_tool,
    memory_tools,
    reminder_tool,
    search_tool,
    todo_tool,
    weather_tool,
    webpage_tool,
)

# Organize tools by categories for better organisation when fetching tools on client side
TOOLS_BY_CATEGORY = {
    "mail": [
        *mail_tool.tools,
    ],
    "productivity": [
        *todo_tool.tools,
        *reminder_tool.tools,
    ],
    "calendar": [
        *calendar_tool.tools,
    ],
    "goal_tracking": [
        *goal_tool.tools,
    ],
    "google_docs": [
        *google_docs_tool.tools,
    ],
    "documents": [
        document_tool.generate_document,
        file_tools.query_file,
    ],
    "search": [
        search_tool.web_search_tool,
        search_tool.deep_search_tool,
        webpage_tool.fetch_webpages,
    ],
    "memory": [
        *memory_tools.tools,
    ],
    "development": [
        code_exec_tool.execute_code,
        flowchart_tool.create_flowchart,
    ],
    "creative": [
        image_tool.generate_image,
    ],
    "weather": [
        weather_tool.get_weather,
    ],
}

# Define tools that should always be accessible to the agent directly
ALWAYS_AVAILABLE_TOOLS = [
    search_tool.web_search_tool,
    search_tool.deep_search_tool,
    webpage_tool.fetch_webpages,
    file_tools.query_file,
]

# All other tools will be accessible through vector search
# Flatten all categorized tools to maintain backward compatibility
tools = [
    tool
    for category_tools in TOOLS_BY_CATEGORY.values()
    for tool in category_tools
    if tool not in ALWAYS_AVAILABLE_TOOLS  # Avoid duplicates
]
