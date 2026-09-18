# -*- coding: utf-8 -*-
"""v1.0 사업계획서 덱 생성: 프리앰블(헬퍼) + 슬라이드 결합. python scripts/make-deck-v1.py"""
import pathlib
_here = pathlib.Path(__file__).resolve().parent
OUT = _here.parent / "docs" / "VSP_사업계획서_v1.pptx"
_ns = {"__file__": str(_here / "make-deck.py")}
exec(compile((_here / "_deck_preamble.py").read_text(encoding="utf-8"), "_deck_preamble.py", "exec"), _ns)
_ns["OUT"] = OUT
exec(compile((_here / "_deck_slides.py").read_text(encoding="utf-8"), "_deck_slides.py", "exec"), _ns)
