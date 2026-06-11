from __future__ import annotations

import base64
import io
import json
from typing import Any

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from src.modules.builtin_tools.custom_tools.base import CustomToolProperties, build_custom_tool


class DocumentPreProcessArgs(BaseModel):
    file_data_base64: str = Field(min_length=1, description="Base64 encoded PDF file data")
    filename: str = Field(min_length=1, description="Original filename (e.g. 주민등록등본.pdf)")
    password: str | None = Field(default=None, description="PDF password (e.g. resident registration number 6 digits)")
    dpi: int = Field(default=150, ge=72, le=300, description="Image conversion resolution (DPI). 150 recommended for speed/quality balance")
    max_pages: int = Field(default=1, ge=1, le=10, description="Max pages to convert (default 1).")


def _decode_base64(data: str) -> bytes:
    # 표준 base64 및 base64url 모두 처리
    padding = 4 - len(data) % 4
    if padding != 4:
        data += "=" * padding
    try:
        return base64.urlsafe_b64decode(data)
    except Exception:
        return base64.b64decode(data)


async def _document_preprocess(
    file_data_base64: str,
    filename: str,
    password: str | None = None,
    dpi: int = 150,
    max_pages: int = 1,
) -> str:
    try:
        import pypdf
        from pdf2image import convert_from_bytes
    except ImportError as e:
        return json.dumps(
            {"ok": False, "error": {"message": f"Required library not installed: {e}. Run: pip install pypdf pdf2image"}},
            ensure_ascii=False,
        )

    # 1. base64 디코딩
    try:
        pdf_bytes = _decode_base64(file_data_base64)
    except Exception as e:
        return json.dumps({"ok": False, "error": {"message": f"base64 decode failed: {e}"}}, ensure_ascii=False)

    # 2. 암호화 감지 및 해제
    is_encrypted = False
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        if reader.is_encrypted:
            is_encrypted = True
            if not password:
                return json.dumps(
                    {
                        "ok": False,
                        "error": {
                            "message": "PDF is encrypted. Please provide a password.",
                            "encrypted": True,
                            "filename": filename,
                        },
                    },
                    ensure_ascii=False,
                )
            result = reader.decrypt(password)
            if result == pypdf.PasswordType.NOT_DECRYPTED:
                return json.dumps(
                    {
                        "ok": False,
                        "error": {
                            "message": "Incorrect password.",
                            "encrypted": True,
                            "filename": filename,
                        },
                    },
                    ensure_ascii=False,
                )
            # 복호화된 PDF를 다시 bytes로
            writer = pypdf.PdfWriter()
            for page in reader.pages:
                writer.add_page(page)
            buf = io.BytesIO()
            writer.write(buf)
            pdf_bytes = buf.getvalue()

        total_pages = len(reader.pages)
    except Exception as e:
        return json.dumps({"ok": False, "error": {"message": f"PDF read failed: {e}"}}, ensure_ascii=False)

    # 3. 페이지별 이미지 변환
    try:
        images = convert_from_bytes(pdf_bytes, dpi=dpi)
    except Exception as e:
        try:
            import fitz  # type: ignore

            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            base_scale = dpi / 72
            matrix = fitz.Matrix(base_scale, base_scale)
            pages: list[dict[str, Any]] = []
            for i in range(min(int(max_pages), int(doc.page_count))):
                page = doc.load_page(i)
                pix = page.get_pixmap(matrix=matrix)
                max_side = max(int(getattr(pix, "width", 0) or 0), int(getattr(pix, "height", 0) or 0))
                if max_side > 1024:
                    ratio = 1024 / max_side
                    scaled = max(0.1, base_scale * ratio)
                    pix = page.get_pixmap(matrix=fitz.Matrix(scaled, scaled))
                jpeg_bytes = pix.tobytes("jpeg")
                encoded = base64.b64encode(jpeg_bytes).decode("ascii")
                pages.append(
                    {
                        "page": i + 1,
                        "width": int(pix.width),
                        "height": int(pix.height),
                        "image_base64": encoded,
                        "mime_type": "image/jpeg",
                    }
                )

            return json.dumps(
                {
                    "ok": True,
                    "filename": filename,
                    "total_pages": total_pages,
                    "was_encrypted": is_encrypted,
                    "dpi": dpi,
                    "pages": pages,
                },
                ensure_ascii=False,
            )
        except ImportError:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "message": (
                            f"Image conversion failed: {e}. "
                            "If you are on Windows, pdf2image requires Poppler. "
                            "Install Poppler and ensure it's on PATH (or configure pdf2image poppler_path). "
                            "Alternatively install PyMuPDF for fallback: pip install pymupdf"
                        )
                    },
                },
                ensure_ascii=False,
            )
        except Exception as e2:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "message": (
                            f"Image conversion failed: {e}. "
                            f"PyMuPDF fallback also failed: {e2}"
                        )
                    },
                },
                ensure_ascii=False,
            )

    images = images[: min(int(max_pages), len(images))]

    pages: list[dict[str, Any]] = []
    for i, img in enumerate(images):
        max_side = max(int(getattr(img, "width", 0) or 0), int(getattr(img, "height", 0) or 0))
        if max_side > 1024:
            ratio = 1024 / max_side
            new_w = max(1, int(img.width * ratio))
            new_h = max(1, int(img.height * ratio))
            img = img.resize((new_w, new_h))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=55, optimize=True)
        encoded = base64.b64encode(buf.getvalue()).decode("ascii")
        pages.append(
            {
                "page": i + 1,
                "width": img.width,
                "height": img.height,
                "image_base64": encoded,
                "mime_type": "image/jpeg",
            }
        )

    return json.dumps(
        {
            "ok": True,
            "filename": filename,
            "total_pages": total_pages,
            "was_encrypted": is_encrypted,
            "dpi": dpi,
            "pages": pages,
        },
        ensure_ascii=False,
    )


def build_document_preprocess_tool() -> BaseTool:
    return build_custom_tool(
        CustomToolProperties(
            name="document_preprocess",
            description=(
                "Decrypt an encrypted PDF and convert each page to a JPEG image (base64). "
                "Use this before pdf_parse when the PDF is password-protected. "
                "Returns per-page image data ready for Vision LLM analysis."
            ),
            args_schema=DocumentPreProcessArgs,
            tags=["document", "pdf"],
        ),
        coroutine=_document_preprocess,
    )
