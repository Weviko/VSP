# -*- coding: utf-8 -*-
"""VSP 발표자료 콘텐츠 — 한국어(KO)·베트남어(VI). make-decks.py 가 사용."""

KO = {
  "tagline": "Vietnam Sports Platform · 사업계획서 v1.1",
  "cover": ("VIETNAM SPORTS PLATFORM", "베트남 스포츠 통합 플랫폼",
            "행정 전산망(내부)과 스마트폰 스포츠 웹(외부)을 하나의 데이터로 묶은 베트남 체육 공식 인프라",
            "사업계획서 v1.1 · 완성본 검증 완료 · 2026년 9월"),
  "s01": {
    "h": ("한 장 요약", "두 얼굴, 하나의 데이터 — 문체부 협의 전 100% 구현 완료"),
    "lead": "베트남 체육 행정(등록·결재·수납·보조금)과 대중 스포츠 미디어를 하나의 데이터 위에 "
            "내부 행정 전산망 + 외부 스마트폰 웹 두 얼굴로 올렸다. 내부에 입력하면 외부에 자동 노출되고, "
            "서류가 올라오면 AI가 공식 폼 초안을 채워 전자결재로 넘긴다. 파일럿이 아니라 완성본으로 만들고 미팅에서 조정한다.",
    "stats": [("0 → 1", "베트남 체육단체 통합 등록 시스템"), ("43종목", "전 종목 + 성/시 지부 1,471개"),
              ("2얼굴", "내부 행정 · 외부 웹 · 공통 데이터"), ("완성·검증", "테스트 12종·경계·프로덕션 빌드 통과")],
    "co": ("지금 상태", "기능·데이터·다국어(vi/en/ko)·테스트·대규모 성능·프로덕션 빌드까지 검증된 완성본. "
            "남은 것은 대부분 개발이 아니라 문체부 협의·데이터 단계(공식 서식·성/시 코드·법률)다."),
  },
  "s02": {
    "h": ("배경과 기회", "한국은 흩어져 시스템화 · 베트남은 공백 — 후발주자 통합 설계"),
    "cols": ["기능", "한국", "베트남 (현재)", "VSP"],
    "rows": [
      ["선수·지도자·심판 등록", "g1 전자등록·승인", "없음(카드신청 링크)", "**등록+2단계 결재"],
      ["서류 → 공식 폼 등록", "수기 입력", "없음", "**AI 자동등록(초안)"],
      ["증명서·진위확인", "g1 전자증명서", "없음", "**구현"],
      ["종목단체 관리·공시", "경영공시", "없음", "**구현"],
      ["대회 운영", "g1 대회정보", "정보 게시", "**개최승인·대진·결과"],
      ["보조금·기금", "KSPO·e나라도움", "체육 전용 없음", "**전주기(부정차단)"],
      ["대중 미디어", "(민간) 네이버 스포츠", "분산·SNS", "**대외 웹(관 운영)"],
    ],
    "co": ("지렛대", "체육단체가 자체 구축할 여력이 없다 → 중앙이 표준을 지정하는 하향식 도입 = 전 종목 동시 온보딩 가능."),
  },
  "s03": {
    "h": ("구조 — 두 얼굴, 하나의 데이터", "내부에 입력하면 외부에 자동으로 나타난다"),
    "out": ("외부용 · 스마트폰 웹 (apps/portal)",
            ["네이버 스포츠형 · 로그인 없음 · 광고 가능", "종목 탭 → 일정·순위·기록·경기상세",
             "뉴스·후원·팬투표", "공개 데이터(pub)만 읽는다"]),
    "in": ("내부용 · 행정 전산망 (apps/platform)",
           ["회원 서비스 /my — 자기 기록만", "업무 /admin — 협회·성시·체육회·문체부",
            "AI 서류등록·전자결재·콘텐츠 관리", "로그인 필수"]),
    "databar": "하나의 데이터 — pub 공개계층(외부가 읽는 곳) + 원본계층(내부). 외부 웹은 pub 뷰만 읽는 전용 DB 역할로 "
               "접속 → 뚫려도 전화·신분증은 나가지 않는다. (경계는 자동 검사로 빌드에서 강제)",
    "co": ("설계 제1원칙", "홍보를 위해 따로 글을 쓰지 않는다 — 내부 입력이 외부에 자동 반영된다."),
  },
  "s04": {
    "h": ("외부용 — 스마트폰 웹", "네이버 스포츠 동작 실사 반영 (모바일 우선) · 전부 구현됨"),
    "cols": ["영역", "구성 (네이버 실사 반영)"],
    "rows": [
      ["**머리 3단", "유틸리티(공시·증명확인) / 종목 탭 / 기능 줄(경기·일정·순위·선수·뉴스·후원)"],
      ["**종목 안", "뉴스·영상·일정·순위·기록 → 리그·대회 필터 (네이버식)"],
      ["**경기 상세", "기록·라인업·응원·문자중계·뉴스·영상 탭 + 종목별 기록표"],
      ["**순위·기록", "팀 순위·개인 순위판(종목별 컬럼) · 미성년 이름 마스킹"],
      ["**미디어·참여", "뉴스·기사(자동/기자) · 팬 투표(MVP)·응원 · MY팀 구독"],
      ["**후원·수익", "후원 쇼케이스(선수 인기 지표) · 광고 지면(협회 수익 배분)"],
    ],
    "co": ("good", "e스포츠", "데이터는 한 종목, 화면은 타이틀-우선 — 같은 플랫폼에 포함."),
  },
  "s05": {
    "h": ("내부용 — 행정 전산망", "대한체육회 g1 + 문체부 계열 (사무국 1~5명·모바일 전제) · 전부 구현됨"),
    "cols": ["기능", "내용"],
    "rows": [
      ["**AI 서류 자동등록", "서류 업로드 → AI가 공식 폼 초안 → 사람 검토·확정 → 전자결재 (다음 장)"],
      ["**경기인 등록", "선수·지도자·심판, 동적 서식 + 2단계 결재(법정 처리기한)"],
      ["**전자결재·공문", "기안·합의·접수·문서대장 (온나라 계열)"],
      ["**전자수납·보조금", "자금은 납부자→PG→협회 직접(미경유) · 보조금 전주기(부정차단)"],
      ["**콘텐츠 행정", "기사 작성·검수(결재)·결과 자동기사 · 기자 자격 · 경기 중계·영상 입력"],
      ["**팬·광고 관리", "팬 투표 개폐 · 광고 지면 on/off·게재·수익 배분(%)"],
      ["**회원 서비스 /my", "내 생애주기 — 등록·성적·신청·납부·구독·후원 프로필"],
    ],
  },
  "s06": {
    "h": ("AI 서류 자동등록 → 전자결재", "내부 행정의 1번 업무 축 — \"서류를 올리면 폼이 채워진다\""),
    "steps": [("01", "서류 업로드", "스캔·PDF·텍스트"), ("02", "AI 추출", "공식 폼 초안 · 항목별 신뢰도"),
              ("03", "사람 검토·확정", "낮은 신뢰도만 확인·수정"), ("04", "전자결재", "확정하면 제출·결재 시작")],
    "cols": ["원칙", "이유"],
    "rows": [
      ["**AI는 초안만", "사람이 확정해야 결재가 시작된다 — 자동 승인 없음(정부 감사 대비)"],
      ["**지어내지 않는다", "문서에 근거 있는 값만 옮기고, 못 찾으면 비워 사람이 채운다"],
      ["**서식에 안 묶인다", "어떤 공식 서식이 오든 폼 편집기로 등록만 하면 그 폼으로 채운다"],
      ["**사업자 교체 가능", "추출기는 어댑터 — LLM 키 한 줄로 교체, 없으면 안전 기본 추출기"],
    ],
    "co": ("유연성", "체육회 보고·승인 체계가 미팅에서 바뀌어도, 서식·결재선·권한은 설정으로 즉시 반영된다(코드 수정 없음)."),
  },
  "s07": {
    "h": ("데이터 경계와 보안", "한국 N²SF 공개/민감/기밀 등급 적용"),
    "cols": ["등급", "데이터", "접근"], "cw": [16, 54, 30],
    "rows": [
      ["**O 공개", "경기결과·출생연도·승인된 대회·공시·통계", "외부 웹 (전용 DB 역할)"],
      ["**S 민감", "전화·등록서류·결재·수납·보조금·공문", "업무 역할 + 본인"],
      ["**C 기밀", "신분증 해시·건강·징계/도핑·신고자", "추가 통제(다음 단계)"],
    ],
    "co": ("accent", "강제 방식", "외부 웹은 pub 뷰만 읽는 읽기 전용 DB 역할로 접속. 권한은 화면·서버액션·API마다 확인. "
           "자동 검사로 경계 위반을 빌드에서 잡는다. CCCD는 해시만, 만 18세 미만은 공개 제외."),
  },
  "s08": {
    "h": ("종목 구성 (폴더)", "전 종목 43개 반영 · 성/시 지부 1,471개 구조 · 명단 수령 시 데이터만 교체"),
    "cols": ["군", "종목"], "cw": [22, 78],
    "rows": [
      ["**1군 (인기·전략)", "축구·배구·육상·수영·배드민턴·태권도·보비남·농구·e스포츠"],
      ["2군 (올림픽 정규)", "탁구·테니스·복싱·유도·레슬링·역도·양궁·사격·펜싱·사이클·조정·체조·핸드볼·야구 등"],
      ["3군 (지역·무예)", "펜칵실랏·세팍타크로·우슈·가라테·무에타이·주짓수·체스·샹치·당구·볼링·골프 등"],
      ["**4군 (베트남 전통)", "다카오·전통무술 — 네이버·한국에 없는 VSP 차별 폴더"],
      ["별도 축", "장애인체육 — 같은 플랫폼 별도 종목군 vs 분리 (미팅 결정)"],
    ],
    "note": "전 43종목 카탈로그 + 2025 개편 34개 성/시 × 종목 = 성/시 지부 1,471개 구조 구현(코드는 임시, 공식 코드 수령 시 교체). 근거: SEA Games 31 = 40종목.",
  },
  "s09": {
    "h": ("진행 방식", "완성본을 먼저 — 미팅에서 조정, 안 쓸 것만 데이터 단계로"),
    "cols": ["단계", "목표", "완료 기준", "상태"], "cw": [10, 26, 44, 20],
    "rows": [
      ["**P0", "완성본 구현", "전 기능·테스트·빌드 검증", "**완료"],
      ["**P1", "문체부 미팅", "설계 분기 4개 답변 + 서식·명단 수령", "준비됨"],
      ["P2", "구조 확정·IT팀", "요구 반영(설정으로) + 디자인 적용", "대기"],
      ["P3", "파일럿", "등록→대회→결과→정산 실데이터 완주", "대기"],
      ["P4", "전국 확산", "종목별 순차 온보딩", "대기"],
      ["P5", "공개·후원·광고", "미디어·랭킹·스폰서십·광고 활성화", "구현됨(대기)"],
    ],
    "co": ("accent", "P1 설계 분기 4개", "① 국가 전자문서시스템 연동 방식 ② 국가 보조금 시스템 유무 ③ 체육 예산 경로 ④ 장애인체육 편입"),
  },
  "s10": {
    "h": ("운영 방식", "호스팅 · 팀 · 온보딩 · 알림"),
    "cols": ["항목", "내용"], "cw": [20, 80],
    "rows": [
      ["**호스팅", "개발 PGlite → 운영 PostgreSQL (한 줄 교체). 베트남 국내 호스팅 전제(법). 배포 체크리스트(문서 19)"],
      ["**팀 (P2)", "리드1·백엔드2~3·프론트2·디자이너1·현지담당1~2(개발자보다 먼저)·QA1·보안1"],
      ["**온보딩", "하향식 표준 지정 → 협회는 기준데이터·교육만. 엑셀 일괄 업로드+검증"],
      ["**데이터 이관", "기준데이터→조직→사람→등록 순. 중복은 CCCD 해시로 탐지"],
      ["**알림", "Zalo ZNS(베트남 표준). 어댑터만 연결하면 동작"],
    ],
    "co": ("good", "차별점", "VOC 사이트조차 불안정한 현실 — 안정적 운영 + 국내 호스팅 자체가 신뢰의 차별점이 된다."),
  },
  "s11": {
    "h": ("수익 · 지속가능성", "공식 시스템(내부)에는 광고를 두지 않는다 · 플랫폼은 자금을 경유하지 않는다"),
    "cols": ["원천", "위치", "상태", "주의"], "cw": [22, 20, 20, 38],
    "rows": [
      ["광고·네이티브", "외부 웹만", "구현(대기)", "**내부엔 광고 없음 · 수익은 협회 배분"],
      ["후원 중개", "외부+회원", "구현", "**소개만 · 자금 미경유 · 미성년 제외"],
      ["참가비·수수료", "내부", "구현", "PG 수수료만, 자금 미보유"],
    ],
    "co": ("warn", "대외 비공개", "스포츠 토토(한국 KSPO 모델)는 내부 검토만 하고 대외 문서·화면·미팅에서 언급하지 않는다. "
           "초기에 거론되면 정부 협력 자체가 위태로워진다. 공식 지정 시 유지보수 재원을 부처와 합의한다."),
  },
  "s12": {
    "h": ("법·보안·공식 지정 조건", "핵심 규제는 이미 반영, 심사는 착수 필요"),
    "cols": ["항목", "상태"], "cw": [72, 28],
    "rows": [
      ["자금 흐름(납부자→PG→협회) · 시행령 52/2024", "**반영"],
      ["CCCD 해시만 · 생년만 공개 · 만18세 미만 보호 · 13/2023", "**구현"],
      ["첨부 열람 통제 · 감사로그 · 대회 10일 법정기한", "**구현"],
      ["데이터 국내보관 · 개인정보 영향평가 · 정보보안 심사", "확인·착수 필요"],
    ],
    "co": ("accent", "공식 시스템 지정 조건", "① 법적 근거(결정문 명시) ② 표준 서식 지정 ③ 정보보안 심사 "
           "④ 데이터 소유권·운영주체 합의(문서로) ⑤ 국내 호스팅 ⑥ 국가 시스템 연동"),
  },
  "s13": {
    "h": ("리스크와 대응", "가장 큰 병목은 개발이 아니라 공식 서식 수령"),
    "cols": ["리스크", "대응"],
    "rows": [
      ["**공식 서식이 안 온다 (최대 병목)", "미팅 연락에 요청 동봉 · 화면 사진이라도 확보 · 추정 서식 후 교체 · AI 등록이 입력 부담 완화"],
      ["국가 시스템과 중복 구현", "대회개최 등은 국가 포털과 연동, 중복 금지 (P1 확인)"],
      ["범위 확대", "1차 범위 문서 합의 · 결정 의존 기능은 미팅 후"],
      ["데이터 소유권 분쟁", "미팅에서 문서로 못 박음"],
      ["현지 용어 오류(공문 무효)", "원어민 검수를 개발과 동시"],
      ["인력 이탈", "문서화(01~19) + 테스트·CI로 회귀 방지"],
    ],
  },
  "closing": ("다음 단계", "문체부에 1차로 요청할 것",
              ["서식 3종 — 선수등록 · 대회개최 · 사업계획 (원본 Word/Excel)",
               "34개 성/시 코드표 (결의 202/2025 기준)",
               "국가 종목단체 정식 명단 (VOC 회원)",
               "체육회 조직도 · 보고·승인 체계"],
              "완성본은 준비됐다 — 서식이 도착하면 폼 편집기로 건당 1~2시간에 반영. 개발이 아니라 수령이 병목"),
}

VI = {
  "tagline": "Vietnam Sports Platform · Đề án v1.1",
  "cover": ("VIETNAM SPORTS PLATFORM", "Nền tảng Thể thao Việt Nam thống nhất",
            "Hạ tầng thể thao chính thức: gộp mạng hành chính (nội bộ) và web thể thao di động (đối ngoại) trên một dữ liệu",
            "Đề án v1.1 · Đã hoàn thiện & kiểm thử · 09/2026"),
  "s01": {
    "h": ("Tóm tắt một trang", "Hai giao diện, một dữ liệu — đã triển khai 100% trước khi làm việc với Bộ VHTTDL"),
    "lead": "Đưa hành chính thể thao (đăng ký·phê duyệt·thu phí·tài trợ) và truyền thông đại chúng lên cùng một dữ liệu, "
            "dưới hai giao diện: mạng hành chính nội bộ + web di động đối ngoại. Nhập ở nội bộ thì tự hiện ra bên ngoài, "
            "và khi tài liệu được tải lên, AI điền bản nháp vào biểu mẫu chính thức rồi chuyển sang phê duyệt điện tử.",
    "stats": [("0 → 1", "Hệ thống đăng ký thể thao thống nhất đầu tiên"), ("43 môn", "Toàn bộ môn + 1.471 chi hội tỉnh/thành"),
              ("2 mặt", "Nội bộ · Đối ngoại · Dữ liệu chung"), ("Đã kiểm thử", "12 bộ test · ranh giới · build sản xuất OK")],
    "co": ("Hiện trạng", "Hoàn chỉnh và đã kiểm chứng: chức năng·dữ liệu·đa ngôn ngữ (vi/en/ko)·kiểm thử·hiệu năng·build. "
            "Việc còn lại chủ yếu không phải lập trình mà là hiệp thương & dữ liệu (biểu mẫu·mã tỉnh/thành·pháp lý)."),
  },
  "s02": {
    "h": ("Bối cảnh & cơ hội", "Hàn Quốc có nhưng phân tán · Việt Nam còn trống — thiết kế thống nhất cho người đi sau"),
    "cols": ["Chức năng", "Hàn Quốc", "Việt Nam (nay)", "VSP"],
    "rows": [
      ["Đăng ký VĐV·HLV·trọng tài", "Đăng ký điện tử g1", "Không (chỉ link)", "**Đăng ký + duyệt 2 cấp"],
      ["Tài liệu → biểu mẫu", "Nhập tay", "Không", "**AI tự điền (nháp)"],
      ["Chứng nhận·xác thực", "Chứng nhận điện tử g1", "Không", "**Đã có"],
      ["Quản lý·công khai liên đoàn", "Công khai quản trị", "Không", "**Đã có"],
      ["Vận hành giải", "Thông tin giải g1", "Đăng thông tin", "**Duyệt·bốc thăm·kết quả"],
      ["Tài trợ·ngân sách", "KSPO·e나라도움", "Chưa có riêng", "**Toàn chu trình (chặn gian lận)"],
      ["Truyền thông đại chúng", "(Tư nhân) Naver", "Phân tán·MXH", "**Web đối ngoại (nhà nước)"],
    ],
    "co": ("Đòn bẩy", "Liên đoàn không đủ nguồn lực tự xây → trung ương ban hành chuẩn từ trên xuống = đưa toàn bộ môn lên cùng lúc."),
  },
  "s03": {
    "h": ("Cấu trúc — hai giao diện, một dữ liệu", "Nhập ở nội bộ thì tự động hiện ra bên ngoài"),
    "out": ("Đối ngoại · Web di động (apps/portal)",
            ["Kiểu Naver Sports · Không đăng nhập · Có quảng cáo", "Tab môn → lịch·BXH·kết quả·chi tiết trận",
             "Tin·tài trợ·bình chọn", "Chỉ đọc dữ liệu công khai (pub)"]),
    "in": ("Nội bộ · Mạng hành chính (apps/platform)",
           ["Dịch vụ hội viên /my — chỉ hồ sơ của mình", "Nghiệp vụ /admin — liên đoàn·tỉnh/thành·tổng cục·Bộ",
            "Đăng ký AI·phê duyệt điện tử·quản lý nội dung", "Cần đăng nhập"]),
    "databar": "Một dữ liệu — lớp công khai (pub) + lớp gốc (nội bộ). Web đối ngoại kết nối bằng vai trò DB chỉ-đọc chỉ thấy pub "
               "→ dù bị xâm nhập cũng không lộ số điện thoại·CCCD. (Ranh giới cưỡng chế tự động khi build)",
    "co": ("Nguyên tắc số 1", "Không viết bài riêng để quảng bá — nhập nội bộ tự phản ánh ra bên ngoài."),
  },
  "s04": {
    "h": ("Đối ngoại — Web di động", "Phản ánh khảo sát Naver Sports (ưu tiên di động) · đã triển khai đủ"),
    "cols": ["Khu vực", "Thành phần (theo khảo sát Naver)"],
    "rows": [
      ["**Đầu trang 3 tầng", "Tiện ích (công khai·xác thực) / Tab môn / Thanh chức năng (trận·lịch·BXH·VĐV·tin·tài trợ)"],
      ["**Trong môn", "Tin·video·lịch·BXH·kỷ lục → lọc theo giải·mùa (kiểu Naver)"],
      ["**Chi tiết trận", "Kỷ lục·đội hình·cổ vũ·tường thuật·tin·video + bảng kỷ lục theo môn"],
      ["**BXH·kỷ lục", "BXH đội·cá nhân (cột theo môn) · che tên VĐV dưới 18 tuổi"],
      ["**Truyền thông·tương tác", "Tin·bài (tự động/phóng viên) · bình chọn (MVP)·cổ vũ · theo dõi MY team"],
      ["**Tài trợ·doanh thu", "Trưng bày tài trợ (chỉ số theo dõi) · vị trí quảng cáo (chia DT cho liên đoàn)"],
    ],
    "co": ("good", "Thể thao điện tử", "Dữ liệu là một môn, giao diện ưu tiên tựa game — cùng một nền tảng."),
  },
  "s05": {
    "h": ("Nội bộ — Mạng hành chính", "Kiểu g1 (Hàn) + Bộ · văn phòng 1–5 người · ưu tiên di động · đã triển khai đủ"),
    "cols": ["Chức năng", "Nội dung"],
    "rows": [
      ["**Đăng ký tài liệu bằng AI", "Tải tài liệu → AI điền bản nháp → người xác nhận → phê duyệt điện tử (trang sau)"],
      ["**Đăng ký người trong ngành", "VĐV·HLV·trọng tài, biểu mẫu động + duyệt 2 cấp (thời hạn luật định)"],
      ["**Phê duyệt điện tử·công văn", "Soạn·hiệp thương·tiếp nhận·sổ văn bản"],
      ["**Thu phí·tài trợ", "Tiền đi thẳng người nộp→cổng TT→liên đoàn · tài trợ toàn chu trình (chặn gian lận)"],
      ["**Hành chính nội dung", "Viết·duyệt bài (phê duyệt)·tin tự sinh · thẻ phóng viên · nhập tường thuật·video"],
      ["**Quản lý fan·quảng cáo", "Mở/đóng bình chọn · bật/tắt·chạy quảng cáo·chia doanh thu (%)"],
      ["**Dịch vụ hội viên /my", "Vòng đời cá nhân — đăng ký·thành tích·hồ sơ·nộp phí·theo dõi·hồ sơ tài trợ"],
    ],
  },
  "s06": {
    "h": ("Đăng ký tài liệu bằng AI → Phê duyệt điện tử", "Trục nghiệp vụ số 1 — \"tải tài liệu lên là biểu mẫu được điền\""),
    "steps": [("01", "Tải tài liệu", "scan·PDF·văn bản"), ("02", "AI trích xuất", "bản nháp · độ tin cậy từng mục"),
              ("03", "Người xác nhận", "chỉ soát mục tin cậy thấp"), ("04", "Phê duyệt điện tử", "xác nhận thì nộp·bắt đầu duyệt")],
    "cols": ["Nguyên tắc", "Lý do"],
    "rows": [
      ["**AI chỉ làm bản nháp", "Phải có người xác nhận mới bắt đầu duyệt — không tự duyệt (phòng kiểm toán)"],
      ["**Không bịa", "Chỉ chuyển giá trị có căn cứ; không thấy thì để trống cho người điền"],
      ["**Không trói vào biểu mẫu", "Biểu mẫu nào đến, chỉ cần đăng ký ở trình soạn là điền được"],
      ["**Thay nhà cung cấp được", "Bộ trích xuất là adapter — đổi bằng một khóa LLM, không có thì dùng bộ mặc định"],
    ],
    "co": ("Linh hoạt", "Nếu hệ thống báo cáo·phê duyệt thay đổi tại họp, biểu mẫu·luồng duyệt·phân quyền phản ánh ngay bằng cấu hình (không sửa mã)."),
  },
  "s07": {
    "h": ("Ranh giới dữ liệu & bảo mật", "Áp dụng phân cấp Công khai/Nhạy cảm/Mật (tham chiếu N²SF Hàn Quốc)"),
    "cols": ["Cấp", "Dữ liệu", "Truy cập"], "cw": [16, 54, 30],
    "rows": [
      ["**O Công khai", "Kết quả·năm sinh·giải đã duyệt·công khai·thống kê", "Web đối ngoại (vai trò riêng)"],
      ["**S Nhạy cảm", "Điện thoại·hồ sơ·phê duyệt·thu phí·tài trợ·công văn", "Vai trò nghiệp vụ + chính chủ"],
      ["**C Mật", "Băm CCCD·sức khỏe·kỷ luật/doping·người tố giác", "Kiểm soát bổ sung (sau)"],
    ],
    "co": ("accent", "Cách cưỡng chế", "Web đối ngoại chỉ đọc view pub bằng vai trò DB riêng. Quyền kiểm tra ở từng màn·action·API. "
           "Kiểm tra tự động bắt vi phạm ngay khi build. CCCD chỉ băm, dưới 18 tuổi không công khai."),
  },
  "s08": {
    "h": ("Cơ cấu môn thể thao", "Đủ 43 môn · cấu trúc 1.471 chi hội tỉnh/thành · nhận danh sách thì chỉ thay dữ liệu"),
    "cols": ["Nhóm", "Môn"], "cw": [24, 76],
    "rows": [
      ["**Nhóm 1 (trọng điểm)", "Bóng đá·bóng chuyền·điền kinh·bơi·cầu lông·taekwondo·vovinam·bóng rổ·thể thao điện tử"],
      ["Nhóm 2 (Olympic)", "Bóng bàn·quần vợt·boxing·judo·vật·cử tạ·bắn cung·bắn súng·đấu kiếm·xe đạp·đua thuyền·TDDC·bóng ném·bóng chày…"],
      ["Nhóm 3 (khu vực·võ)", "Pencak Silat·cầu mây·wushu·karate·muay·jujitsu·cờ vua·cờ tướng·bi-a·bowling·golf…"],
      ["**Nhóm 4 (truyền thống VN)", "Đá cầu·võ cổ truyền — thư mục khác biệt của VSP (Naver·Hàn không có)"],
      ["Trục riêng", "Thể thao người khuyết tật — cùng nền tảng (nhóm riêng) hay tách (quyết tại họp)"],
    ],
    "note": "Danh mục đủ 43 môn + 34 tỉnh/thành (cải cách 2025) × môn = cấu trúc 1.471 chi hội (mã tạm, thay khi có mã chính thức). Căn cứ: SEA Games 31 = 40 môn.",
  },
  "s09": {
    "h": ("Cách triển khai", "Hoàn thiện trước — điều chỉnh tại họp, chỉ phần phụ thuộc quyết định để lại"),
    "cols": ["GĐ", "Mục tiêu", "Tiêu chí hoàn thành", "Trạng thái"], "cw": [8, 26, 46, 20],
    "rows": [
      ["**P0", "Triển khai bản hoàn chỉnh", "Đủ chức năng·kiểm thử·build", "**Xong"],
      ["**P1", "Họp với Bộ", "Trả lời 4 nhánh + nhận biểu mẫu·danh sách", "Sẵn sàng"],
      ["P2", "Chốt cấu trúc·đội IT", "Phản ánh yêu cầu (cấu hình) + áp thiết kế", "Chờ"],
      ["P3", "Thí điểm", "Đăng ký→giải→kết quả→quyết toán (dữ liệu thật)", "Chờ"],
      ["P4", "Mở rộng toàn quốc", "Đưa từng môn lên tuần tự", "Chờ"],
      ["P5", "Công khai·tài trợ·QC", "Truyền thông·BXH·tài trợ·bật quảng cáo", "Đã làm (chờ bật)"],
    ],
    "co": ("accent", "4 nhánh thiết kế (P1)", "① Kết nối văn bản điện tử quốc gia ② Có hệ thống tài trợ quốc gia? ③ Đường ngân sách TT ④ Đưa TT khuyết tật vào?"),
  },
  "s10": {
    "h": ("Cách vận hành", "Hạ tầng · đội ngũ · onboarding · thông báo"),
    "cols": ["Hạng mục", "Nội dung"], "cw": [20, 80],
    "rows": [
      ["**Hạ tầng", "Dev PGlite → PostgreSQL (đổi một dòng). Máy chủ trong nước (luật). Checklist triển khai (tài liệu 19)"],
      ["**Đội ngũ (P2)", "1 lead·2–3 backend·2 frontend·1 designer·1–2 phụ trách bản địa·1 QA·1 bảo mật"],
      ["**Onboarding", "Chuẩn từ trên xuống → liên đoàn chỉ lo dữ liệu gốc·đào tạo. Tải Excel hàng loạt + kiểm tra"],
      ["**Di trú dữ liệu", "Dữ liệu gốc→tổ chức→người→đăng ký. Trùng lặp phát hiện bằng băm CCCD"],
      ["**Thông báo", "Zalo ZNS (chuẩn VN). Chỉ cần nối adapter là chạy"],
    ],
    "co": ("good", "Khác biệt", "Ngay cả trang VOC còn thiếu ổn định — vận hành ổn định + máy chủ trong nước tự nó là điểm khác biệt tạo niềm tin."),
  },
  "s11": {
    "h": ("Doanh thu · bền vững", "Hệ thống chính thức (nội bộ) không quảng cáo · nền tảng không giữ tiền"),
    "cols": ["Nguồn", "Vị trí", "Trạng thái", "Lưu ý"], "cw": [22, 20, 18, 40],
    "rows": [
      ["Quảng cáo·native", "Chỉ web đối ngoại", "Đã có (chờ bật)", "**Nội bộ không QC · DT chia cho liên đoàn"],
      ["Trung gian tài trợ", "Đối ngoại+hội viên", "Đã có", "**Chỉ kết nối · không qua tiền · loại trẻ VTN"],
      ["Phí tham gia·dịch vụ", "Nội bộ", "Đã có", "Chỉ phí cổng TT, không giữ tiền"],
    ],
    "co": ("warn", "Không nêu đối ngoại", "Cá cược thể thao (mô hình KSPO Hàn) chỉ nghiên cứu nội bộ, không nêu trong tài liệu·màn hình·cuộc họp. "
           "Nêu sớm có thể gây rủi ro hợp tác nhà nước. Khi được chỉ định, thống nhất kinh phí duy trì với Bộ."),
  },
  "s12": {
    "h": ("Pháp lý · bảo mật · điều kiện chỉ định chính thức", "Quy định cốt lõi đã phản ánh, thẩm định cần khởi động"),
    "cols": ["Hạng mục", "Trạng thái"], "cw": [72, 28],
    "rows": [
      ["Dòng tiền (người nộp→cổng TT→liên đoàn) · NĐ 52/2024", "**Đã phản ánh"],
      ["Chỉ băm CCCD · chỉ công khai năm sinh · bảo vệ dưới 18 · 13/2023", "**Đã có"],
      ["Kiểm soát xem tệp · nhật ký kiểm toán · thời hạn 10 ngày", "**Đã có"],
      ["Lưu dữ liệu trong nước · đánh giá DLCN · thẩm định ATTT", "Cần xác nhận·khởi động"],
    ],
    "co": ("accent", "Điều kiện chỉ định chính thức", "① Căn cứ pháp lý (quyết định của Bộ) ② Chỉ định biểu mẫu chuẩn ③ Thẩm định ATTT "
           "④ Thống nhất chủ sở hữu dữ liệu·đơn vị vận hành (văn bản) ⑤ Máy chủ trong nước ⑥ Kết nối hệ thống quốc gia"),
  },
  "s13": {
    "h": ("Rủi ro & ứng phó", "Nút thắt lớn nhất không phải lập trình mà là nhận biểu mẫu chính thức"),
    "cols": ["Rủi ro", "Ứng phó"],
    "rows": [
      ["**Không nhận được biểu mẫu (nút thắt lớn nhất)", "Gửi kèm yêu cầu khi liên hệ họp · lấy ảnh chụp · dùng mẫu tạm rồi thay · AI giảm gánh nhập liệu"],
      ["Trùng lặp với hệ thống quốc gia", "Tổ chức giải… kết nối cổng quốc gia, không làm trùng (xác nhận P1)"],
      ["Phình phạm vi", "Thống nhất phạm vi đợt 1 bằng văn bản · chức năng phụ thuộc để sau họp"],
      ["Tranh chấp sở hữu dữ liệu", "Chốt bằng văn bản tại cuộc họp"],
      ["Sai thuật ngữ bản địa (công văn vô hiệu)", "Rà soát bởi người bản ngữ song song phát triển"],
      ["Nhân sự nghỉ việc", "Tài liệu hóa (01–19) + kiểm thử·CI chống hồi quy"],
    ],
  },
  "closing": ("Bước tiếp theo", "Đề nghị Bộ cung cấp (đợt 1)",
              ["3 biểu mẫu — đăng ký VĐV · tổ chức giải · kế hoạch (bản gốc Word/Excel)",
               "Bảng mã 34 tỉnh/thành (Nghị quyết 202/2025)",
               "Danh sách chính thức các liên đoàn quốc gia (hội viên VOC)",
               "Sơ đồ tổ chức · hệ thống báo cáo·phê duyệt"],
              "Bản hoàn chỉnh đã sẵn sàng — biểu mẫu đến là phản ánh trong 1–2 giờ/mẫu. Nút thắt là tiếp nhận, không phải lập trình"),
}

# ── 실제 화면 (스크린샷) — 앱이 vi 로켈이라 이미지 공용, 캡션만 언어별 ──
S = "docs/screens/"
KO["screens"] = [
  {"num": "부록 1", "title": "실제 화면 — 대외 웹", "sub": "베트남어(vi) · 데스크톱 · 데모 데이터로 렌더된 실제 화면", "cols": 2, "items": [
    (S+"01-home.png", "홈 — 광고·통계·43종목·순위"),
    (S+"02-scoreboard.png", "경기 — 상태 배지(예정/진행/종료)"),
    (S+"04-match-relay.png", "경기상세 — 문자중계 타임라인"),
    (S+"05-rankings.png", "순위 — 팀/득점 순위판")]},
  {"num": "부록 2", "title": "실제 화면 — 후원·단체·대시보드", "sub": "", "cols": 3, "items": [
    (S+"06-sponsorship.png", "후원 쇼케이스(연락처 비공개)"),
    (S+"07-orgs.png", "단체 디렉토리(성/시 개수 배지)"),
    (S+"08-admin-dashboard.png", "내부 업무 대시보드")]},
  {"num": "부록 3", "title": "실제 화면 — AI 서류 자동등록 (핵심)", "sub": "서류 → AI 초안 → 사람 확정 → 전자결재", "cols": 2, "items": [
    (S+"09-admin-ingest.png", "AI 등록 대기함 — 신뢰도 88%"),
    (S+"10-admin-ingest-review.png", "AI 검토 — 항목별 신뢰도 배지")]},
  {"num": "부록 4", "title": "실제 화면 — 콘텐츠·팬투표·광고", "sub": "", "cols": 3, "items": [
    (S+"11-admin-content.png", "콘텐츠·기사검수·기자자격"),
    (S+"12-admin-polls.png", "팬 투표(MVP) 관리"),
    (S+"13-admin-ads.png", "광고 지면·수익 배분")]},
]
VI["screens"] = [
  {"num": "PL 1", "title": "Giao diện thực tế — Web đối ngoại", "sub": "Tiếng Việt · desktop · dữ liệu demo (ảnh chụp thật)", "cols": 2, "items": [
    (S+"01-home.png", "Trang chủ — QC·thống kê·43 môn·BXH"),
    (S+"02-scoreboard.png", "Trận đấu — nhãn trạng thái"),
    (S+"04-match-relay.png", "Chi tiết trận — tường thuật"),
    (S+"05-rankings.png", "BXH — đội / vua phá lưới")]},
  {"num": "PL 2", "title": "Giao diện — Tài trợ·Tổ chức·Bảng điều khiển", "sub": "", "cols": 3, "items": [
    (S+"06-sponsorship.png", "Tài trợ (ẩn liên hệ)"),
    (S+"07-orgs.png", "Danh bạ tổ chức (số chi hội)"),
    (S+"08-admin-dashboard.png", "Bảng điều khiển nội bộ")]},
  {"num": "PL 3", "title": "Giao diện — Đăng ký tài liệu bằng AI (cốt lõi)", "sub": "Tài liệu → AI nháp → người xác nhận → phê duyệt điện tử", "cols": 2, "items": [
    (S+"09-admin-ingest.png", "Chờ xác nhận — độ tin cậy 88%"),
    (S+"10-admin-ingest-review.png", "Kiểm tra AI — độ tin cậy từng mục")]},
  {"num": "PL 4", "title": "Giao diện — Nội dung·Bình chọn·Quảng cáo", "sub": "", "cols": 3, "items": [
    (S+"11-admin-content.png", "Nội dung·duyệt bài·thẻ PV"),
    (S+"12-admin-polls.png", "Quản lý bình chọn (MVP)"),
    (S+"13-admin-ads.png", "Quảng cáo·chia doanh thu")]},
]
