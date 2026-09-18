# -*- coding: utf-8 -*-
"""
VSP 사업계획 발표자료(.pptx) 생성.

레이아웃을 직접 그린다. 파워포인트 기본 템플릿은 자리표시자 위치가 고정되어
한글·베트남어 혼용 제목에서 줄바꿈이 깨지기 때문이다.

  python scripts/make-deck.py
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

# ── 팔레트 (사업계획서 웹 문서와 동일) ──────────────────────────────
INK        = RGBColor(0x16, 0x21, 0x2E)
INK_SOFT   = RGBColor(0x46, 0x58, 0x6B)
INK_FAINT  = RGBColor(0x7B, 0x8C, 0xA0)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
PAPER      = RGBColor(0xF6, 0xF8, 0xFA)
PAPER2     = RGBColor(0xED, 0xF1, 0xF5)
LINE       = RGBColor(0xDC, 0xE3, 0xEA)
ACCENT     = RGBColor(0x0E, 0x5C, 0x7A)
ACCENT_SOFT= RGBColor(0xE3, 0xF0, 0xF5)
WARN       = RGBColor(0xC2, 0x41, 0x0C)
WARN_SOFT  = RGBColor(0xFB, 0xED, 0xE6)
GOOD       = RGBColor(0x15, 0x80, 0x3D)
GOOD_SOFT  = RGBColor(0xE6, 0xF2, 0xEA)

# 한글과 베트남어 성조를 모두 지원하는 Windows 기본 글꼴
FONT   = "맑은 고딕"
FONT_M = "Consolas"

W, H = Inches(13.333), Inches(7.5)          # 16:9
ML, MR = Inches(0.85), Inches(0.85)         # 좌우 여백
CONTENT_W = W - ML - MR

prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]


# ── 기본 도구 ────────────────────────────────────────────────────
def slide(bg=WHITE):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = bg
    return s


def box(s, x, y, w, h, fill=None, line=None, line_w=1.0):
    from pptx.enum.shapes import MSO_SHAPE
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    if fill is None:
        sh.fill.background()
    else:
        sh.fill.solid()
        sh.fill.fore_color.rgb = fill
    if line is None:
        sh.line.fill.background()
    else:
        sh.line.color.rgb = line
        sh.line.width = Pt(line_w)
    sh.shadow.inherit = False
    return sh


def text(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         line_spacing=1.25, space_after=0):
    """runs: [(문자열, 크기pt, 굵게, 색, 폰트|None), ...] — 각 항목이 한 문단"""
    tb = s.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, item in enumerate(runs):
        body, size, bold, color = item[0], item[1], item[2], item[3]
        fname = item[4] if len(item) > 4 else FONT
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        if space_after:
            p.space_after = Pt(space_after)
        r = p.add_run()
        r.text = body
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = fname
    return tb


def header(s, num, title, sub=None):
    """섹션 번호 + 제목 + 부제. 모든 본문 슬라이드의 상단."""
    text(s, ML, Inches(0.52), CONTENT_W, Inches(0.3),
         [(num, 12, False, ACCENT, FONT_M)])
    text(s, ML, Inches(0.82), CONTENT_W, Inches(0.62),
         [(title, 30, True, INK)])
    box(s, ML, Inches(1.58), CONTENT_W, Emu(12700), fill=ACCENT)
    if sub:
        text(s, ML, Inches(1.74), CONTENT_W, Inches(0.4),
             [(sub, 14, False, INK_SOFT)])


def footer(s, n):
    text(s, ML, H - Inches(0.62), CONTENT_W, Inches(0.24),
         [("Vietnam Sports Platform · 사업계획 v0.9", 9, False, INK_FAINT, FONT_M)])
    text(s, W - MR - Inches(1.0), H - Inches(0.62), Inches(1.0), Inches(0.24),
         [(str(n), 9, False, INK_FAINT, FONT_M)], align=PP_ALIGN.RIGHT)


def table(s, x, y, w, cols, rows, col_w=None, head_fill=PAPER2,
          fs=11, row_h=Inches(0.36), head_h=Inches(0.38)):
    """가벼운 표. python-pptx 기본 표 스타일은 색이 강해 직접 그린다."""
    n_rows = len(rows) + 1
    shape = s.shapes.add_table(n_rows, len(cols), x, y, w,
                               head_h + row_h * len(rows)).table
    if col_w:
        total = sum(col_w)
        for i, cw in enumerate(col_w):
            shape.columns[i].width = Emu(int(w * cw / total))
    shape.rows[0].height = head_h
    for i in range(1, n_rows):
        shape.rows[i].height = row_h

    for c, label in enumerate(cols):
        cell = shape.cell(0, c)
        cell.fill.solid()
        cell.fill.fore_color.rgb = head_fill
        cell.margin_left = cell.margin_right = Inches(0.09)
        cell.margin_top = cell.margin_bottom = Inches(0.04)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        p = cell.text_frame.paragraphs[0]
        r = p.add_run(); r.text = label
        r.font.size = Pt(fs); r.font.bold = True
        r.font.color.rgb = INK_SOFT; r.font.name = FONT

    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            cell = shape.cell(ri, ci)
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE
            cell.margin_left = cell.margin_right = Inches(0.09)
            cell.margin_top = cell.margin_bottom = Inches(0.04)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            p.line_spacing = 1.1
            bold = val.startswith("**")
            body = val.replace("**", "")
            r = p.add_run(); r.text = body
            r.font.size = Pt(fs); r.font.bold = bold
            r.font.color.rgb = INK if bold else INK_SOFT
            r.font.name = FONT
    return shape


def stat(s, x, y, w, value, label, color=ACCENT):
    box(s, x, y, w, Inches(1.15), fill=WHITE, line=LINE)
    text(s, x + Inches(0.16), y + Inches(0.16), w - Inches(0.32), Inches(0.48),
         [(value, 26, True, color, FONT_M)])
    text(s, x + Inches(0.16), y + Inches(0.68), w - Inches(0.32), Inches(0.34),
         [(label, 11, False, INK_SOFT)])


def callout(s, x, y, w, h, label, body, tone="accent"):
    fill, edge, lab = ACCENT_SOFT, ACCENT, ACCENT
    if tone == "warn":
        fill, edge, lab = WARN_SOFT, WARN, WARN
    elif tone == "good":
        fill, edge, lab = GOOD_SOFT, GOOD, GOOD
    box(s, x, y, w, h, fill=fill)
    box(s, x, y, Inches(0.045), h, fill=edge)
    text(s, x + Inches(0.24), y + Inches(0.16), w - Inches(0.48), Inches(0.24),
         [(label, 9, True, lab, FONT_M)])
    text(s, x + Inches(0.24), y + Inches(0.44), w - Inches(0.48), h - Inches(0.6),
         [(body, 13, False, INK)], line_spacing=1.35)


def mono_block(s, x, y, w, h, lines):
    box(s, x, y, w, h, fill=PAPER, line=LINE)
    text(s, x + Inches(0.22), y + Inches(0.18), w - Inches(0.44), h - Inches(0.36),
         [(l, 11, False, INK_SOFT, FONT_M) for l in lines], line_spacing=1.3)


# ═══════════════════════════════════════════════════════════════════
# 01. 표지
# ═══════════════════════════════════════════════════════════════════
s = slide(INK)
box(s, Emu(0), Emu(0), Inches(0.18), H, fill=ACCENT)
text(s, Inches(1.1), Inches(1.9), Inches(10.5), Inches(0.34),
     [("VIETNAM SPORTS PLATFORM", 13, False, RGBColor(0x8F, 0xC4, 0xD8), FONT_M)])
text(s, Inches(1.1), Inches(2.35), Inches(11), Inches(1.5),
     [("베트남 스포츠 통합 플랫폼", 48, True, WHITE)])
text(s, Inches(1.1), Inches(3.7), Inches(10), Inches(0.9),
     [("체육 행정과 대중 미디어를 하나로 묶어", 20, False, RGBColor(0xC6, 0xD4, 0xE0)),
      ("베트남 체육의 공식 인프라가 된다", 20, False, RGBColor(0xC6, 0xD4, 0xE0))],
     line_spacing=1.35)
box(s, Inches(1.1), Inches(5.1), Inches(2.2), Emu(12700), fill=ACCENT)
text(s, Inches(1.1), Inches(5.35), Inches(10), Inches(0.9),
     [("사업계획 보고 · v0.9 (검토용)", 13, False, RGBColor(0x9F, 0xB0, 0xC0), FONT_M),
      ("2026년 9월", 13, False, RGBColor(0x9F, 0xB0, 0xC0), FONT_M)],
     line_spacing=1.5)

# ═══════════════════════════════════════════════════════════════════
# 02. 한 장 요약
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "01", "한 장 요약")
y = Inches(2.35)
for i, (v, k) in enumerate([("34", "2025년 통합 후 성·시"), ("10일", "대회 승인 법정 기한"),
                            ("4,200만", "FIFA Connect 발급 ID"), ("96", "구축된 화면 수"),
                            ("3", "지원 언어 vi/en/ko")]):
    stat(s, ML + Inches(2.42) * i, y, Inches(2.2), v, k)
rows = [
    ["시작 경위", "**베트남 측 요청으로 시작"],
    ["목표 지위", "**베트남 체육 공식 시스템 지정"],
    ["범위", "**전 종목 일괄 — 중앙 체육회가 표준 서식을 협회에 지정·강제"],
    ["현재 단계", "**동작하는 시스템 구축 완료 (기획서가 아니라 실물)"],
    ["다음 단계", "문체부 협의 → 요구사항 반영 → IT팀 확장·디자인"],
]
table(s, ML, Inches(3.9), CONTENT_W, ["항목", "내용"], rows, col_w=[1, 4.2], fs=13,
      row_h=Inches(0.42))
footer(s, 2)

# ═══════════════════════════════════════════════════════════════════
# 03. 문제 — 베트남 체육 행정의 공백
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "02", "문제", "베트남에는 체육 행정 시스템이 존재하지 않는다")
rows = [
    ["선수·지도자·심판 통합 등록", "온라인 다단계 승인", "**없음 — 연맹별 종이·엑셀"],
    ["통합 선수 DB·검색", "있음", "**없음"],
    ["전자결재·전자보고", "있음", "**없음 — 공문·직인·우편"],
    ["대회 승인·엔트리·기록", "있음", "오프라인 절차"],
    ["예산·정산 온라인", "e나라도움", "**없음"],
    ["경영공시(투명성)", "의무", "**없음"],
    ["대중용 스포츠 미디어", "민간(네이버)이 담당", "**공백"],
]
table(s, ML, Inches(2.35), CONTENT_W, ["기능", "한국", "베트남"], rows,
      col_w=[2.2, 1.5, 2.3], fs=12, row_h=Inches(0.44))
callout(s, ML, Inches(6.05), CONTENT_W, Inches(0.82), "핵심 기회",
        "한국은 이미 만들어진 여러 시스템을 통합해야 하는 문제를 안고 있고, "
        "베트남은 백지에서 통합 설계할 수 있는 기회를 갖고 있다.")
footer(s, 3)

# ═══════════════════════════════════════════════════════════════════
# 04. 왜 지금인가
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "03", "왜 지금인가", "세 가지 시점적 이유")
items = [
    ("01", "행정 시스템의 부재",
     "선수 등록·대회 승인·예산 정산이 전부 종이와 엑셀로 이루어진다.\n만드는 사람이 곧 표준이 된다."),
    ("02", "행정구역 대개편 직후",
     "2025년 7월 63개 → 34개로 통합되었다. 지방 체육 조직이 재편 중이며,\n지금이 새 체계로 데이터를 정리할 수 있는 유일한 시기다."),
    ("03", "결제·인증 인프라 성숙",
     "VNPAY·MoMo·전자세금계산서·VNeID가 모두 갖춰져,\n한국이 20년에 걸쳐 만든 것을 단번에 조립할 수 있다."),
]
y = Inches(2.45)
for num, title, body in items:
    box(s, ML, y, CONTENT_W, Inches(1.28), fill=WHITE, line=LINE)
    box(s, ML, y, Inches(0.045), Inches(1.28), fill=ACCENT)
    text(s, ML + Inches(0.3), y + Inches(0.2), Inches(0.7), Inches(0.3),
         [(num, 15, True, ACCENT, FONT_M)])
    text(s, ML + Inches(1.05), y + Inches(0.17), Inches(9.5), Inches(0.36),
         [(title, 17, True, INK)])
    text(s, ML + Inches(1.05), y + Inches(0.58), Inches(10.2), Inches(0.6),
         [(body, 12.5, False, INK_SOFT)], line_spacing=1.3)
    y += Inches(1.46)
footer(s, 4)

# ═══════════════════════════════════════════════════════════════════
# 05. 벤치마크 — 대한체육회
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "04", "벤치마크 — 대한민국 대한체육회",
                         "60여 년에 걸쳐 완성된 체육 행정 체계를 실사했다")
mono_block(s, ML, Inches(2.3), Inches(6.4), Inches(2.5), [
    "문화체육관광부 (예산·법령·감독)",
    "  └─ 대한체육회 ── 회원종목단체 80개 + 준회원 4개",
    "        ├─ 시도종목단체 (17개 시도)",
    "        ├─ 시도체육회 → 시군구체육회 (228개)",
    "        └─ 해외한인체육단체",
    "  └─ 국민체육진흥공단 (스포츠토토 수익으로 재원)",
])
mono_block(s, ML + Inches(6.75), Inches(2.3), Inches(4.85), Inches(2.5), [
    "[경기인 등록 흐름]",
    "본인인증",
    "  → 교육 이수 (인권·도핑) ※ 필수 선행",
    "  → 신청서 작성",
    "  → ① 시도종목단체 승인",
    "  → ② 중앙 종목단체 최종 승인",
    "  → 증명서 발급 → 출전 자격",
])
callout(s, ML, Inches(5.05), Inches(5.6), Inches(1.5), "배울 점",
        "정보공개·경영공시가 독립 대분류이고, 등록현황이 대중에 공개되며, "
        "증명서 발급만큼 검증(진위확인)이 중요하게 다뤄진다.")
callout(s, ML + Inches(6.0), Inches(5.05), Inches(5.6), Inches(1.5), "고칠 점",
        "사이트가 3개로 분리되어 혼란스럽고, 행정과 미디어가 완전히 갈라져 "
        "대중 트래픽이 체육회로 오지 않는다.", tone="warn")
footer(s, 5)

# ═══════════════════════════════════════════════════════════════════
# 06. 해법 — 2-Face 플랫폼
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "05", "해법 — 하나의 플랫폼, 두 개의 얼굴")
box(s, ML, Inches(2.3), CONTENT_W, Inches(1.75), fill=WHITE, line=LINE)
box(s, ML, Inches(2.3), Inches(0.045), Inches(1.75), fill=ACCENT)
text(s, ML + Inches(0.35), Inches(2.5), Inches(2.6), Inches(0.4),
     [("공개 — 대중용", 17, True, ACCENT)])
text(s, ML + Inches(0.35), Inches(2.95), Inches(10.8), Inches(1.0),
     [("종목 허브 · 대회 일정/결과 · 선수 프로필 · 통합검색", 13, False, INK_SOFT),
      ("뉴스 · 체육단체 · 경영공시 · 통계 현황판", 13, False, INK_SOFT)], line_spacing=1.4)
text(s, ML + Inches(4.0), Inches(4.15), Inches(6.0), Inches(0.34),
     [("▲  업무 화면 입력이 자동 반영 — 별도 편집 작업 없음", 12, True, ACCENT)])
box(s, ML, Inches(4.6), CONTENT_W, Inches(1.75), fill=WHITE, line=LINE)
box(s, ML, Inches(4.6), Inches(0.045), Inches(1.75), fill=INK)
text(s, ML + Inches(0.35), Inches(4.8), Inches(2.6), Inches(0.4),
     [("업무 — 협회용", 17, True, INK)])
text(s, ML + Inches(0.35), Inches(5.25), Inches(10.8), Inches(1.0),
     [("조직·인원 · 경기인등록 · 증명서 · 대회 운영", 13, False, INK_SOFT),
      ("전자결재 · 전자수납 · 문서 · 보고서", 13, False, INK_SOFT)], line_spacing=1.4)
text(s, ML, Inches(6.6), CONTENT_W, Inches(0.34),
     [("연동:  VNeID · VNPAY/MoMo · 전자서명 · 전자세금계산서 · Zalo", 11, False, INK_FAINT, FONT_M)])
footer(s, 6)

# ═══════════════════════════════════════════════════════════════════
# 07. 선순환 루프
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "06", "사업의 핵심 논리", "이 루프가 이 사업의 전부다")
steps = [
    "협회가 행정 도구를 쓴다  (수기 → 전자 전환의 편익)",
    "선수·대회·결과 데이터가 자동으로 쌓인다",
    "대중용 페이지가 인력 투입 없이 채워진다",
    "팬 트래픽이 발생한다",
    "트래픽이 협회의 홍보 채널이 된다  →  협회가 더 열심히 입력한다",
    "스폰서가 붙는다  →  협회에 수익 배분  →  이탈 불가",
]
y = Inches(2.4)
for i, st in enumerate(steps):
    box(s, ML, y, CONTENT_W, Inches(0.58), fill=WHITE, line=LINE)
    text(s, ML + Inches(0.24), y + Inches(0.13), Inches(0.5), Inches(0.3),
         [(f"{i+1}", 13, True, ACCENT, FONT_M)])
    text(s, ML + Inches(0.85), y + Inches(0.12), Inches(10.5), Inches(0.34),
         [(st, 14, False, INK)])
    y += Inches(0.68)
callout(s, ML, Inches(6.5), CONTENT_W, Inches(0.72), "한 문장",
        "네이버 스포츠는 남이 만든 데이터를 보여주는 회사이고, "
        "VSP는 데이터를 만들게 하는 도구를 주고 그 데이터를 보여주는 회사다.")
footer(s, 7)

# ═══════════════════════════════════════════════════════════════════
# 08. Top-Down 강제 모델
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "07", "왜 전 종목 일괄이 가능한가",
                         "중앙이 표준 서식을 강제할 수 있다면 게임이 달라진다")
rows = [
    ["서식", "협회마다 다름 → 커스터마이징 지옥", "**중앙 표준 1종 + 종목별 확장 필드"],
    ["온보딩", "협회를 하나씩 설득", "**중앙이 공문으로 지시"],
    ["개발 범위", "협회 수 × 요구사항", "**표준 1벌"],
    ["최대 위험", "협회가 안 씀", "**표준 서식 확정이 늦어지면 전체가 멈춤"],
]
table(s, ML, Inches(2.4), CONTENT_W, ["", "일반 SaaS (Bottom-Up)", "VSP (Top-Down)"], rows,
      col_w=[1, 2.6, 2.9], fs=13, row_h=Inches(0.56))
callout(s, ML, Inches(5.35), CONTENT_W, Inches(1.4), "따라서 최우선 과제",
        "이 사업의 최대 병목은 개발이 아니라 공식 서류 서식 확보다.\n"
        "1차로 선수등록·대회개최·사업계획 세 가지만 먼저 받으면 개발이 실물에 붙는다.",
        tone="warn")
footer(s, 8)

# ═══════════════════════════════════════════════════════════════════
# 09. 정보구조
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "08", "정보구조", "대한체육회 메뉴 체계를 이식하되 세 가지를 고쳤다")
mono_block(s, ML, Inches(2.3), Inches(5.6), Inches(3.5), [
    "[공개 영역]",
    "홈",
    "├─ 종목        종목별 허브",
    "├─ 대회        일정(주/월/연) · 결과",
    "├─ 선수        통합검색 · 프로필 · 랭킹",
    "├─ 뉴스        보도자료 · 영상 · 인물",
    "├─ 체육단체    연맹 · 경영공시",
    "├─ 공개정보    공지 · 법령 · 통계",
    "└─ 소개        조직 · 공정체육 · 후원사",
])
mono_block(s, ML + Inches(6.0), Inches(2.3), Inches(5.6), Inches(3.5), [
    "[업무 영역]",
    "대시보드",
    "├─ 내 업무     신청·활동·교육 이력",
    "├─ 결재        결재함 · 기안",
    "├─ 조직 / 인원",
    "├─ 등록        경기인 6유형 · 승인 · 이적",
    "├─ 증명서      발급 · 진위확인",
    "├─ 대회        신청 · 대진 · 결과",
    "├─ 수납        요금 · 미납 · 정산",
    "└─ 콘텐츠 / 보고서 / 설정",
])
rows = [
    ["사이트 수", "3개", "**1개", "후발주자 이점, 단일 로그인"],
    ["메뉴 깊이", "최대 4단계", "**최대 3단계", "사무국 1~5명 · 모바일 중심"],
    ["기자 기고", "없음", "**승인 기자 기고", "콘텐츠 확보"],
]
table(s, ML, Inches(6.0), CONTENT_W, ["항목", "한국", "VSP", "이유"], rows,
      col_w=[1.1, 1.1, 1.4, 2.6], fs=11.5, row_h=Inches(0.34))
footer(s, 9)

# ═══════════════════════════════════════════════════════════════════
# 10. 법·제도 대응
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "09", "법·제도 대응", "각 제도가 시스템 설계를 직접 규정한다")
rows = [
    ["**대회 개최 승인", "체육법 38~40조\n결정 109/QĐ-BVHTTDL", "**서류 접수 후 10일 내 결정\n국제대회는 전년 7/1 마감 — 시스템이 자동 계산·경고"],
    ["**결제 라이선스", "Nghị định 52/2024", "**수납 대행은 국가은행 라이선스 대상\n→ 자금이 우리 계좌를 거치지 않는 구조로 설계"],
    ["전자서명", "전자거래법 · CA", "자필서명+법인인감과 동등한 효력 → 종이 공문 대체"],
    ["개인정보", "Nghị định 13/2023", "동의 이력 · 민감정보 별도 동의 · 미성년 보호자 동의"],
    ["행정구역 개편", "결의 202/2025/QH15", "63 → 34 통합 → 조직 계층을 고정하지 않고 이력으로 관리"],
]
table(s, ML, Inches(2.4), CONTENT_W, ["영역", "근거", "설계 반영"], rows,
      col_w=[1.3, 1.7, 3.6], fs=11.5, row_h=Inches(0.62))
callout(s, ML, Inches(6.0), CONTENT_W, Inches(0.9), "자금 흐름",
        "납부자 → 결제사 → 협회 계좌 직접 입금. 협회가 가맹점이고 우리는 시스템 이용료를 별도 청구한다. "
        "받아뒀다 나눠주면 라이선스 대상이 되기 때문이다.")
footer(s, 10)

# ═══════════════════════════════════════════════════════════════════
# 11. 구축 현황 — 업무
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "10", "구축 현황 — 체육회 레벨 (업무)",
                         "기획서가 아니라 이미 동작하는 시스템이다")
rows = [
    ["인증", "전화번호 + OTP. 번호 정규화(+84/84/0 통일), 코드·토큰 해시 저장, 요청 제한"],
    ["조직", "무제한 계층 트리, 생성, 인원/역할 배치, 조직 통합(행정개편) 이력"],
    ["등록", "동적 폼 기반 신청, 서버 검증, 6개 유형(선수·지도자·심판·관리자·임원·센터)"],
    ["**결재", "**다단계 승인, 역할 기반 승인자, 반려/보완, 법정기한 초과 건 우선 표시"],
    ["증명서", "발급 + 검증코드 부여 (전화로 불러줄 수 있는 형식)"],
    ["**대회", "**개최신청 자동 결재 → 승인 후 공개 → 참가신청 → 대진 자동 생성 → 결과 입력"],
    ["수납", "요금규칙(중앙 상한 검증), 수납 건, 현금 대리입력, 미납 집계"],
    ["감사", "모든 결재·발급·수납의 불변 기록 — 정부 감사·분쟁 대비"],
]
table(s, ML, Inches(2.35), CONTENT_W, ["기능", "내용"], rows,
      col_w=[1, 6.4], fs=12, row_h=Inches(0.48))
footer(s, 11)

# ═══════════════════════════════════════════════════════════════════
# 12. 구축 현황 — 공개 + 개인정보
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "11", "구축 현황 — 공개 영역과 개인정보 정책")
rows = [
    ["홈 / 종목 허브", "예정 대회 · 종목별 통계 · 일정 · 선수 명단"],
    ["대회", "주간 / 월간 / 연간 일정, 결과"],
    ["선수", "통합검색(종목·지역·성별·이름, 성조 무시) · 프로필"],
    ["체육단체", "조직 디렉토리 · 경영공시"],
    ["통계 현황판", "등록유형별 · 종목별 · 지역별 · 연령대별"],
    ["증명서 검증", "로그인 없이 진위확인"],
]
table(s, ML, Inches(2.35), Inches(5.6), ["화면", "내용"], rows,
      col_w=[1.3, 2.7], fs=11.5, row_h=Inches(0.42))
rows2 = [
    ["생년월일", "**출생년도만 공개"],
    ["신분증", "**원문 저장 안 함 — 해시만"],
    ["연락처·건강", "비공개"],
    ["**만 18세 미만", "**보호자 동의 전까지 노출 제외"],
    ["동의 이력", "별도 관리 (개인정보보호령)"],
]
text(s, ML + Inches(6.0), Inches(2.35), Inches(5.6), Inches(0.3),
     [("개인정보 보호 — 코드에 반영된 정책", 13, True, INK)])
table(s, ML + Inches(6.0), Inches(2.75), Inches(5.6), ["항목", "처리"], rows2,
      col_w=[1.3, 2.7], fs=11.5, row_h=Inches(0.42))
callout(s, ML, Inches(5.4), CONTENT_W, Inches(1.0), "설계 제1원칙",
        "업무 화면에서 한 번 입력한 데이터가 공개 화면에 자동으로 나타난다. "
        "홍보를 위해 따로 글을 쓰는 일이 없어야 협회가 계속 입력한다.")
footer(s, 12)

# ═══════════════════════════════════════════════════════════════════
# 13. 검증 결과
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "12", "검증 결과", "손으로 검토해서는 놓쳤을 결함 4건을 실제로 잡았다")
mono_block(s, ML, Inches(2.3), CONTENT_W, Inches(1.55), [
    "test:schema   마이그레이션 4 + 시드 3 실제 적용, 제약·인덱스·함수 확인",
    "test:dates    날짜·수치 타입 매핑 회귀 방지",
    "test:bracket  토너먼트(n=2~32) · 리그(n=2~10) · 부전승 · 시드 배치",
    "test:smoke    조직→로그인→검증→신청→2단계 결재→승인→감사로그→행정구역 통합",
    "test:event    대회생성→개최승인→참가→대진→결과→재생성 안전성→공개 노출 제어",
    "→ 전부 통과 · 프로덕션 빌드 96개 화면 성공",
])
rows = [
    ["트랜잭션 중 다른 커넥션 사용", "커밋 전 데이터를 못 봄 · 간헐적 장애", "커넥션 재사용"],
    ["토너먼트 1라운드만 생성", "**대회 당일 대진표 없음", "전 라운드 + 부전승"],
    ["**날짜가 객체로 반환", "**시간대 밀림으로 날짜 하루 어긋남", "문자열 고정 + 회귀 테스트"],
    ["점수가 21.000으로 표시", "배구 21점이 소수로 보임", "종목별 소수 처리"],
]
table(s, ML, Inches(4.2), CONTENT_W, ["발견한 결함", "방치했다면", "조치"], rows,
      col_w=[2.2, 2.6, 1.8], fs=12, row_h=Inches(0.48))
callout(s, ML, Inches(6.3), CONTENT_W, Inches(0.78), "왜 중요한가",
        "대회 날짜가 하루 밀리거나 대회 당일 대진표가 없는 사고는 복구가 불가능하다. "
        "제도를 다루는 시스템일수록 이런 결함이 치명적이다.")
footer(s, 13)

# ═══════════════════════════════════════════════════════════════════
# 14. 기술 원칙
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "13", "기술 원칙", "협의 결과로 구조가 바뀔 것을 전제로 설계했다")
rows = [
    ["**하드코딩 금지", "서식·결재선·종목·부문·요금이 전부 데이터",
     "**협의 피드백을 코드 수정 없이 설정 변경으로 흡수"],
    ["**행정/체육 코드 분리", "core-admin(조직·결재·수납) / sport-domain(종목·대회)",
     "문화·관광·교육으로 확장 가능 — 나중에는 불가능한 결정"],
    ["승인자 = 역할", "사람이 아니라 역할·조직으로 지정",
     "**담당자가 교체돼도 결재가 멈추지 않는다"],
    ["드라이버 독립 DB", "접속 문자열 한 줄로 교체", "로컬 → NAS → 베트남 서버 이전"],
    ["무제한 조직 트리", "계층을 고정하지 않음", "행정구역 추가 개편에도 대응"],
]
table(s, ML, Inches(2.4), CONTENT_W, ["원칙", "구현", "효과"], rows,
      col_w=[1.5, 2.5, 2.6], fs=11.5, row_h=Inches(0.6))
callout(s, ML, Inches(5.75), CONTENT_W, Inches(1.0), "예시",
        "체육회가 \"이 칸을 추가하고 결재를 3단계로 바꿔라\"고 해도 "
        "관리자 화면에서 설정을 바꾸면 끝난다. 초기 개발이 20~30% 느려지지만, "
        "먼저 만들고 나중에 실정에 맞추는 전략을 성립시키는 유일한 방법이다.")
footer(s, 14)

# ═══════════════════════════════════════════════════════════════════
# 14-b. 구축 범위의 구분 (신규)
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "13-b", "구축 범위의 구분",
                         "무엇이 완료됐고 무엇이 협의 대상인지 분명히 한다")
box(s, ML, Inches(2.35), Inches(5.6), Inches(2.5), fill=GOOD_SOFT)
box(s, ML, Inches(2.35), Inches(0.045), Inches(2.5), fill=GOOD)
text(s, ML + Inches(0.3), Inches(2.55), Inches(5.0), Inches(0.34),
     [("체육회 레벨 — 완료", 16, True, GOOD)])
text(s, ML + Inches(0.3), Inches(3.0), Inches(5.0), Inches(1.7),
     [("협회·연맹이 쓰는 업무", 12.5, False, INK_SOFT),
      ("등록 · 대회 · 결재 · 수납 · 증명서", 13, False, INK),
      ("공개 페이지 · 통합검색 · 경영공시 · 통계", 13, False, INK),
      ("→ 동작하는 시스템 확보", 12.5, True, GOOD)], line_spacing=1.5)

box(s, ML + Inches(6.0), Inches(2.35), Inches(5.6), Inches(2.5), fill=WARN_SOFT)
box(s, ML + Inches(6.0), Inches(2.35), Inches(0.045), Inches(2.5), fill=WARN)
text(s, ML + Inches(6.3), Inches(2.55), Inches(5.0), Inches(0.34),
     [("부처 레벨 — 협의 후 설계", 16, True, WARN)])
text(s, ML + Inches(6.3), Inches(3.0), Inches(5.0), Inches(1.7),
     [("문체부가 체육회를 관리·감독하는 업무", 12.5, False, INK_SOFT),
      ("기관 간 공문 유통 · 보조금 전 주기", 13, False, INK),
      ("위원회 · 감사 · 정보공개 · 민원", 13, False, INK),
      ("→ 한국은 온나라·e나라도움이 담당", 12.5, True, WARN)], line_spacing=1.5)

callout(s, ML, Inches(5.1), CONTENT_W, Inches(1.5), "협의에서 먼저 확인할 것",
        "베트남 정부에 한국의 온나라시스템(전자문서)·e나라도움(보조금)에 해당하는 시스템이 "
        "이미 있는지 확인되지 않았다. 있으면 연동하고 없으면 우리가 만든다. "
        "설계가 갈리는 지점이라 단정하지 않고 협의 후 정한다.")
footer(s, 16)

# ═══════════════════════════════════════════════════════════════════
# 15. 추진 일정
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "14", "추진 일정")
phases = [
    ("Phase 0", "완료", "조사 · 설계 · 핵심 시스템 구축", GOOD, GOOD_SOFT),
    ("Phase 1", "협의 직후", "문체부 협의 → 공식 서식 반영 → 요구사항 확정", WARN, WARN_SOFT),
    ("Phase 2", "3개월", "IT팀 합류 · 디자인 적용 · 뉴스/기자 모듈 · 알림 연동", INK_FAINT, WHITE),
    ("Phase 3", "3개월", "파일럿 협회 3~5개 온보딩 · 데이터 이관 · 현장 교육", INK_FAINT, WHITE),
    ("Phase 4", "3개월", "전 종목 확대(웨이브) · 결제 정식 연동", INK_FAINT, WHITE),
    ("Phase 5", "이후", "미디어 고도화 · 스폰서십 · 오픈 API · 학교체육", INK_FAINT, WHITE),
]
y = Inches(2.4)
for name, period, body, col, fill in phases:
    box(s, ML, y, CONTENT_W, Inches(0.6), fill=fill, line=LINE)
    box(s, ML, y, Inches(0.045), Inches(0.6), fill=col)
    text(s, ML + Inches(0.28), y + Inches(0.14), Inches(1.3), Inches(0.32),
         [(name, 13, True, INK)])
    text(s, ML + Inches(1.75), y + Inches(0.15), Inches(1.3), Inches(0.3),
         [(period, 11.5, False, col, FONT_M)])
    text(s, ML + Inches(3.3), y + Inches(0.14), Inches(8.0), Inches(0.32),
         [(body, 12.5, False, INK_SOFT)])
    y += Inches(0.7)
callout(s, ML, Inches(6.6), CONTENT_W, Inches(0.72), "주의",
        "전 종목 일괄은 시스템 범위이지 롤아웃 속도가 아니다. 협회 투입은 3~5개씩 웨이브로 나눈다. "
        "같은 주에 40개를 온보딩하면 지원이 마비되고 첫인상이 무너진다.", tone="warn")
footer(s, 15)

# ═══════════════════════════════════════════════════════════════════
# 16. 사업 모델
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "15", "사업 모델")
rows = [
    ["**정부 위탁운영비", "공식 시스템 운영 수탁", "초기 기반"],
    ["**광고 · 스폰서십", "공개 영역 트래픽 기반", "**최종 1순위"],
    ["협회 SaaS 구독", "조직 규모별 요금", "가치 입증 후"],
    ["결제 수수료", "결제 연동 마진", "수납 정착 후"],
    ["개인 스폰서십 중개", "선수-브랜드 매칭 수수료", "선수 DB 축적 후"],
    ["데이터 API", "언론 · 판타지 등", "장기"],
]
table(s, ML, Inches(2.4), CONTENT_W, ["모델", "설명", "시점"], rows,
      col_w=[2.0, 3.4, 1.4], fs=12.5, row_h=Inches(0.46))
callout(s, ML, Inches(5.65), Inches(5.6), Inches(1.2), "대기업 제안 시",
        "팔 것은 광고 지면이 아니라 베트남 스포츠 데이터와 팬 접점의 독점적 파트너 지위다. "
        "그렇게 써야 금액 단위가 달라진다.")
callout(s, ML + Inches(6.0), Inches(5.65), Inches(5.6), Inches(1.2), "광고 거부감 대응",
        "정부 시스템의 광고에 거부감이 있다면 협회 수익 사업으로 설명한다. "
        "광고 수익 일부를 종목 협회에 배분하는 구조를 이미 반영했다.", tone="good")
footer(s, 17)

# ═══════════════════════════════════════════════════════════════════
# 17. 리스크
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "16", "리스크와 대응")
rows = [
    ["**공식 서식 확보 지연", "높음", "**최대 병목 — 1차 3종만이라도 조기 확보 필요"],
    ["정부 협약 무산", "높음", "베트남 측 요청으로 시작해 낮아짐. 플랜 B: 민간 SaaS + 미디어"],
    ["결제 라이선스 저촉", "높음", "**해결 — 자금이 우리 계좌를 거치지 않는 구조"],
    ["데이터 현지화 규제", "중간", "법률 검토 필요. 이전 가능한 구조는 확보"],
    ["협회 디지털 역량 부족", "중간", "오프라인 병행 · 현장 교육 · 대행 입력"],
    ["축구(VFF) 충돌", "중간", "행정은 FIFA Connect 연동, 콘텐츠는 직접 서비스"],
    ["정부의 운영 회수", "중간", "계약에 최소 운영기간·보상·데이터 소유권 명시"],
    ["담당자 교체 / 행정 개편", "낮음", "**해결 — 권한은 역할에, 계층은 데이터로"],
]
table(s, ML, Inches(2.4), CONTENT_W, ["리스크", "수준", "대응"], rows,
      col_w=[2.0, 0.8, 4.2], fs=12, row_h=Inches(0.46))
footer(s, 18)

# ═══════════════════════════════════════════════════════════════════
# 18. 협조 요청
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "17", "협조 요청", "한꺼번에 요구하지 않는다 — 1차는 세 가지뿐")
box(s, ML, Inches(2.35), CONTENT_W, Inches(1.55), fill=ACCENT_SOFT)
box(s, ML, Inches(2.35), Inches(0.045), Inches(1.55), fill=ACCENT)
text(s, ML + Inches(0.3), Inches(2.52), Inches(11), Inches(0.3),
     [("1차 요청 — 서식 3종", 15, True, ACCENT)])
text(s, ML + Inches(0.3), Inches(2.92), Inches(11.2), Inches(0.9),
     [("①  선수 등록 신청서   Đơn đăng ký vận động viên", 13.5, False, INK),
      ("②  대회 개최 신청서   Đơn xin phép tổ chức giải", 13.5, False, INK),
      ("③  연간 사업계획서     Kế hoạch hoạt động năm", 13.5, False, INK)], line_spacing=1.4)
text(s, ML, Inches(4.12), CONTENT_W, Inches(0.34),
     [("빈 양식이 아니라 실제 기입된 샘플을, PDF가 아니라 원본 Word/Excel로 받는다. 표 구조가 보여야 필드를 정확히 뽑아낼 수 있다.",
       12, False, INK_SOFT)])
rows = [
    ["국가 종목연맹·협회 전체 명단", "조직 구축"],
    ["**2025년 개편 후 34개 성/시 명칭·코드 + 구-신 매핑표", "지역 체계"],
    ["종목·세부종목·부문(체급/연령) 공식 분류표", "대회 운영"],
    ["기존 선수·지도자·심판 명부", "데이터 이관"],
    ["등록비·참가비 금액표 · 협회별 은행 계좌", "요금 · 결제"],
]
text(s, ML, Inches(4.62), Inches(5.6), Inches(0.3), [("2차 — 기준 데이터", 13, True, INK)])
table(s, ML, Inches(5.0), Inches(5.6), ["항목", "용도"], rows,
      col_w=[3.2, 1.2], fs=10.5, row_h=Inches(0.38))
rows2 = [
    ["**공문에 직인이 법적으로 필수인가?", "전자결재 효력"],
    ["**체육회가 협회에 사용을 지시할 수 있는가?", "Top-Down 성립"],
    ["**데이터 현지화 의무 대상인가?", "인프라 결정"],
    ["VFF가 현재 어떤 시스템을 쓰는가?", "축구 연동"],
    ["기존 선수 번호 체계가 있는가?", "통합 ID"],
]
text(s, ML + Inches(6.0), Inches(4.62), Inches(5.6), Inches(0.3),
     [("확인이 필요한 질문", 13, True, INK)])
table(s, ML + Inches(6.0), Inches(5.0), Inches(5.6), ["질문", "영향"], rows2,
      col_w=[3.2, 1.2], fs=10.5, row_h=Inches(0.38))
footer(s, 19)

# ═══════════════════════════════════════════════════════════════════
# 19. 미결정 사항
# ═══════════════════════════════════════════════════════════════════
s = slide(PAPER); header(s, "18", "논의가 필요한 사항",
                         "이 계획은 수정을 전제로 한다 — 아래는 현재의 가정이다")
rows = [
    ["**01  사업 주체 법인 구조", "한국 법인 + 베트남 현지법인",
     "**현지법인 없이는 정부 계약·결제 가맹 불가. 착수 후 3개월 내 확정"],
    ["**02  개발 예산 규모", "완성품으로 유치 예정",
     "과소 책정 시 현장 지원·데이터 이관이 먼저 잘린다"],
    ["**03  통합 ID 체계", "자체 채번 + 기존 번호 수용", "체육회 기존 체계 확인 후"],
    ["**04  서버 위치", "미정", "데이터 현지화 법률 검토 후"],
    ["**05  플랫폼 공식 명칭", "코드명 VSP", "체육회가 정할 가능성 — 브랜딩 투자 보류 중"],
    ["06  교육 게이트 활성화", "로직만 구현", "체육회 교육 콘텐츠 보유 여부"],
    ["07  광고 오픈 시점", "지면만 확보, 비활성", "체육회 수용도 확인 후"],
    ["08  디자인 적용 시점", "구조 확인용 최소 스타일", "협의로 구조가 바뀔 수 있어 의도적으로 보류"],
]
table(s, ML, Inches(2.4), CONTENT_W, ["항목", "현재 가정", "논의 포인트"], rows,
      col_w=[1.9, 1.9, 3.2], fs=11, row_h=Inches(0.45))
footer(s, 20)

# ═══════════════════════════════════════════════════════════════════
# 20. 다음 단계
# ═══════════════════════════════════════════════════════════════════
s = slide(INK)
box(s, Emu(0), Emu(0), Inches(0.18), H, fill=ACCENT)
text(s, Inches(1.1), Inches(1.25), Inches(10.5), Inches(0.34),
     [("NEXT STEPS", 13, False, RGBColor(0x8F, 0xC4, 0xD8), FONT_M)])
text(s, Inches(1.1), Inches(1.7), Inches(10.5), Inches(0.7),
     [("다음 단계", 38, True, WHITE)])
asks = [
    ("1", "1차 서식 3종 협조", "선수등록 · 대회개최 · 사업계획 — 실제 기입 샘플, 원본 파일"),
    ("2", "문체부·체육회 협의 일정 확정", "이 자료를 바탕으로 요구사항을 받는다"),
    ("3", "미결정 4건 방향 확인", "법인 구조 · 통합 ID · 서버 위치 · 플랫폼 명칭"),
    ("4", "IT팀 구성 및 예산 결정", "협의 결과 반영 후 디자인·확장 착수"),
]
y = Inches(2.85)
for num, title, body in asks:
    text(s, Inches(1.1), y, Inches(0.6), Inches(0.4),
         [(num, 20, True, ACCENT, FONT_M)])
    text(s, Inches(1.75), y - Inches(0.02), Inches(10), Inches(0.36),
         [(title, 18, True, WHITE)])
    text(s, Inches(1.75), y + Inches(0.38), Inches(10), Inches(0.32),
         [(body, 12.5, False, RGBColor(0x9F, 0xB0, 0xC0))])
    y += Inches(0.92)
box(s, Inches(1.1), Inches(6.7), Inches(2.2), Emu(12700), fill=ACCENT)

import os
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "docs", "VSP_사업계획_발표자료.pptx")
prs.save(out)
print(f"저장 완료: {out}")
print(f"슬라이드 {len(prs.slides.__iter__.__self__._sldIdLst)}장")
