# 02. 베트남 체육 행정·플랫폼 현황 분석

> 조사일: 2026-09-09

---

## 1. 베트남 체육 거버넌스 구조

```
Bộ Văn hóa, Thể thao và Du lịch (문화체육관광부, MoCST / bvhttdl.gov.vn)
   │
   ├─ Cục Thể dục Thể thao Việt Nam (베트남 체육총국 → 국(局)으로 격하 개편)
   │     · 영문: Sports Authority of Viet Nam (SAV)
   │     · 주소: 36 Trần Phú, Điện Biên, Hà Nội / vptongcuc@tdtt.gov.vn
   │     · 근거: 2025.3.11. 문화체육관광부 장관 결정 619/QĐ-BVHTTDL
   │     · 역할: 국가 행정관리, 전국선수권·청소년선수권 개최, 선수·지도자·심판
   │             양성 프로그램 지침, 전문 체육시설 등록 지침
   │
   ├─ Ủy ban Olympic Việt Nam (VOC, 베트남올림픽위원회 / voc.org.vn, IOC 코드 VIE)
   │     · 구성: 문체부·체육계 지도부 + 국가 종목연맹/협회 대표 + 성/시 대표
   │             + 언론·과학기술·교육기관 + 저명 선수·지도자
   │     · 대부분의 국가급 Liên đoàn(연맹)/Hiệp hội(협회)가 VOC 회원
   │
   ├─ 국가 종목별 연맹·협회 (Liên đoàn / Hiệp hội thể thao quốc gia)
   │     예: VFF(축구), 배구연맹, 태권도연맹, Vovinam연맹, 육상연맹 등
   │     └─ 성/시 단위 연맹 (Liên đoàn thể thao tỉnh/thành phố)
   │
   └─ Sở Văn hóa, Thể thao (và Du lịch) — 성/시 문화체육국
         ※ 2025.7.1부터 63개 → 34개(28성+6중앙직할시)로 통합 (결의 202/2025/QH15)
         ※ 군(huyện)급 폐지, 지방정부 2단계(성-사) 전환 진행 중
         └─ 사/방(xã/phường) 단위 → 클럽·학교·팀
```

## 2. 현행 웹 서비스 현황 (tdtt.gov.vn 실사)

**현재 메뉴 구조 (사실상 "뉴스 사이트" 수준)**
- Trang chủ(홈) / Giới thiệu(소개: 연혁·조직·기능) / Chỉ đạo điều hành(지도·운영)
- Tin tức(뉴스: 국내 스포츠 / 국제 스포츠 / 기타) / Văn bản(법령·문서)
- Media(사진·영상) / Thông báo(공지) / Liên hệ(연락처)
- 외부 링크: 법령 시스템, 공공서비스 포털, 공식 이메일, 생활체육, 훈련 지침, 디지털화

### 결론: **행정 업무 시스템이 없다**
| 기능 | 한국 | 베트남 (현재) |
|---|---|---|
| 선수/지도자/심판 통합 등록 | ✅ g1 포털 (온라인 다단계 승인) | ❌ 없음 — 각 연맹 개별 엑셀/종이 |
| 통합 선수 DB·검색 | ✅ 선수통합검색 | ❌ 없음 |
| 전자결재·전자보고 | ✅ 포털 + e나라도움 | ❌ 공문·우편·이메일 첨부 (수기) |
| 대회 승인·엔트리·기록 | ✅ 승인대회/대회관리시스템 | △ 결정문 기반 오프라인 절차 |
| 예산·정산 온라인 처리 | ✅ e나라도움 | ❌ 국가 재정시스템(TABMIS)은 정부 내부용, 연맹은 미연결 |
| 경영공시(투명성) | ✅ 의무 공시 | ❌ 없음 |
| 클럽/동호인 관리 | ✅ 스포츠클럽포털 | ❌ 없음 |
| 대중용 스포츠 미디어 | ❌ (민간 네이버/다음이 담당) | ❌ (민간 언론이 산발적) |

> **핵심 기회**: 한국은 "이미 만들어진 여러 시스템을 통합해야 하는" 문제를, 베트남은 **"백지에서 통합 설계할 수 있는"** 기회를 갖고 있다. 우리가 만드는 것이 곧 표준이 된다.

## 3. 베트남 법·제도상 반드시 반영해야 할 요건

### 3-1. 대회 개최 승인 (Luật Thể dục Thể thao)
- 근거: 체육법 제38~40조 / 행정절차: 2026년 결정 109/QĐ-BVHTTDL로 신규·개정·폐지 절차 공표
- **국제대회(지역·대륙·세계선수권) 유치**: 국가 종목연맹이 **개최 희망 연도 전년 7월 1일까지** Cục TDTT에 제안서 제출 → 취합·조정
- **국내 고성과 대회**: 신청서에 목적·일시·장소·**재정계획·시설·안전대책** 명시 + 대회 규정(điều lệ) + 경기 프로그램 + 조직위원 명단 첨부
- **처리기한: 완전한 서류 접수 후 10일 이내 Cục TDTT 국장이 개최 결정**
- 성/시급 대회는 Sở VHTT가 승인 (하노이 등 각 성 포털에 절차 게시)

> **플랫폼 기능으로 직결**: 대회 신청 폼을 위 법정 서류 항목 그대로 구조화하고, **10일 SLA 카운트다운**과 **7월 1일 마감 알림**을 시스템이 자동 관리해야 한다. 이것만으로도 Cục TDTT가 플랫폼을 쓸 이유가 생긴다.

### 3-2. 전자결제·전자문서 인프라 (2026 현재 성숙)
| 항목 | 베트남 현황 | 플랫폼 적용 |
|---|---|---|
| 전자서명 | **VNPAY-CA** 등 모바일 디지털 서명. 자필서명+법인인감과 동등한 법적 효력 (정보통신부 규정) | 결재 승인에 법적 효력 부여 → 종이 공문 대체 가능 |
| 전자세금계산서 | Nghị định 123 + Thông tư 78. TVAN 사업자(VNPAY-Invoice 등) 통해 세무당국 연계, 10년 보관 | 등록비·참가비 수납 시 자동 발행 |
| 결제 게이트웨이 | VNPAY-QR, MoMo, ZaloPay, VietQR. QR 결제가 사실상 국민 표준 | 회비·참가비·강습료 수납 |
| 전자계약 | VNPAY 전자계약 솔루션 등 상용화 | 후원 계약·선수 계약·시설 임대 |
| 개인 전자ID | VNeID (국가 전자신분) | 본인인증 = 선수 중복등록·연령 조작 방지의 결정적 수단 |

> **한국보다 유리한 점**: 한국의 e나라도움은 정부 전용이라 민간이 못 들어가지만, 베트남은 **VNPAY/MoMo + VNeID + 전자세금계산서**를 민간 플랫폼이 바로 조립할 수 있다. 즉 우리가 "베트남판 e나라도움 + g1포털 + 네이버스포츠"를 한 번에 만들 수 있다.

### 3-3. 데이터·개인정보
- Nghị định 13/2023/NĐ-CP (개인정보보호령, PDPD) — 민감정보(건강·생체) 처리 시 동의·통지 의무
- 사이버보안법(Luật An ninh mạng) — **베트남 국내 데이터 저장(현지화)** 요구 → 서버는 베트남 리전(VNG Cloud, Viettel IDC, FPT Cloud) 또는 AWS/GCP 싱가포르+베트남 이중화 검토 필요
- 미성년 선수(유소년) 데이터 → 보호자 동의 플로우 필수

## 4. 베트남 스포츠 콘텐츠 소비 특성 (플랫폼 성공 조건)
- 축구(특히 대표팀·V.League) 압도적 1위 → **축구를 트래픽 엔진으로 삼고 나머지 종목이 그 트래픽에 얹혀 가는 구조**
- Facebook·Zalo·TikTok·YouTube 중심 소비 → **웹사이트로 끌어오기보다, 소셜로 배포하고 데이터는 플랫폼에 축적**하는 전략
- 모바일 우선(저사양 기기·데이터 요금 민감) → 경량 웹·PWA 필수
- SEA Games/ASIAD/Olympic 시즌에 트래픽 폭증 → 스파이크 대응 아키텍처

## 출처
- [Cục Thể dục thể thao Việt Nam (bvhttdl.gov.vn)](https://bvhttdl.gov.vn/tong-cuc-the-duc-the-thao-606347.htm)
- [Cơ cấu tổ chức của Cục Thể dục thể thao (Báo Văn Hóa)](https://baovanhoa.vn/the-thao/co-cau-to-chuc-cua-cuc-the-duc-the-thao-2678.html)
- [Cục Thể dục thể thao (Wikipedia tiếng Việt)](https://vi.wikipedia.org/wiki/C%E1%BB%A5c_Th%E1%BB%83_d%E1%BB%A5c_th%E1%BB%83_thao_(Vi%E1%BB%87t_Nam))
- [tdtt.gov.vn 공식 포털](https://tdtt.gov.vn/)
- [Ủy ban Olympic Việt Nam](https://bvhttdl.gov.vn/uy-ban-olympic-viet-nam-9817.htm)
- [VOC 조직 구조](http://voc.org.vn/vi-vn/gioi-thieu/mo-hinh-co-cau-to-chuc.aspx)
- [Quyết định 109/QĐ-BVHTTDL 2026 (체육 행정절차 공표)](https://luatvietnam.vn/hanh-chinh/quyet-dinh-109-qd-bvhttdl-2026-cong-bo-thu-tuc-hanh-chinh-moi-sua-doi-va-bai-bo-trong-the-duc-the-thao-424443-d1.html)
- [국가 체육회에 대한 국가관리 기능 (Báo Chính phủ)](https://baochinhphu.vn/chuc-nang-quan-ly-nha-nuoc-ve-the-duc-the-thao-doi-voi-hoi-the-thao-quoc-gia-102260105155005432.htm)
- [스포츠 이벤트 개최 허가 절차](https://longphanpmt.com/giay-phep-to-chuc-su-kien-the-thao/)
- [하노이 Sở VHTT 대회 개최 행정절차](https://sovhtt.hanoi.gov.vn/quan-ly/thu-tuc-dang-cai-giai-thi-dau-tran-thi-dau-the-thao-thanh-tich-cao-khac-do-lien-doan-the-thao-tinh-thanh-pho-truc-thuoc-trung-uong-to-chuc/)
- [VNPAY-CA 전자서명](https://vnpayca.vn/) / [VNPAY-QR 결제 게이트웨이](https://vnpay.vn/Cong-thanh-toan-VNPAY-QR-0myhb8a9f2qm)
