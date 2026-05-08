import re

from models.document import Chunk


class ChunkingService:

    def __init__(self, chunk_size: int = 1200, overlap: int = 150):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def split(self, text: str) -> list[Chunk]:
        sentences = self._split_sentences(text)
        chunks: list[Chunk] = []
        current_sentences: list[str] = []
        current_length = 0
        char_offset = 0

        for sentence in sentences:
            sentence_tokens = len(sentence) // 4

            if current_length + sentence_tokens > self.chunk_size and current_sentences:
                chunk_text = " ".join(current_sentences)
                chunks.append(Chunk(
                    index=len(chunks),
                    text=chunk_text,
                    start_char=char_offset,
                    end_char=char_offset + len(chunk_text),
                ))

                overlap_sentences: list[str] = []
                overlap_length = 0
                for s in reversed(current_sentences):
                    s_tokens = len(s) // 4
                    if overlap_length + s_tokens > self.overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_length += s_tokens

                char_offset += len(chunk_text) - len(" ".join(overlap_sentences))
                current_sentences = overlap_sentences
                current_length = overlap_length

            current_sentences.append(sentence)
            current_length += sentence_tokens

        if current_sentences:
            chunk_text = " ".join(current_sentences)
            chunks.append(Chunk(
                index=len(chunks),
                text=chunk_text,
                start_char=char_offset,
                end_char=char_offset + len(chunk_text),
            ))

        return chunks

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]
