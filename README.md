# Backpack Brawl Shop Odds

Backpack Brawl 상점에서 특정 아이템을 지정한 새로고침 횟수 안에 만날 확률을 계산하는 오프라인 정적 웹앱입니다. 로그인, 서버, 분석 도구, 외부 런타임이 없습니다.

## 실행

`index.html`을 최신 Chrome, Safari, Firefox 또는 Edge에서 엽니다. 모든 아이템 이미지와 데이터가 프로젝트에 포함되어 있어 계산 시 인터넷 연결이 필요하지 않습니다.

## 사용 흐름

1. 영웅, 라운드, 잠긴 슬롯, 클로버를 설정합니다.
2. Calculate를 누르면 다음 상점에 등장 가능한 아이템과 각 아이템의 슬롯당·상점당 확률을 확인할 수 있습니다.
3. 목록의 아이템을 클릭하면 지정한 새로고침 횟수 안의 누적 확률, 평균 필요 횟수, 예상 골드를 상세 표시합니다.

## 계산 모델

1. 선택한 라운드의 확률로 레어도를 결정합니다.
2. 선택한 영웅 및 Available 상태인 동일 레어도 아이템 중 하나를 고릅니다.
3. 공개된 개별 가중치가 없으므로 기본적으로 같은 레어도 안에서 균등 확률을 사용합니다.
4. 클로버, 가방 보정, 재등장 억제, 목표 아이템 추가 확률, 할인 조건을 순서대로 적용합니다.
5. 상태가 변하지 않는 단순 조건은 수식으로 계산하고, 클로버 또는 가방 보정이 개입하면 100,000회 시뮬레이션과 95% Wilson 신뢰구간을 사용합니다.

표시하는 예상 골드는 목표 발견 시 새로고침을 중단하고, 실패하면 사용자가 지정한 횟수까지 모두 시도하는 평균 소비량입니다.

## 데이터 기준과 한계

- 기준 게임 데이터: `6.0.1`
- 확인 날짜: `2026-08-05`
- 라운드: 1~20
- 일반 상점 후보: 274개. Shared Common~Mythic 92개는 공식 상점 풀을 사용하고, 영웅별 비제작 후보는 최신 게임 데이터에서 구성했습니다.
- 제작 결과, Relic, Unique, Special, Boon은 일반 상점 풀에서 제외했습니다.
- 첫 상점의 무기·펫 전용 규칙과 시즌 Special Shop은 모델링하지 않습니다.
- 재등장 억제율과 특정 아이템 출현 증가 효과의 정확한 내부 수치는 공개되지 않아 수정 가능한 추정값입니다.
- 시뮬레이션 결과의 평균 필요 새로고침 횟수는 관측된 상점당 성공률을 사용한 근사값입니다.

## 출처

- [Official Backpack Brawl item library](https://www.backpackbrawl.com/items/)
- [Backpack Brawl Pro — Items and rounds](https://backpackbrawlpro.com/items)
- [Backpack Brawl Wiki — Shop mechanics](https://backpackbrawl.wiki.gg/wiki/Shop)
- [Official Backpack Brawl news and patch notes](https://www.backpackbrawl.com/news/)

아이템 이미지는 식별을 위한 참고용이며 각 권리는 원저작자에게 있습니다. 이 프로젝트는 비공식 팬 도구입니다.

## 데이터 갱신

게임 데이터가 바뀌면 PowerShell에서 다음을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-data.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\refine-official-shared.ps1
```

첫 스크립트는 최신 게임 데이터에서 비제작 후보를 만들고, 두 번째 스크립트는 Shared 항목을 공식 상점 풀로 교체해 `data.js`와 `assets/items/`를 갱신합니다. 생성된 목록은 반드시 실제 게임 및 공식 패치 노트와 다시 대조해야 합니다.

## 검증

계산 엔진 테스트:

```powershell
node .\tests\calculator.test.js
```
## Star 배치 최적화

`optimizer.html`을 열면 검증된 영어 아이템 목록에서 수량을 선택하고, 모든 아이템을 실제 게임 UI 방향의 9열 × 6행 가로형 보드에 배치해 유효한 Star 연결 수를 최대화할 수 있습니다. 기존 Shop Odds와 분리된 완전 오프라인 페이지이며 두 도구는 상단 내비게이션으로 이동합니다.

1. 영어 이름, 영웅, 유형으로 아이템을 찾고 `+`로 추가합니다.
2. Fast(1초), Standard(5초), Thorough(20초) 중 탐색 품질을 고릅니다.
3. `Calculate optimal placement`를 누릅니다. 계산 중에는 Worker를 종료하는 `Cancel`을 사용할 수 있습니다.
4. 결과 아이템을 누르면 해당 source의 활성 Star와 target을 강조하고 상세 관계를 표시합니다.
5. `Copy input link`로 데이터 버전, 수량, 품질이 포함된 입력 링크를 복사합니다.

대표 점수는 고유한 `(source instance, Star group, target instance)` 연결 수입니다. 한 target이 같은 그룹의 Star 여러 칸을 덮어도 1회만 계산합니다. 동점은 활성 그룹 수, 기여 target 수, 작은 bounding box, 위·왼쪽 밀집, 결정적 배치 key 순으로 해소합니다. 탐색을 완전히 끝낸 경우에만 `Optimal`을 표시하며, 시간 제한 결과는 `Best found`로 구분합니다.

현재 optimizer 데이터 기준은 게임 `6.0.1`, 기본 검증일 `2026-08-05`, Star 대상 보완 검증일 `2026-08-06`입니다. 현재 보드 아이템 940개 전체를 검색 목록에 포함하며 이미지·데이터는 모두 로컬입니다. 이 중 구조화된 footprint와 명시적인 Star 대상 조건을 확보한 906개는 계산할 수 있습니다. 고정 전체 보드 모델과 충돌하는 Bag 32개와 대상을 아직 안전하게 확정하지 못한 `Cursed Idol`, `Stone Golem` 2개는 목록에는 표시하되 이유와 함께 선택을 차단합니다. 기존 15개 수동 검증 fixture와 공식 아이템 라이브러리로 대상을 재검증한 17개 오버라이드는 생성 데이터보다 우선 적용됩니다. 지원 범위, 출처, 확인 결과는 [`DATA_NOTES.md`](DATA_NOTES.md)에 기록했습니다.

이 기능은 Star 연결 배치를 최적화하며 전투 피해량, 생존력 또는 승률을 계산하지 않습니다.

Optimizer 검증:

```powershell
node .\tests\optimizer-data.test.js
node .\tests\optimizer-core.test.js
node .\tests\optimizer-solver.test.js
node .\tests\optimizer-structure.test.js
node .\tests\optimizer-performance.test.js
```

전체 카탈로그 재생성:

```powershell
node .\scripts\build-full-optimizer-catalog.mjs
```

공식 현재 라이브러리와 Skara 보완 목록을 읽고 940개 로컬 카탈로그, 누락 이미지, 검토 보고서를 생성합니다. 명시적인 `Star <type/item>` 문구만 구조화하며 불완전한 문구는 자동으로 비활성 처리합니다.

대표 수동 fixture 재검증:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-optimizer-data.ps1 -WriteReport
```

소스 레이아웃이 달라지면 스크립트는 runtime 데이터를 덮어쓰지 않고 실패하여 수동 검토를 요구합니다.
