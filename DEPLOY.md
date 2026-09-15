# 배포 가이드 (Render.com, 무료)

이 문서는 포도와농장 배송앱을 인터넷에 올려서 휴대폰에서 언제 어디서나 접속할 수 있게
만드는 절차입니다. **GitHub 저장소 + Render.com** 조합을 사용합니다(둘 다 무료).

## 1) GitHub 계정 만들고 저장소 생성

1. [github.com](https://github.com) 접속 → 회원가입 (무료).
2. 로그인 후 우측 상단 **+** → **New repository**.
3. Repository name: `podowa-delivery-app` (원하는 이름으로 바꿔도 됨)
4. **Private**로 설정(고객 관련 코드이니 공개 저장소로 하지 마세요)
5. "Add a README file" 등 다른 옵션은 **체크하지 말고** 그대로 **Create repository** 클릭.
6. 생성된 저장소 페이지에 나오는 주소를 기억해두세요.
   `https://github.com/<사용자이름>/podowa-delivery-app.git` 형태입니다.

## 2) 코드를 GitHub에 올리기 (Claude Code에게 요청)

Claude Code 세션에 "GitHub 저장소 만들었어, 주소는 https://github.com/... 야. 여기로 푸시해줘"
라고 말씀하시면 나머지는 자동으로 처리됩니다. 이 과정에서 브라우저 로그인 창이 뜨면
직접 로그인/가입해주시면 됩니다(Claude가 대신 로그인하지 않습니다).

## 3) Render.com 가입 및 서비스 생성

1. [render.com](https://render.com) 접속 → **"Get Started"** → **GitHub으로 가입**
   (1번에서 만든 GitHub 계정으로 로그인하면 비밀번호를 새로 안 만들어도 됩니다)
2. 로그인 후 대시보드에서 **New** → **Web Service**
3. 방금 만든 GitHub 저장소(`podowa-delivery-app`)를 선택하고 연결(처음엔 GitHub 권한
   승인 화면이 뜰 수 있습니다 — 승인해주세요)
4. 설정 화면에서:
   - **Name**: 원하는 이름 (예: `podowa-delivery`) → 이게 주소가 됩니다:
     `https://podowa-delivery.onrender.com`
   - **Region**: Singapore (한국에서 가장 가까움)
   - **Instance Type**: **Free** 선택
   - Render가 `Dockerfile`을 자동으로 인식합니다. 별도 빌드/시작 명령어 입력 불필요.

## 4) 환경변수(Environment Variables) 설정

같은 화면(또는 생성 후 "Environment" 탭)에서 아래 값들을 하나씩 추가하세요.
**Key**와 **Value**를 정확히 입력해주세요.

| Key | Value | 비고 |
|---|---|---|
| `NODE_ENV` | `production` | |
| `SHARED_PASSWORD` | (직접 정하세요, 예: `podowa2026!`) | 가족이 로그인할 비밀번호. `test1234`보다 강하게 권장 |
| `SESSION_SECRET` | `6902a251162720195437cefd85115008b48c27c4d18d0018b2efc0ccea98bd65` | 이미 만들어둔 랜덤 값, 그대로 쓰면 됨 |
| `TMAP_REST_APP_KEY` | (발급받은 TMap appKey) | 백엔드 전용, 절대 남에게 공유 금지 |
| `TMAP_ROUTE_OPT_SIZE` | `20` | 신청한 경유지최적화 상품 크기와 맞추기 |
| `FARM_NAME` | `포도와농장` | |
| `FARM_ADDRESS` | `경기도 용인시 처인구 백암면 백원로525번길 300` | |
| `GEOCODE_CACHE_TTL_HOURS` | `12` | |
| `VITE_TMAP_JS_APP_KEY` | (TMap appKey, 위와 같은 값) | **지도 표시용 — 반드시 넣어야 지도가 뜸** |

> ⚠️ `VITE_TMAP_JS_APP_KEY`를 빼먹으면 예전에 겪으셨던 "지도 화면 멈춤" 문제가 다시
> 나타납니다. Render는 이 환경변수를 Docker 빌드 인자로도 자동 전달해주므로
> (Dockerfile의 `ARG VITE_TMAP_JS_APP_KEY`가 받음) 따로 설정할 건 없고, 이 표에
> 값만 입력해주시면 됩니다.

## 5) 배포

**Create Web Service** 버튼을 누르면 자동으로 빌드가 시작됩니다. 5~10분 정도 걸릴 수
있습니다. 빌드 로그에 오류 없이 끝나면 화면 상단에 나오는 `https://xxx.onrender.com`
주소로 접속해보세요.

## 6) 확인

1. 휴대폰 데이터(LTE/5G)로 — 즉, 집 와이파이가 아닌 상태로 — 그 주소에 접속해보세요.
   어디서나 접속되면 성공입니다.
2. 로그인 → 엑셀 업로드 → 지도 확인 → 경로 계산까지 한 번 쭉 테스트해보세요.
3. 휴대폰 브라우저에서 "홈 화면에 추가"를 하면 앱처럼 아이콘으로 바로 열 수 있습니다.

## 참고: 무료 요금제 특성

- 15분 동안 아무도 접속하지 않으면 서버가 잠깁니다. 그 상태에서 접속하면 **30초 정도
  깨어나는 시간**이 걸립니다(첫 화면 로딩이 느림). 이후 요청부터는 빠릅니다.
- 배송할 때만 가끔 켜서 쓰는 이 앱 특성상 크게 불편하지 않을 것으로 예상하지만,
  불편하시면 유료 "Starter" 플랜(월 $7)으로 업그레이드하면 항상 켜져 있습니다.

## 코드를 수정한 뒤 다시 배포하려면

GitHub 저장소에 새 커밋을 푸시하면 Render가 **자동으로 다시 빌드/배포**합니다.
Claude Code에게 "수정한 내용 GitHub에 푸시해줘"라고 요청하시면 됩니다.

## TMap 대시보드 도메인 제한 (선택)

TMap 앱 대시보드에 도메인 제한 설정이 있다면, 새로 생긴 `https://xxx.onrender.com`
주소를 허용 목록에 추가해두면 더 안전합니다.
