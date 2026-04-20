FROM python:3.11-slim

# Install GCC for compiling C code
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy execution script
COPY execute.py /app/execute.py

# Ensure execution script is executable
RUN chmod +x /app/execute.py

# Entrypoint will be the execution script
ENTRYPOINT ["python", "/app/execute.py"]
