# CatVTON GPU inference service. Build needs network; first start downloads ~10 GB of weights
# into the /models volume. Pin CATVTON_REF to a reviewed upstream commit before production.
FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

ARG CATVTON_REF=main
# HF_HOME lives on the /models volume: the non-root user has no home directory.
ENV PYTHONUNBUFFERED=1 MODELS_DIR=/models HF_HOME=/models/hf PYTHONPATH=/opt/CatVTON

RUN apt-get update && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/Zheng-Chong/CatVTON /opt/CatVTON \
    && git -C /opt/CatVTON checkout "$CATVTON_REF"

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /opt/CatVTON/requirements.txt -r /tmp/requirements.txt

WORKDIR /srv
COPY app.py .
RUN useradd --system --uid 1001 svc && mkdir -p /models && chown svc /models
USER svc
EXPOSE 8080
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
