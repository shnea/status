from pathlib import Path
import sys
from pypdf import PdfReader

target = Path(sys.argv[1])
reader = PdfReader(target)
assert len(reader.pages) >= 2, "Long content must span multiple pages"
text = "\n".join(page.extract_text() for page in reader.pages)
for expected in ["포트폴리오 메인 타이틀", "한글이 포함된 자기소개", "자기소개 마지막 문단", "프로젝트 마지막 문단", "히스토리 마지막 문단"]:
    assert "".join(expected.split()) in "".join(text.split()), f"Missing Korean content: {expected}"
links = []
for page in reader.pages:
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    assert abs(width - 595.28) < 2 and abs(height - 841.89) < 2, "Expected A4 page size"
    for annotation in page.get("/Annots", []):
        action = annotation.get_object().get("/A")
        if action and action.get("/URI"):
            links.append(str(action["/URI"]))
assert any("/@pdf-writer/projects/" in link for link in links), "Public project link must remain clickable"
assert not any("/api/pdf/render/" in link for link in links), "Temporary rendering links must not escape into PDF"
assert b"Z" * 43 not in target.read_bytes()
print(f"PDF verified: {len(reader.pages)} A4 pages, Korean text and clickable links.")
