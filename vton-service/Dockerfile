# CatVTON GPU inference service. Build needs network; first start downloads ~10 GB of weights
# into the /models volume. Pin CATVTON_REF to a reviewed upstream commit before production.
FROM pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime

# Upstream commits checked on 2026-11-10. Bump deliberately, not to a moving branch.
ARG CATVTON_REF=999bdbe81e6008a3f5749af7c1e0b0fa3d21b48e
ARG DETECTRON2_REF=247691a1c292654867deb35cabb27f18d75a1363
# HF_HOME lives on the /models volume: the non-root user has no home directory.
ENV PYTHONUNBUFFERED=1 MODELS_DIR=/models HF_HOME=/models/hf PYTHONPATH=/opt/CatVTON

RUN apt-get update && apt-get install -y --no-install-recommends \
        git libgl1 libglib2.0-0 build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/Zheng-Chong/CatVTON /opt/CatVTON \
    && git -C /opt/CatVTON checkout "$CATVTON_REF"

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /opt/CatVTON/requirements.txt -r /tmp/requirements.txt

# AutoMasker needs Detectron2 + DensePose (CatVTON INSTALL.md); neither is on PyPI.
# Built against the torch installed above (no isolation). Without nvcc in this
# runtime image the C++ ops are CPU-only; the GPU path uses torchvision's ops.
RUN git clone https://github.com/facebookresearch/detectron2 /opt/detectron2 \
    && git -C /opt/detectron2 checkout "$DETECTRON2_REF" \
    && pip install --no-cache-dir --no-build-isolation /opt/detectron2 \
    && pip install --no-cache-dir --no-build-isolation /opt/detectron2/projects/DensePose \
    && rm -rf /opt/detectron2
# Upstream pins torch 2.1.2, which is built against NumPy 1.x; the unpinned deps
# above pull NumPy 2 and torch then cannot convert arrays to tensors.
RUN pip install --no-cache-dir "numpy<2"

WORKDIR /srv
COPY app.py .
RUN useradd --system --uid 1001 svc && mkdir -p /models && chown svc /models
USER svc
# DensePose writes temporary files to the working directory; /srv is read-only for svc.
WORKDIR /tmp
EXPOSE 8080
CMD ["uvicorn", "app:app", "--app-dir", "/srv", "--host", "0.0.0.0", "--port", "8080"]
