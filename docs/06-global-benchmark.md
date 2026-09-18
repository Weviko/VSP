# 06. 전 세계 유사 시스템 벤치마크 — 무엇을 훔쳐올 것인가

> 조사일: 2026-09-09 / 확장 비전(세계 최대 체육 플랫폼 · 개인 스폰서십 · 스포츠토토 · 베트남 전자행정 선례) 반영

---

## 1. 한눈에 보는 5대 벤치마크

| 시스템 | 국가/주체 | 규모 | 우리가 가져올 핵심 |
|---|---|---|---|
| **FIFA Connect ID Service** | FIFA (전 세계) | **4,200만 개 ID 발급** (선수·지도자·심판) | 글로벌 단일 ID 체계. 국가등록시스템(NRS)을 국제 ID에 연결하는 방식 |
| **COMET** (Analyticom) | 6개 대륙, 최다 축구협회 채택 | 대륙연맹+국가협회 동시 지원 | 상용 축구 행정 시스템의 완성형. 10세 이상 전원 FIFA ID 자동 부여 |
| **Sport:80 / SportLoMo** | 영국·아일랜드, 다수 NGB | 종목별 국가연맹 SaaS | NGB SaaS 표준 기능셋. 디지털 회원증(모바일 월렛), 다층 멤버십, 감사추적 |
| **NSRS / Khelo India** | 인도 정부(SAI, 청소년체육부) | 국가 선수 저장소 | **개발도상국 정부 주도 성공 사례.** KID 발급, 지도자-선수 태깅, 훈련센터 대시보드 |
| **Opendorse** | 미국 (NIL 마켓플레이스) | 대학선수 스폰서십 | **개인 스폰서십 중개의 청사진.** Athlete Rate Card, 팬·브랜드 직접 제안, 자동 컴플라이언스 |

추가 참조: **Estonia X-Road**(25개국 채택 전자정부 데이터 교환 표준), **WADA ADAMS**(도핑 관리 국제 표준).

---

## 2. FIFA Connect — 국제 ID 전략 (중요도 3/3)

**사실**
- FIFA Connect ID Service는 사람과 조직(협회·클럽·시설)에 **글로벌 식별자(FIFA ID)** 부여
- 지금까지 **4,200만 개 이상** 발급
- 회원협회(MA)는 자국 **National Registration System(NRS)** 을 Connect ID Service에 기술 연동해야 함
- 두 가지 선택지: **FIFA Connect Platform(협회에 무료)** 또는 **COMET(상용)**
- COMET은 등록된 10세 이상 전원에게 FIFA ID 자동 부여

**우리에게 주는 의미**
1. **축구는 이미 국제 표준이 존재한다.** VFF가 FIFA Connect Platform이나 COMET을 쓰고 있거나 쓸 예정일 가능성이 높다.
2. 따라서 **축구를 정면으로 대체하려 들면 안 된다.** 축구는 **연동(데이터 수신)** 하고, **나머지 40~50개 종목을 우리가 장악**하는 것이 현실적이다.
3. 그러나 **ID 체계 설계는 FIFA Connect를 그대로 모방**해야 한다. "베트남 스포츠 ID(가칭 VSID)"를 만들고 종목 무관 전 국민에게 부여, 나중에 FIFA·다른 국제연맹 ID와 매핑.
4. **이것이 세계 최대 체육 플랫폼 비전의 실제 경로다.** FIFA는 축구 하나로 4,200만 ID를 만들었다. 우리가 **전 종목 통합 ID**를 만들면, 축구가 아닌 영역에서는 세계 어디에도 이만한 규모가 없다.

> 위험: FIFA ID와 연동하려면 VFF를 통한 FIFA 승인이 필요하고 시간이 오래 걸린다. Phase 1에서는 **자체 ID로 시작하고 매핑 필드만 비워두는 것**이 안전하다.

---

## 3. COMET / Sport:80 / SportLoMo — 기능 체크리스트

이 세 시스템이 공통으로 갖고 있는데 우리 청사진(문서 04)에 **아직 없었던** 기능:

| 기능 | 출처 | 왜 넣어야 하나 |
|---|---|---|
| **디지털 회원증 (Apple/Google Wallet 저장)** | Sport:80 | 선수증을 지갑에 넣고 대회장에서 QR로 체크인. 체감 만족도 최고 |
| **배경조회(Background check) 관리** | Sport:80 | 유소년 지도자 자격 심사. 아동 안전 이슈 대응, 국제 기준 |
| **동의(consent) 이력 관리** | Sport:80 | 개인정보령(PDPD 13/2023) 대응의 실체 |
| **다층 멤버십 동시 구매** | Sport:80 | 선수가 협회비 + 클럽비를 **한 번에 결제**, 자동 분배 |
| **국제 멤버십 처리** | SportLoMo | 외국인 선수·해외 교민 등록 |
| **예측 AI 대시보드** | Sport:80 | 정부 보고용 인사이트 (참여율 추이, 이탈 예측) |
| **대륙연맹 - 국가협회 계층 동시 운영** | COMET | 나중에 ASEAN 확장 시 동일 구조 필요 |
| **10세 이상 자동 ID 부여** | COMET | 유소년부터 ID를 심는 것 = 평생 데이터 해자 |

---

## 4. 인도 NSRS / Khelo India — 우리와 조건이 가장 비슷한 사례 (중요도 3/3)

**사실**
- 인도 체육청(SAI) 운영, 청소년체육부 산하. Khelo India 국가체육개발계획의 일부
- 선수·지도자·스포츠과학자·아카데미가 **직접 가입**하는 개방형 플랫폼
- 가입 완료 시 **고유번호 KID(Khelo India ID)** 자동 생성
- **지도자가 자기 훈련생을 태깅**하고, 국가연맹(NSF) 승인 지표로 성과를 입력·모니터링
- 훈련센터마다 대시보드 제공, 소속 지도자·선수를 종목별로 등록

**우리에게 주는 의미**
1. 인구·소득 수준·행정 여건이 베트남과 유사한 나라에서 **정부 주도로 이미 작동 중**이다. Cục TDTT 설득 시 가장 강력한 레퍼런스.
2. "지도자가 선수를 태깅하고 성과를 입력한다"는 구조는 **데이터 입력 부담을 분산**시키는 영리한 설계. 협회 사무국 1~3명에 의존하지 않는다.
3. **아카데미/훈련센터를 독립 주체로 인정**한 점. 베트남도 사설 아카데미가 늘고 있어 유효.

> 추가 제안: 인도는 "선수 발굴(talent identification)"을 국가 목표로 삼아 체력측정 데이터까지 수집한다. 베트남도 SEA Games/ASIAD 성적이 국가 관심사이므로, **유소년 체력측정·재능발굴 모듈**은 정부를 설득하는 결정적 카드가 될 수 있다.

---

## 5. Opendorse — 개인 스폰서십 중개 청사진 (중요도 3/3)

**사실**
- 모든 선수가 프로필을 가짐. 프로필 = "개인 브랜드의 이력서" (성적·기록·성격·SNS 지표)
- **Athlete Rate Card(ARC)**: 사인회·출연·SNS 게시물 등 항목별 **시장 표준 요율**을 시스템이 제시
- 팬·브랜드·후원자가 검색 → 제안(pitch) → 수락 → **결제까지 앱 안에서 완결**
- 이름·소속·팀·종목·포지션으로 필터 검색
- 딜 완료 시 **소속 기관에 자동 공시**, 자격 유지(컴플라이언스) 보장

**우리 플랫폼에 옮기는 방법**
```
[선수 등록 모듈]  --자동-->  [공개 프로필]  --옵션 ON-->  [스폰서십 마켓플레이스]
   행정 데이터                성적·기록·사진            요율표 · 제안 · 계약 · 결제
   (이미 있음)                (이미 있음)               (신규 = 순수 추가 수익)
```
**결정적 장점**: Opendorse는 선수 데이터를 직접 모아야 했지만, **우리는 행정 시스템이 데이터를 이미 만들어 준다.** 등록된 선수 전원이 잠재 스폰서십 대상이 되고, 성적이 갱신되면 프로필 가치도 자동 갱신된다.

**위험 (반드시 사전 정리)**
| 위험 | 설명 | 대응 |
|---|---|---|
| 아마추어 자격 충돌 | 일부 종목·국제연맹은 선수의 상업 활동을 제한 | 종목별 규정 확인, 협회 승인 게이트 |
| 미성년 선수 | 유소년 스폰서십은 윤리·법적으로 민감 | 만 18세 미만 기본 차단 또는 보호자+협회 이중 승인 |
| 협회와 수익 충돌 | 협회 스폰서와 개인 스폰서가 경쟁 브랜드일 수 있음 | 협회 우선권·배타조항 관리 기능 |
| 세무 | 선수 개인 소득에 대한 개인소득세 원천징수 | 전자세금계산서·원천징수 자동화 |
| 착취 위험 | 정보 비대칭으로 선수가 저평가 계약 | ARC 요율표 공개 + 표준계약서 제공 |

---

## 6. 스포츠토토(베팅) — 냉정한 현실 점검 (중요도 2/3, 위험 3/3)

**베트남 법 현황 (사실)**
- 근거 법령: **Nghị định 06/2017/NĐ-CP** (2017.1.24) + 개정 **151/2018/NĐ-CP**
- 허용 대상: **경마 · 개 경주 · 국제 축구** 세 가지뿐
- 국제 축구 베팅은 **FIFA가 인정·인증한 국제 경기·대회**만 대상
- **Vietlott**(베트남 전자복권공사)이 재무부로부터 국제 축구 베팅 사업 허가를 받음. EPL·라리가·분데스리가·리그1·세리에A 등으로 확대 제안
- 2024년 국회 상임위 결의 **1035/NQ-UBTVQH15**로 Nghị định 06 개정을 2025년까지 완료하도록 요구. 즉 **제도 변화가 진행 중**

**결론 3줄**
1. **베트남 국내 스포츠(V.League 포함) 대상 베팅은 현재 불법이다.** 한국 스포츠토토처럼 국내 리그 베팅을 하는 것은 지금 법으로 불가능하다.
2. 베팅 사업은 **국가 독점(Vietlott) + 재무부 허가** 구조다. 민간 플랫폼이 사업자가 되는 길은 사실상 없다.
3. 따라서 현실적 포지션은 **"베팅 사업자"가 아니라 "공식 경기 데이터 공급자"** 다.

> 그래서 진짜 기회는 이것: 스포츠 베팅이 합법화되려면 **신뢰할 수 있는 공식 경기 데이터**가 반드시 필요하다(경기 결과·기록의 공적 원천). 그 데이터를 유일하게 갖게 되는 것이 우리다. Sportradar·Stats Perform이 전 세계에서 하는 일이 정확히 그것이며, 이들의 사업은 베팅 회사보다 안정적이다.
> **전략: 지금은 데이터를 완벽하게 쌓고, 법이 열릴 때 유일한 공인 데이터 소스로 협상 테이블에 앉는다.**

**절대 주의**: 사업 초기에 "베팅"을 전면에 내세우면 **Cục TDTT·VOC와의 협약이 무산될 수 있다.** 정부 파트너십과 베팅 사업은 초기에 양립하기 어렵다. 베팅은 **내부 문서에만 남기고 대외적으로는 언급하지 않는 것**을 강력히 권한다.

---

## 7. Estonia X-Road — "베트남 전자행정의 선례" 비전의 기술적 근거 (중요도 2/3)

**사실**
- 2001년 구축된 에스토니아 전자정부의 핵심 데이터 교환 계층
- **450개 이상** 공공·민간 조직 연결, **3,000개 이상** 디지털 서비스 구동
- **25개국 이상**이 오픈소스로 채택. 사실상 국제 표준
- 핵심 철학: **"데이터는 생성된 곳에 존재한다(Data resides where it is created)"**, 중앙 마스터DB 없는 분산형
- 북유럽 3국(에스토니아·아이슬란드·핀란드)이 만든 비영리 NIIS가 관리

**우리에게 주는 의미**
1. "이게 성공하면 베트남 전체 행정시스템으로 확장" 비전은 **X-Road 모델을 따르면 실현 가능**하다.
2. 즉, 우리 플랫폼을 처음부터 **"체육 전용 앱"이 아니라 "행정 업무의 재사용 가능한 블록"** 으로 설계해야 한다:
   - 조직 계층 관리 / 다단계 전자결재 / 전자서명 / 전자수납 / 보고서 자동생성 / 감사추적
   - 이 6개 블록은 **체육이든 문화든 교육이든 관광이든 똑같이 쓰인다**
3. 체육에서 검증 → 문화국·관광국으로 수평 확장 → **"베트남 행정 SaaS"** 로 진화하는 경로.

> 설계 지침: 도메인 로직(종목·대회·선수)과 행정 플랫폼 로직(조직·결재·결제·문서)을 **코드 레벨에서 분리**할 것. 이 분리를 Phase 1에 안 해두면 나중에 확장이 불가능하다. 비용은 초기 10~15% 추가, 효과는 사업 확장성 전체.

---

## 8. 문서 04(청사진)에 추가할 기능 — 이번 조사로 도출된 12개

| # | 기능 | 출처 | 우선순위 |
|---|---|---|---|
| C1 | 통합 스포츠 ID(VSID) + 국제 ID 매핑 필드 | FIFA Connect | Phase 1 |
| C2 | 디지털 회원증(모바일 월렛 + QR 체크인) | Sport:80 | Phase 1 |
| C3 | 다층 멤버십 동시 결제·자동 분배 | Sport:80 | Phase 1 |
| C4 | 동의(consent) 이력 관리 | Sport:80 / PDPD | Phase 1 |
| C5 | 지도자에서 선수로 태깅 및 성과 입력 | NSRS 인도 | Phase 2 |
| C6 | 훈련센터·아카데미 독립 주체 등록 | NSRS 인도 | Phase 2 |
| C7 | 유소년 체력측정·재능발굴 모듈 | NSRS 인도 | Phase 3 (정부 설득 카드) |
| C8 | 배경조회·아동안전 자격 심사 | Sport:80 | Phase 2 |
| C9 | **개인 스폰서십 마켓플레이스 + 요율표(ARC)** | Opendorse | Phase 4 |
| C10 | 표준계약서·전자계약·원천징수 | Opendorse + VNPAY | Phase 4 |
| C11 | 공인 경기데이터 API(베팅·미디어 대상) | Sportradar | Phase 5 |
| C12 | **행정 코어 / 체육 도메인 코드 분리** | X-Road | **Phase 1 필수 (구조 결정)** |

## 출처
- [FIFA Connect 프로그램 개요](https://inside.fifa.com/advancing-football/fifa-connect/about) / [FIFA Connect ID Service 연동 개요](https://support.id.ma.services/support/solutions/articles/7000095959-00-integration-overview) / [NRS 마이그레이션](https://support.id.ma.services/support/solutions/articles/7000089251-migration-to-a-new-national-registration-system-nrs-)
- [COMET (Analyticom)](https://www.analyticom.de/products/comet/) / [COMET FIFA ID](https://kb.analyticom.de/comet/comet-fifa-id)
- [Sport:80 플랫폼](https://www.sport80.com/uk/platform) / [Sport:80 멤버십 관리](https://www.sport80.com/features/membership-management) / [SportLoMo 연맹용](https://sportlomo.com/national-sports-and-federations/)
- [NSRS 소개 (Khelo India)](https://nsrsold.kheloindia.gov.in/home/about) / [NSRS 포털](https://nsrs.kheloindia.gov.in/) / [Khelo India (Wikipedia)](https://en.wikipedia.org/wiki/Khelo_India)
- [Opendorse](https://biz.opendorse.com/home/) / [Opendorse NIL 마켓플레이스](https://biz.opendorse.com/blog/new-nil-marketplace/)
- [Nghị định 06/2017/NĐ-CP 원문](https://vanban.chinhphu.vn/default.aspx?pageid=27160&docid=188143) / [Vietlott 국제축구 베팅 허가 (Thanh Niên)](https://thanhnien.vn/vietlott-se-duoc-tham-gia-dat-cuoc-bong-da-hop-phap-1851541547.htm) / [스포츠 베팅 법적 틀](https://www.chinhsachphapluat.vn/hanh-lang-phap-ly-cho-dat-cuoc-the-thao-va-kinh-doanh-dat-cuoc-the-thao/)
- [X-Road와 디지털 주권 (Nortal)](https://nortal.com/insights/why-digital-sovereignty-matters-and-how-x-road-makes-it-happen) / [글로벌 DPI 모델 (Atlantic Council)](https://www.atlanticcouncil.org/in-depth-research-reports/issue-brief/global-dpi-models-lessons-from-india-brazil-and-beyond/)
