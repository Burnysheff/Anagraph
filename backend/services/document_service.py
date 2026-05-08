import chardet
from PyPDF2 import PdfReader
from docx import Document as DocxDocument


class DocumentService:

    @staticmethod
    def extract_text(file_path: str, filename: str) -> str:
        ext = filename.lower().rsplit(".", 1)[-1]

        if ext == "txt":
            with open(file_path, "rb") as f:
                raw = f.read()
                encoding = chardet.detect(raw)["encoding"] or "utf-8"
                return raw.decode(encoding)

        elif ext == "pdf":
            reader = PdfReader(file_path)
            return "\n".join(page.extract_text() or "" for page in reader.pages)

        elif ext in ("docx", "doc"):
            doc = DocxDocument(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

        else:
            raise ValueError(f"Unsupported file format: {ext}")
