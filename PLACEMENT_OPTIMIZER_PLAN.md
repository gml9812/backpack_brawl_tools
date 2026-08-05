# Backpack Brawl Star 배치 최적화 프로그램 구현 계획서

## 0. 문서의 목적과 다음 세션 시작 지침

이 문서는 별도의 대화 컨텍스트 없이도 다음 작업자가 현재 프로젝트에 **Backpack Brawl Star 배치 최적화 프로그램**을 구현할 수 있도록 작성한 단일 기준 문서다.

다음 세션에서는 작업을 시작하기 전에 반드시 이 문서 전체와 현재 `README.md`, `index.html`, `data.js`, `styles.css`, `tests/`를 읽는다. 기존 상점 확률 계산기는 작동 중인 별도 기능이므로 회귀를 일으키지 않는다. 구현 중 게임 규칙이나 원본 데이터가 이 문서와 충돌하면 추측으로 진행하지 말고, 공식 게임 페이지와 실제 게임 화면을 우선 확인한 뒤 이 문서의 `확인 필요 사항`에 결과를 기록한다.

이 계획의 기준 결정은 다음과 같다.

- 런타임은 기존 프로젝트와 동일하게 HTML, CSS, JavaScript만 사용한다.
- 서버, 로그인, 데이터베이스, 빌드 도구, 프레임워크는 사용하지 않는다.
- `file://`로 직접 열어도 작동하는 완전한 오프라인 도구로 만든다.
- 아이템 이름은 영어만 지원한다.
- UI는 장식보다 사용성을 우선하고 모바일에서도 사용할 수 있게 한다.
- 보드는 **9열 × 6행의 54칸 전체가 항상 활성화된 상태**로 고정한다.
- 실제 가방 아이템의 모양, 가방 슬롯 생성, 가방 버프와 가방 중첩은 MVP 범위에서 제외한다.
- 입력된 일반 아이템은 전부 배치해야 한다. 일부 아이템만 선택해 배치하는 배낭 가치 최적화 문제는 다루지 않는다.
- 1차 목표는 유효한 Star 연결을 최대화하는 것이다. 전투 피해량이나 승률은 계산하지 않는다.
- 기존 사이트를 런타임에 호출하거나 iframe으로 의존하지 않는다. 필요한 게임 데이터는 프로젝트에 로컬로 보관한다.

---

## 1. 목표

사용자가 영어 아이템 목록과 각 수량을 선택하면 프로그램이 모든 아이템을 9×6 보드 안에 겹치지 않게 배치하고 회전시켜, 아이템들의 유효한 Star 연결 수가 최대가 되는 배치를 찾는다.

최종 화면은 최소한 다음을 제공해야 한다.

1. 선택한 모든 아이템이 배치된 9×6 결과 보드
2. 각 아이템의 실제 이미지와 회전 상태
3. 활성화된 Star와 비활성화된 Star의 시각적 구분
4. 총 Star 연결 점수, 활성화된 효과 그룹 수, 활성화에 기여한 아이템 수
5. 아이템별 상세 표: 어떤 Star 효과가 어떤 대상 아이템으로 활성화됐는지
6. 계산 상태: `Optimal`, `Best found`, `No feasible arrangement`, `Invalid data`
7. 계산 시간과 탐색한 상태 수
8. 같은 입력으로 다시 계산하거나 결과 배치를 복사할 수 있는 재현 가능한 상태

프로그램은 “최적”이라고 증명한 경우에만 `Optimal`을 표시한다. 시간 제한 때문에 탐색을 중단했으면 더 좋은 결과가 없다고 단정하지 않고 `Best found within N seconds`라고 표시한다.

---

## 2. 현재 프로젝트 상태와 영향 범위

현재 폴더는 Backpack Brawl 상점 확률 계산기다.

- `index.html`: 기존 계산기 UI
- `styles.css`: 기존 계산기 전체 스타일
- `data.js`: 게임 6.0.1 기준 상점 후보 274개와 이미지 경로. 현재 필드는 대체로 `id`, `name`, `rarity`, `hero`, `bag`, `status`, `weight`, `image`뿐이다.
- `calculator.js`: 확률 계산 엔진
- `catalog.js`, `catalog-worker.js`: 다음 상점 아이템 목록 계산
- `simulation-worker.js`: 확률 시뮬레이션 작업자
- `app.js`, `app-v2.js`: 기존 UI 제어
- `assets/items/`: 기존 아이템 이미지
- `scripts/build-data.ps1`, `scripts/refine-official-shared.ps1`: 상점 후보와 이미지를 갱신하는 개발용 스크립트
- `tests/`: Node 기반 무의존성 테스트

현재 `data.js`에는 배치 최적화에 필수인 다음 정보가 없다.

- 아이템 footprint(차지하는 상대 격자 좌표)
- 회전 가능 방향
- 아이템 유형 태그
- Star의 상대 좌표
- 각 Star 효과가 요구하는 대상 유형
- 하나의 아이템에 Star 효과 그룹이 여러 개인 경우의 그룹 구분

따라서 기존 `data.js`를 억지로 확장하지 말고 최적화 전용 데이터 파일을 별도로 둔다. 기존 계산기 파일은 공통 내비게이션 추가 외에는 가급적 수정하지 않는다.

권장 신규 파일 구조:

```text
optimizer.html
optimizer.css                 # 공통 스타일로 충분하면 생략 가능
optimizer-data.js             # globalThis.BB_OPTIMIZER_DATA
optimizer-core.js             # 순수 좌표/회전/점수 계산
optimizer-solver.js           # 탐색 및 최적화 엔진
optimizer-worker.js           # UI가 멈추지 않게 solver 실행
optimizer-app.js              # DOM, 입력, 결과 렌더링
scripts/build-optimizer-data.ps1
tests/optimizer-data.test.js
tests/optimizer-core.test.js
tests/optimizer-solver.test.js
tests/optimizer-structure.test.js
tests/optimizer-performance.test.js
```

`optimizer.html`을 별도 페이지로 만드는 이유는 기존 확률 계산기의 폼과 결과 DOM이 이미 크고, 두 도구의 상태와 Worker가 서로 영향을 주지 않게 하기 위해서다. `index.html` 헤더에는 단순한 `Star Optimizer` 링크를, `optimizer.html`에는 `Shop Odds` 링크를 추가한다.

---

## 3. MVP 범위

### 포함

- 9×6 전체 활성 보드
- 영어 이름 검색
- 아이템 이미지가 포함된 선택 목록
- 동일 아이템 여러 개 추가 및 개별 삭제
- 모든 입력 아이템의 배치
- 0°, 90°, 180°, 270° 회전
- 경계 및 아이템 겹침 검사
- Star 상대 좌표 회전
- Star 대상 유형 검사
- Star 연결 점수 최대화
- 계산 취소
- 시간 제한 안에서 가장 좋은 중간 결과 표시
- 아이템별 활성 Star 상세 정보
- 데스크톱 및 모바일 UI
- 완전 오프라인 실행
- 결정적 재현을 위한 고정 seed 또는 입력 기반 seed

### 제외

- 실제 가방 아이템이 만드는 슬롯과 가방 효과
- 잠긴/비활성 슬롯
- 전투 시뮬레이션, DPS, 생존 시간, 승률
- 아이템 레벨별 전투 수치
- 제작 레시피 자동 병합
- 상점 구매 순서 및 골드 최적화
- 상대방 보드
- 로그인, 저장 계정, 서버 공유
- 이미지 인식으로 게임 스크린샷 자동 입력
- 아이템을 일부 버리거나 선택하는 부분집합 최적화
- Boon처럼 보드에 놓이지 않는 요소
- 게임 중 영구 스탯 변화나 전투 중 생성되는 아이템

### 가방 아이템 처리

9×6 전체 슬롯이 이미 활성화됐다고 가정하므로 MVP 아이템 선택기에서 `Bag` 유형은 제외한다. 가방 아이템을 일반 아이템처럼 넣으면 “슬롯을 제공하기 위해 공간을 차지하는” 실제 게임 규칙과 고정 보드 가정이 충돌한다. 추후 가방 효과만 별도 버프로 모델링하려면 별도 기능으로 추가한다.

---

## 4. 게임 규칙의 계산 모델

### 4.1 좌표계

- 보드 좌상단을 `(0, 0)`으로 한다.
- `x`는 오른쪽으로 0~5, `y`는 아래쪽으로 0~8이다.
- 셀 인덱스는 `index = y * 9 + x`, 범위는 0~53이다.
- 54비트 점유 마스크는 JavaScript `BigInt`로 표현할 수 있다.
- 아이템의 원본 anchor는 데이터에 저장된 footprint의 최소 좌상단 `(0, 0)`이다.
- footprint는 직사각형 크기만 저장하지 말고 실제 점유 셀 목록으로 저장한다. 비직사각형 아이템도 처리할 수 있어야 한다.

### 4.2 아이템 배치

아이템 인스턴스 하나는 다음 상태를 가진다.

```js
{
  instanceId: "wooden-sword#2",
  itemId: "wooden-sword",
  x: 2,
  y: 4,
  rotation: 90
}
```

배치는 다음 조건을 모두 만족해야 한다.

- 회전된 footprint의 모든 셀이 보드 안에 있다.
- 다른 아이템의 footprint와 한 칸도 겹치지 않는다.
- 입력된 모든 인스턴스가 정확히 한 번 배치된다.
- 총 footprint 면적이 54를 초과하면 탐색하지 않고 즉시 오류를 반환한다.
- 면적이 54 이하더라도 모양 때문에 패킹할 수 없으면 `No feasible arrangement`를 반환한다.

### 4.3 회전

원본 상대 좌표 `(dx, dy)`의 90도 시계 방향 회전은 원본 경계를 기준으로 변환한다. 구현에서는 footprint와 Star 좌표를 함께 회전한 뒤 전체 좌표의 최소 `x`, 최소 `y`가 0이 되도록 정규화한다. 단순히 width와 height만 바꾸면 Star offset이 틀어질 수 있으므로 테스트로 검증한다.

대칭 아이템은 중복 회전 후보를 제거한다. 예를 들어 1×1 아이템은 0° 하나만, 1×2 직선 아이템은 0°와 90°만 유지한다. footprint뿐 아니라 Star 그룹까지 같아야 같은 회전으로 간주한다.

### 4.4 Star 그룹

아이템 하나에 서로 다른 문구와 대상 조건을 가진 Star 효과가 여러 개 있을 수 있으므로, Star를 단일 배열로 합치지 않는다.

권장 데이터 모델:

```js
{
  id: "example-item",
  name: "Example Item",
  image: "assets/items/example-item.webp",
  hero: "shared",
  rarity: "Epic",
  types: ["Accessory"],
  footprint: [[0, 0], [1, 0]],
  rotations: [0, 90, 180, 270],
  starGroups: [
    {
      id: "faster-weapons",
      label: "Star Weapons are faster",
      offsets: [[-1, 0], [0, -1], [1, -1]],
      target: { anyTypes: ["Melee", "Ranged", "Weapon"] },
      scoreMode: "unique-target"
    }
  ],
  source: {
    url: "https://...",
    verifiedOn: "YYYY-MM-DD"
  }
}
```

대상 조건은 장기적으로 다음 표현을 지원할 수 있게 한다.

```js
target: {
  anyTypes: ["Food", "Potion"],
  allTypes: [],
  excludedTypes: [],
  anyItemIds: [],
  excludedItemIds: [],
  anyHeroIds: []
}
```

MVP에서는 실제 데이터에 필요한 연산만 구현하되, 문자열 설명을 파싱해서 런타임에 판정하지 않는다. 대상 조건은 데이터 생성 시 구조화한다.

### 4.5 Star 활성화 판정

기준 규칙:

1. source 아이템의 회전된 Star offset 하나가 target 아이템 footprint의 셀 하나 이상과 겹친다.
2. target 아이템이 해당 Star 그룹의 유형/아이템 조건을 만족한다.
3. source와 target은 서로 다른 인스턴스다.
4. 동일한 source Star 그룹의 여러 Star 셀을 동일 target이 덮어도 **연결은 1회만** 센다.
5. 동일 target이 서로 다른 source 아이템 또는 서로 다른 Star 그룹을 활성화하면 각각 별도 연결로 센다.
6. 보드 밖으로 나간 Star offset은 존재할 수 있지만 어떤 target도 활성화하지 못한다.
7. Star 셀은 공간을 차지하지 않으며 다른 Star 셀과 겹쳐도 된다.

예시:

- A의 동일 그룹 Star 세 칸을 B 하나가 모두 덮음 → 1점
- A의 Star를 B와 C가 각각 덮음 → 2점
- A와 D가 각각 B를 가리킴 → 2점
- A의 서로 다른 두 그룹을 B가 모두 만족 → 그룹 규칙이 실제 게임에서 독립적이라면 2점

마지막 사례는 데이터 수집 단계에서 실제 게임 표시와 반드시 대조한다.

---

## 5. 목적 함수와 동률 처리

“Star를 최대한 활성화”를 구현자가 다르게 해석하지 않도록 점수를 사전식(lexicographic)으로 정의한다.

### 1차 목적

`validConnections`: 모든 source 인스턴스의 모든 Star 그룹에서 생성된 고유한 `(sourceInstanceId, groupId, targetInstanceId)` 연결 수를 최대화한다.

### 2차 목적

`activeGroups`: 유효 target이 하나 이상 존재하는 `(sourceInstanceId, groupId)` 수를 최대화한다.

### 3차 목적

`contributingTargets`: 적어도 하나의 Star 연결 대상이 된 서로 다른 target 인스턴스 수를 최대화한다.

### 4차 목적

결과를 안정적으로 만들기 위한 결정적 tie-break를 적용한다.

1. 전체 배치의 bounding box 면적이 작은 것
2. 위쪽, 왼쪽에 더 밀집된 것
3. `instanceId`, `rotation`, `y`, `x` 순으로 직렬화한 문자열이 사전순으로 작은 것

UI의 대표 점수는 1차 목적 값이다. 2~4차는 동점 배치 선택에만 사용한다.

추후 “중요 아이템 가중치”, “특정 효과 우선”, “DPS 기반 점수”를 추가할 수 있지만 MVP에는 넣지 않는다.

---

## 6. 데이터 확보 계획

### 6.1 데이터 범위

기존 `data.js`는 상점에 직접 등장하는 후보만 포함하므로 최적화 데이터의 원본으로 충분하지 않다. 배치 가능한 일반/영웅/제작/Unique/Relic 아이템 가운데 실제 사용자가 보드에 놓을 수 있는 아이템을 별도 카탈로그로 구축한다. Boon과 보드 밖 요소는 제외한다. Bag은 데이터에는 보존할 수 있지만 `selectable: false`로 둔다.

필수 필드:

- 안정적인 영문 slug/id
- 영어 이름
- 영웅 또는 shared
- 희귀도
- 아이템 유형 태그 전체
- 이미지 로컬 경로
- footprint 상대 좌표
- Star 그룹별 상대 좌표
- Star 그룹별 대상 조건
- 지원 회전 방향
- 데이터 출처 URL, 게임 버전, 검증일
- `selectable`, `dataStatus` (`verified`, `partial`, `unsupported`)

### 6.2 출처 우선순위

1. 실제 최신 게임 클라이언트에서 보이는 아이템 레이아웃과 설명
2. 공식 Backpack Brawl 아이템 라이브러리와 패치 노트
3. Backpack Brawl Pro의 아이템 페이지와 Builder
4. 공식 Wiki
5. 커뮤니티 자료는 교차검증 용도로만 사용

Backpack Brawl Pro Builder 공유 URL이 아이템 slug, x/y 좌표, 회전각을 직렬화하는 사실은 결과 링크 포맷 참고에 유용하다. 그러나 공개 API와 재사용 허가가 확인되지 않았으므로 사이트를 런타임 데이터 서비스처럼 사용하지 않는다.

### 6.3 데이터 조사 스파이크를 먼저 수행

전체 UI를 만들기 전에 다음 대표 아이템 10~15개로 데이터 파이프라인을 검증한다.

- 1×1, Star 없음
- 1×1, Star 1개
- 1×2 또는 2×1
- 2×2 이상
- 비직사각 footprint
- Star가 footprint에서 멀리 떨어진 아이템
- 특정 유형만 받는 Star
- 여러 Star 그룹을 가진 아이템
- 회전 대칭 아이템
- Unique 또는 제작 아이템

각 페이지 HTML/내장 JSON/스크립트에서 구조화된 footprint와 Star 좌표가 노출되는지 확인한다.

- 구조화된 데이터가 있으면 `scripts/build-optimizer-data.ps1`에서 추출한다.
- 레이아웃이 SVG라면 SVG 좌표와 class/alt를 파싱한다.
- 레이아웃이 래스터 이미지뿐이면 자동 OCR/이미지 추론을 정답 데이터로 사용하지 않는다. 수동 검증 테이블을 작성하고 `manualOverrides`를 적용한다.
- 대상 유형 조건이 설명 문자열에만 있으면 자동 자연어 파싱 결과를 그대로 배포하지 말고 검증 목록을 생성한다.

### 6.4 출력 형식

`optimizer-data.js`는 `file://` 호환을 위해 JSON fetch가 아닌 다음 형식을 사용한다.

```js
globalThis.BB_OPTIMIZER_DATA = {
  version: "6.0.1",
  verifiedOn: "YYYY-MM-DD",
  board: { columns: 9, rows: 6 },
  types: [/* 정규화된 유형 목록 */],
  items: [/* optimizer item records */],
  sources: [/* 출처 */]
};
```

개발용 원본 또는 override가 커지면 `scripts/optimizer-overrides.json`을 두어도 되지만, 최종 런타임은 생성된 JS만 읽는다.

### 6.5 데이터 품질 게이트

선택 가능한 모든 아이템은 다음을 만족해야 한다.

- id와 영어 이름이 유일함
- 이미지 파일 존재
- footprint가 비어 있지 않고 중복 좌표 없음
- footprint가 `(0, 0)` 기준으로 정규화됨
- 모든 type이 허용 목록에 존재
- 모든 Star 그룹 id가 아이템 내부에서 유일함
- Star offsets에 중복 좌표 없음
- target 조건이 빈 경우 `any item`인지 명시됨
- 모든 회전을 적용해도 좌표 변환이 정수이며 원본 면적 유지
- 공식/실게임 검증 상태가 `verified`

필드가 불완전한 아이템은 검색 결과에 “Unsupported”로 흐리게 표시하고 추가 버튼을 비활성화한다. 불완전한 데이터를 조용히 1×1 또는 any-type으로 추정해서는 안 된다.

---

## 7. 최적화 알고리즘 설계

### 7.1 기본 방향

이 문제는 polyomino packing과 방향성 Star 관계 점수 최대화가 결합된 조합 최적화 문제다. 입력이 커질수록 경우의 수가 급증하므로 다음의 하이브리드 전략을 사용한다.

1. 전처리와 후보 생성
2. 빠른 초기 feasible 해 생성
3. branch-and-bound exact 탐색
4. 시간 제한에 도달하면 현재 best 해 반환
5. 탐색 공간을 모두 소진했을 때만 optimal 증명

### 7.2 전처리

각 item definition에 대해 모든 고유 회전을 미리 계산한다.

각 item instance와 회전별로 보드의 모든 anchor 위치를 순회해 다음 후보를 만든다.

```js
{
  instanceIndex,
  rotation,
  x,
  y,
  occupancyMask,          // 54-bit BigInt
  starMasksByGroup,       // 보드 밖 Star는 제거
  canonicalKey
}
```

전처리 중 수행할 가지치기:

- 경계를 벗어나는 footprint 제거
- 대칭 회전 중복 제거
- 완전히 동일한 인스턴스들의 순열 대칭 제거
- Star가 없는 아이템은 패킹 제약에 집중해 후보 순서를 단순화
- 남은 빈 공간의 연결 성분 크기로 남은 footprint가 들어갈 수 없는 상태 조기 제거

### 7.3 인스턴스 선택 순서

MRV(Minimum Remaining Values) 원칙을 사용한다. 현재 점유 상태에서 legal placement가 가장 적은 미배치 인스턴스를 다음으로 선택한다. 동률이면 다음 순서로 우선한다.

1. footprint 면적이 큰 아이템
2. Star 그룹/Star offset이 많은 아이템
3. 대상 유형이 희귀한 아이템
4. instance id 순

동일 아이템 여러 개는 instance 순서를 강제하고 이전 동일 인스턴스의 후보 인덱스 이상만 선택하도록 해 순열 중복을 줄인다.

### 7.4 빠른 초기 해

branch-and-bound의 하한을 높이기 위해 먼저 짧은 greedy/randomized 탐색을 수행한다.

- 가장 제약이 큰 아이템부터 배치
- 현재 추가되는 Star 연결과 향후 연결 가능성을 함께 점수화
- 동일 점수 후보는 입력 기반 deterministic pseudo-random seed로 분산
- 여러 번 재시작
- feasible 배치를 찾은 뒤 단일 아이템 이동/회전, 두 아이템 위치 교환을 이용한 local improvement

초기 해를 못 찾았다고 불가능으로 결론 내리지 않는다. exact 탐색이 패킹 불가능을 증명해야 한다.

### 7.5 증분 점수 계산

새 아이템을 놓을 때 모든 배치를 처음부터 재평가하지 않는다.

- 새 아이템이 기존 source들의 Star target이 되는 연결
- 새 아이템이 source가 되어 기존 아이템들을 target으로 삼는 연결

두 방향만 추가한다. 상태에는 이미 생성된 연결 key 집합 또는 압축 bitset을 유지한다. backtracking 시 undo할 수 있도록 각 단계에서 추가된 연결 목록만 stack에 저장한다.

### 7.6 상한 계산과 가지치기

안전한 상한만 사용한다. 상한이 실제 가능 점수보다 작으면 최적해를 잘못 제거하므로, 불확실한 휴리스틱은 후보 정렬에만 사용한다.

기본 상한:

- 현재 확정 점수
- 배치된 source 그룹이 남은 각 target 인스턴스와 만들 수 있는 최대 연결 수
- 미배치 source 그룹이 전체 target 인스턴스와 만들 수 있는 이론적 최대 연결 수
- 유형 조건상 절대 연결될 수 없는 source-target 쌍 제외

상한이 현재 best의 사전식 점수 이하이면 분기를 종료한다.

추가 안전 가지치기:

- 남은 아이템 총면적 > 빈 셀 수
- 특정 큰 footprint가 들어갈 legal 후보 0개
- 빈 공간 연결 성분별 수용 불가능
- memoized 상태가 동일하거나 더 좋은 점수로 이미 방문됨

transposition key에는 단순 occupancy만 쓰면 안 된다. 같은 점유 마스크라도 어떤 아이템이 어디에 놓였는지에 따라 Star 점수가 달라진다. 배치된 instance와 placement canonical key를 포함한 안정적인 hash를 사용하며, 메모리 상한을 둔다.

### 7.7 시간 및 자원 제한

권장 기본값:

- 빠른 탐색: 1초
- 표준 탐색: 5초
- 정밀 탐색: 20초
- 사용자가 취소 가능
- Worker 진행 메시지: 최대 100~200ms 간격
- transposition table: 대략 50~100MB를 넘지 않도록 entry 수 제한/LRU 또는 세대 교체

모바일에서는 메모리와 발열을 고려해 표준 5초를 기본으로 하고 20초 모드는 경고를 표시한다. 브라우저 탭이 background로 가면 시간 측정은 `performance.now()` 기준으로 처리한다.

### 7.8 Worker 프로토콜

UI thread와 solver를 분리한다.

```js
// UI -> Worker
{ type: "solve", requestId, instances, options, dataVersion }
{ type: "cancel", requestId }

// Worker -> UI
{ type: "progress", requestId, elapsedMs, explored, bestScore, bestLayout }
{ type: "complete", requestId, status, elapsedMs, explored, score, layout }
{ type: "error", requestId, code, message }
```

이전 계산 이후 새 계산이 시작되면 requestId가 다른 메시지는 무시한다. Worker 자체 종료 후 재생성도 취소 수단으로 허용한다.

---

## 8. UI/UX 계획

### 8.1 화면 구조

데스크톱:

```text
[Shop Odds] [Star Optimizer]

[아이템 선택/현재 목록]     [9×6 결과 보드]
[검색 및 필터]             [점수 / 상태 / 계산 시간]
[선택된 아이템 목록]       [아이템별 Star 연결 상세]
[계산 옵션 / Calculate]
```

모바일:

1. 아이템 선택
2. 선택된 아이템 목록
3. Calculate 버튼
4. 결과 요약
5. 실제 게임 UI 방향의 가로형 9×6 보드
6. 상세 연결 목록

결과 보드는 9열 가로형이며 모바일에서도 가로 스크롤 없이 표시한다. 이미지가 작아지는 대신 아이템을 탭하면 해당 아이템과 Star 연결을 강조하고 아래 상세 카드에 큰 이미지를 표시한다.

### 8.2 아이템 입력

- 검색은 영어 이름 부분 일치, 대소문자 무시
- 영웅과 유형 필터 제공
- 결과마다 이미지, 영어 이름, 영웅, 유형 표시
- `+` 버튼으로 추가
- 선택된 목록에서 `−`, `+`, 삭제 제공
- 동일 아이템은 수량으로 묶어 표시하되 solver 입력 시 고유 instance로 확장
- 선택 개수, 총 footprint 면적 `/ 54`를 항상 표시
- 면적 54 초과 시 Calculate 비활성화
- unsupported/bag 아이템은 이유 tooltip 제공
- 초기 예제 목록을 제공하되 자동 선택하지 않음

### 8.3 계산 옵션

MVP에 노출할 옵션은 최소화한다.

- Search quality: Fast / Standard / Thorough
- 선택적 deterministic seed 입력은 고급 설정에 둘 수 있음
- `Calculate optimal placement`
- 계산 중 `Cancel`

사용자에게 내부 알고리즘 옵션이나 가중치를 노출하지 않는다.

### 8.4 결과 보드

- CSS Grid 9×6
- 각 item footprint 위에 이미지가 실제 셀 비율에 맞게 렌더링
- 회전은 `transform: rotate(...)`만 믿지 말고 회전된 footprint bounding box에 맞춰 위치/크기를 계산
- 활성 Star: 선명한 노란색 또는 녹색
- 비활성 Star: 회색 윤곽
- 선택한 source의 연결 target: 강조 테두리
- 겹치는 Star 마커는 count badge 또는 약간의 offset으로 구분
- 색상만으로 상태를 구분하지 않고 아이콘/선/텍스트 병행
- 키보드로 item을 선택할 수 있게 각 배치 item을 button으로 렌더링

### 8.5 결과 요약

표시 항목:

- `17 valid Star connections`
- `8 / 10 Star effect groups active`
- `9 / 12 items contributing`
- `Optimal` 또는 `Best found in 5.0s`
- `143,820 states explored`

상세 목록 예시:

```text
Weapons Rack #1
  Faster Weapons: 3 targets
  - Wooden Sword #1
  - Dagger #1
  - Light Bow #1

Banana #1
  No Star groups
```

비활성 그룹은 “No eligible target placed on its Star cells”처럼 이유를 보여준다.

### 8.6 접근성

- form label과 button accessible name 제공
- 진행 상태 `aria-live="polite"`
- 오류 `role="alert"`
- 결과 보드에 텍스트형 대체 상세 표 제공
- focus visible 유지
- 최소 터치 영역 44px
- `prefers-reduced-motion` 대응

---

## 9. 상태 저장과 결과 공유

MVP는 서버 저장 없이 URL hash 또는 query string에 다음을 직렬화한다.

- 데이터 버전
- 아이템 id와 수량
- 검색 품질
- 결과 배치는 선택적으로 포함

기존 Backpack Brawl Pro의 builder 링크 형식과 혼동되지 않도록 자체 prefix를 쓴다.

```text
optimizer.html#v=1&items=wooden-sword:2,banana:1&quality=standard
```

결과 배치까지 포함할 경우 URL 길이를 검사하고 너무 길면 입력만 공유한다. 알 수 없는 item id 또는 다른 데이터 버전은 경고하고 가능한 항목만 복원한다.

`localStorage`는 마지막 입력 복구에 사용할 수 있으나 필수 기능은 아니다. 사용한다면 schema version을 둔다.

---

## 10. 오류와 경계 상황

다음 상황을 명시적으로 처리한다.

- 아이템이 0개: 계산 안내
- 총 면적 54 초과: 어떤 아이템을 줄여야 하는지 표시
- 개별 footprint가 9×6 어느 회전에서도 들어가지 않음
- 총 면적은 충분하지만 모양상 패킹 불가능
- Star 데이터 누락/invalid
- 이미지 로드 실패: 영문 이름 placeholder
- Worker 생성 실패: main thread fallback은 작은 입력만 허용하거나 명확한 오류 표시
- 사용자가 계산 중 입력 변경: 현재 계산을 stale로 표시하거나 자동 취소
- 빠르게 연속 Calculate: 이전 Worker 결과 무시
- 계산 시간 제한: best feasible 해가 있으면 반환, 없으면 `No layout found within time limit`이며 불가능으로 단정하지 않음
- exact 탐색이 완전히 끝나고 feasible 해가 없을 때만 `No feasible arrangement`
- 동일 이름이지만 id가 다른 아이템: id 기준 구분
- 동일 아이템 여러 개: instance 번호 안정적으로 유지
- 모든 아이템에 Star가 없음: 가능한 패킹을 반환하고 점수 0, `Optimal` 가능

---

## 11. 테스트 계획

외부 패키지 없이 현재처럼 Node `assert` 기반 테스트를 유지한다.

### 11.1 데이터 테스트

`tests/optimizer-data.test.js`

- schema 필수 필드
- id/name uniqueness
- 로컬 이미지 존재
- footprint 정규화와 중복 없음
- type 참조 유효성
- Star group id uniqueness
- 회전 결과 면적 보존
- verified selectable item에 partial data 없음
- 데이터 버전과 검증 날짜 존재

### 11.2 좌표/회전 테스트

`tests/optimizer-core.test.js`

- 1×1의 네 회전 dedupe
- 1×2의 90도 회전
- L자 footprint의 4회전
- footprint와 바깥 Star offset의 동시 회전
- 4회전 후 원본 복귀
- anchor normalization
- cell index와 BigInt mask 변환
- 경계 검사
- overlap 검사

### 11.3 점수 테스트

- Star 한 칸과 eligible target → 1
- ineligible type → 0
- 동일 target이 같은 그룹 Star 여러 칸 덮음 → 1
- target 두 개가 각각 Star를 덮음 → 2
- source 두 개가 target 하나를 가리킴 → 2
- source 자기 자신 제외
- Star가 보드 밖이면 비활성
- 회전 후 Star target이 올바르게 변경
- anyTypes/allTypes/excludedTypes 판정
- 사전식 tie-break 비교

### 11.4 Solver 정확성 테스트

작은 2×2, 3×3 가상 보드 fixture를 지원하게 core를 board-size parameterized로 만든다.

- 손으로 최적값을 아는 1×1 아이템 세트
- 회전해야만 최적이 되는 세트
- 면적 초과 즉시 실패
- 패킹 불가능 증명
- 동일 아이템 permutation 제거 후에도 최적값 동일
- brute-force reference solver와 optimized solver 결과 비교
- 여러 seed에서도 exact 모드 최적값 동일
- timeout 시 `best-found`, 완전 종료 시 `optimal`
- 취소 메시지 처리

작은 랜덤 fixture는 느린 단순 brute-force와 결과를 비교해 branch-and-bound 가지치기의 안전성을 검증한다.

### 11.5 구조/오프라인 테스트

`tests/optimizer-structure.test.js`

- HTML의 모든 참조 id 존재
- script 로드 순서: data → core → solver/app
- 원격 script/link/image 사용 없음
- CSS 원격 URL 없음
- index와 optimizer 간 내비게이션 링크 존재
- 필요한 ARIA label 존재

### 11.6 성능 테스트

`tests/optimizer-performance.test.js`

성능 테스트는 머신 차이를 고려해 지나치게 빡빡한 절대 시간보다 상태 수와 넉넉한 상한을 함께 쓴다.

- 8~10개 보통 크기 fixture: 5초 이내 feasible 해
- 작은 exact fixture: 1초 이내 optimal 증명
- Worker progress 빈도가 과도하지 않음
- 메모리 폭증 방지를 위한 transposition entry cap 확인
- 동일 입력/seed에서 동일 결과

### 11.7 수동 인수 테스트

- Chrome, Edge, Firefox 최신 버전
- `file://.../optimizer.html` 직접 실행
- 네트워크를 끊고 실행
- 360px 모바일 폭
- 실제 Android/iOS 또는 기기 에뮬레이션
- 아이템 1개, 중복 아이템, 54칸 근접 입력
- 계산 취소 후 재계산
- 결과 item 탭 시 source/target 강조
- URL 공유 후 새 탭 복원
- 이미지 실패 fallback

---

## 12. 단계별 구현 순서

### Phase 1 — 규칙과 데이터 조사

1. 공식 최신 게임 버전 확인
2. 공식 아이템 페이지와 Backpack Brawl Pro 페이지에서 footprint/Star/type 데이터가 구조적으로 노출되는지 확인
3. 대표 아이템 fixture 10~15개 수집
4. 실제 게임의 Star 중복 계산과 다중 그룹 규칙 검증
5. `optimizer-data.js` schema 확정
6. 데이터 출처와 재사용 조건 기록

완료 기준: 대표 fixture의 이미지, footprint, types, Star groups를 사람이 대조해 모두 맞다고 확인.

### Phase 2 — 순수 core 구현

1. 좌표 정규화
2. 회전과 중복 회전 제거
3. mask 변환
4. placement 후보 생성
5. Star eligibility 및 점수 평가
6. core 단위 테스트

완료 기준: 작은 가상 보드의 모든 회전/점수 테스트 통과.

### Phase 3 — Solver 프로토타입

1. 단순 brute-force reference solver
2. optimized branch-and-bound
3. MRV와 symmetry breaking
4. 안전한 상한과 가지치기
5. greedy 초기 해와 local improvement
6. timeout/cancel/status
7. reference와 randomized small-case 교차검증

완료 기준: 모든 작은 케이스에서 optimized 결과가 brute-force 최적값과 일치하며, `optimal` 표시는 완전 탐색 때만 나옴.

### Phase 4 — 전체 데이터 파이프라인

1. `build-optimizer-data.ps1`
2. local image reuse/download
3. manual override 및 검증 report
4. unsupported item 처리
5. data test

완료 기준: selectable item 전체가 데이터 품질 게이트 통과. 부족하면 지원 범위를 명시적으로 축소하고 UI에 표시.

### Phase 5 — Worker와 UI

1. `optimizer-worker.js`
2. 아이템 검색/선택/수량 UI
3. Calculate/Cancel/progress
4. 결과 보드 렌더링
5. 활성 Star 상세 표
6. 모바일 레이아웃과 접근성
7. URL 상태 공유

완료 기준: file://에서 오프라인으로 검색부터 결과 확인까지 완결.

### Phase 6 — 통합과 회귀 검증

1. 두 페이지 내비게이션 추가
2. 기존 상점 확률 테스트 전부 실행
3. optimizer 테스트 전부 실행
4. 모바일 수동 검사
5. README에 사용법, 계산 정의, 한계, 데이터 출처 추가

완료 기준: 기존 계산기 기능과 테스트에 회귀가 없고 인수 조건 충족.

---

## 13. 완료 조건(Definition of Done)

다음 조건이 모두 충족되어야 완료로 본다.

- 사용자가 지원되는 영어 아이템을 검색해 수량과 함께 추가할 수 있다.
- 9×6 전체 활성 보드 가정이 UI에 명확히 표시된다.
- Bag 아이템과 unsupported 아이템이 조용히 잘못 계산되지 않는다.
- 입력된 모든 아이템이 결과에 정확히 한 번씩 나타난다.
- 겹침과 보드 밖 배치가 없다.
- 회전된 footprint와 Star 좌표가 실제 규칙과 일치한다.
- 유효 Star 점수가 이 문서의 unique-target 규칙대로 계산된다.
- 작은 검증 세트에서는 최적해가 brute-force 결과와 일치한다.
- 시간 제한 결과와 증명된 최적 결과의 문구가 구분된다.
- 계산 중 UI가 멈추지 않고 취소할 수 있다.
- 결과에서 source item, Star group, target item 관계를 확인할 수 있다.
- 모바일 360px 폭에서 핵심 기능을 가로 스크롤 없이 사용할 수 있다.
- 네트워크가 없어도 `optimizer.html`이 작동한다.
- 외부 런타임 의존성과 서버가 없다.
- 기존 상점 확률 계산기 테스트가 모두 통과한다.
- README가 새 기능, 점수 정의, 한계와 데이터 버전을 설명한다.

---

## 14. 알려진 위험과 대응

### 최신 아이템 데이터 부족

가장 큰 위험이다. 이미지 목록만으로는 최적화할 수 없다. footprint/Star/type이 100% 검증되지 않은 아이템은 selectable로 만들지 않는다. 최신 패치마다 Star 패턴이 바뀔 수 있으므로 데이터 버전과 검증일을 결과에 표시한다.

### 비공식 사이트 의존

Backpack Brawl Pro는 유용하지만 비공식 팬 사이트이며 공개 API가 확인되지 않았다. 런타임 의존은 금지하고, 개발 시 데이터 출처로 사용할 때도 공식/실게임과 대조한다. 사이트 구조 변경에 대비해 수동 override를 지원한다.

### 최적화 시간 폭증

54칸이라도 작은 아이템이 많으면 경우의 수가 매우 크다. 초기 해, MRV, symmetry breaking, 안전한 upper bound, time limit을 사용한다. “best found”를 “optimal”로 잘못 표시하지 않는 것이 성능보다 중요하다.

### 목적 함수가 실제 강함과 다름

Star 연결 수 최대가 전투 성능 최대를 의미하지 않는다. UI와 README에 “배치 연결 최적화이며 전투 승률 최적화가 아님”을 명시한다.

### 동일 Star 중복 규칙 오해

같은 target이 같은 source 그룹의 Star 여러 칸을 덮을 때 1회로 계산하는 기준을 사용한다. 다중 효과 그룹과 일부 특수 아이템은 실제 게임에서 교차검증한다. 규칙이 다른 예외 아이템은 `scoreMode`를 확장하거나 MVP에서 unsupported 처리한다.

### 기존 프로젝트 문자 인코딩

현재 PowerShell 출력에서 README와 HTML의 한국어가 깨져 보일 수 있다. 파일 자체의 UTF-8 여부를 먼저 확인하고, 편집 시 UTF-8 without BOM을 유지한다. 깨진 텍스트를 그대로 복사해 덮어쓰지 않는다.

### dirty worktree

현재 저장소에는 기존 프레임워크 파일 삭제와 새 정적 파일 추가 등 사용자 변경이 많이 존재한다. 다음 세션은 `git status --short`를 먼저 확인하고, 관련 없는 변경을 되돌리거나 정리하지 않는다.

---

## 15. 구현 전 반드시 확인할 체크리스트

- [ ] 현재 게임 버전과 아이템 데이터 기준일
- [x] 9×6 방향: 9 columns × 6 rows가 실제 UI 방향과 일치하는가
- [ ] item footprint가 비직사각형 셀 집합으로 필요한가
- [ ] 모든 아이템이 90도 단위로 자유 회전 가능한가
- [ ] 같은 target이 동일 그룹 Star 여러 칸을 덮을 때 정확히 1회인가
- [ ] 같은 아이템의 서로 다른 Star 효과 그룹은 독립 점수인가
- [ ] Star target 유형에서 `Weapon`과 `Melee/Ranged`의 포함 관계
- [ ] `Pet`, `Food`, `Potion`, `Accessory`, 영웅 전용 타입의 정규화
- [ ] 특정 item id만 받는 Star 예외 목록
- [ ] Star가 없는 아이템도 패킹을 위해 정상 지원되는가
- [ ] Bag, Boon, Relic, Unique, Crafted 각각의 selectable 정책
- [ ] 최신 데이터에서 unsupported item 수
- [ ] 이미지 라이선스/출처 표기 방식
- [ ] 5초 표준 제한에서 대표 입력의 품질과 UI 응답성

체크 결과는 README 또는 별도 `DATA_NOTES.md`에 기록한다. 사실 확인이 끝나기 전에 데이터 추정을 코드에 고정하지 않는다.

---

## 16. 최종 권장 구현 요약

새 기능은 기존 상점 확률 계산기와 분리된 `optimizer.html`로 만든다. 전용 `optimizer-data.js`에 모든 지원 아이템의 footprint, 유형, Star 그룹과 로컬 이미지를 저장한다. 좌표/회전/점수 로직은 DOM과 분리된 순수 JavaScript 모듈로 작성하고, 54비트 `BigInt` 점유 마스크 기반 branch-and-bound solver를 Web Worker에서 실행한다. 빠른 초기 해를 먼저 보여주고 exact 탐색이 끝났을 때만 Optimal을 선언한다. 결과는 9×6 보드와 source-group-target 상세 목록으로 검증 가능하게 표시한다.

가장 먼저 해야 할 일은 UI가 아니라 **최신 아이템의 footprint·Star 좌표·대상 유형을 신뢰성 있게 확보할 수 있는지 검증하는 데이터 스파이크**다. 이 데이터가 불완전하면 정확한 최적화 프로그램도 만들 수 없으므로, 확인된 아이템만 지원하는 것이 잘못된 전체 지원보다 낫다.
