FROM mcr.microsoft.com/playwright:v1.64.0-noble
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils python3-pypdf && rm -rf /var/lib/apt/lists/*
