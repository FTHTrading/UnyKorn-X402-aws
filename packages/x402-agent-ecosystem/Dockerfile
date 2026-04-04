FROM python:3.11-slim

WORKDIR /app

# Install deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/
COPY static/ ./static/
COPY registry/ ./registry/

# Keys volume — mounted at runtime, NOT baked in
VOLUME ["/app/keys"]

# Environment (override at runtime)
ENV APOSTLE_URL=http://apostle:7332
ENV PULSE_WS_URL=ws://mesh-pulse:3280/pulse/stream
ENV TWIN_PORT=8402

EXPOSE 8402

# Default: run both agent-runner and digital-twin server together
CMD ["sh", "-c", "python src/agent_runner.py & python src/digital_twin_server.py"]
