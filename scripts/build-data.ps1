$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetDirectory = Join-Path $projectRoot 'assets\items'
$dataPath = Join-Path $projectRoot 'data.js'
$baseUrl = 'https://backpackbrawlpro.com'
$rarities = @('Common', 'Rare', 'Epic', 'Legendary', 'Mythic')
$heroes = @(
    'buzz', 'celeste', 'chana', 'dorf', 'enoch', 'fern', 'harkon', 'hob',
    'kragg', 'morrow', 'nymphedora', 'pepper', 'ronan', 'sage', 'skara',
    'tink', 'zahir'
)

New-Item -ItemType Directory -Path $assetDirectory -Force | Out-Null

function Get-Page([string]$url) {
    return (Invoke-WebRequest -UseBasicParsing $url).Content
}

function Get-ItemCards([string]$url, [string]$hero) {
    $page = Get-Page $url
    $pattern = '<a href="/items/(?<slug>[^"]+)" class="item-gallery-card[^>]*data-rarity="(?<rarity>[^"]+)"[\s\S]*?<img src="(?<image>/game-assets/[^"]+)" alt="(?<name>[^"]+)" class="item-gallery-art"[\s\S]*?<h2>(?<title>[\s\S]*?)</h2></a>'
    $items = foreach ($match in [regex]::Matches($page, $pattern)) {
        [pscustomobject]@{
            slug = $match.Groups['slug'].Value
            name = [System.Net.WebUtility]::HtmlDecode($match.Groups['name'].Value)
            rarity = $match.Groups['rarity'].Value
            hero = $hero
            sourceImage = $match.Groups['image'].Value
        }
    }

    $remainingMatch = [regex]::Match($page, 'const remainingItems = (?<json>\[[\s\S]*?\]);')
    if ($remainingMatch.Success) {
        foreach ($item in ($remainingMatch.Groups['json'].Value | ConvertFrom-Json)) {
            $items += [pscustomobject]@{
                slug = $item.slug
                name = $item.name
                rarity = $item.rarity
                hero = $hero
                sourceImage = $item.image
            }
        }
    }
    return $items
}

$recipePage = Get-Page "$baseUrl/item-recipes"
$recipeJson = [regex]::Match($recipePage, '<script type="application/json">([\s\S]*?)</script>').Groups[1].Value
$craftedSlugs = @{}
foreach ($recipe in ($recipeJson | ConvertFrom-Json)) {
    if ($recipe.ingredients.Count -gt 0) {
        $craftedSlugs[$recipe.slug] = $true
    }
}

$allItems = @()
foreach ($rarity in $rarities) {
    $url = "$baseUrl/items?hero=shared&rarity=$rarity&hideUnavailable=1"
    $allItems += Get-ItemCards $url 'shared'
}

$rarityQuery = ($rarities | ForEach-Object { "rarity=$_" }) -join '&'
foreach ($hero in $heroes) {
    $url = "$baseUrl/items?hero=$hero&$rarityQuery&hideUnavailable=1"
    $allItems += Get-ItemCards $url $hero
}

$bagUrl = "$baseUrl/items?type=Bag&$rarityQuery&hideUnavailable=1"
$bagSlugs = @{}
foreach ($bag in (Get-ItemCards $bagUrl 'shared')) {
    $bagSlugs[$bag.slug] = $true
}

$shopItems = $allItems |
    Where-Object { -not $craftedSlugs.ContainsKey($_.slug) } |
    Sort-Object slug -Unique |
    ForEach-Object {
        [pscustomobject]@{
            id = $_.slug
            name = $_.name
            rarity = $_.rarity
            hero = $_.hero
            bag = $bagSlugs.ContainsKey($_.slug)
            status = 'available'
            weight = 1
            image = "assets/items/$($_.slug).png"
            sourceImage = "$baseUrl$($_.sourceImage)"
        }
    }

$httpClient = [System.Net.Http.HttpClient]::new()
$downloaded = 0
foreach ($item in $shopItems) {
    $destination = Join-Path $projectRoot ($item.image -replace '/', '\')
    if (-not (Test-Path $destination)) {
        try {
            $bytes = $httpClient.GetByteArrayAsync($item.sourceImage).GetAwaiter().GetResult()
            [System.IO.File]::WriteAllBytes($destination, $bytes)
        }
        catch {
            Write-Warning "Image download failed: $($item.name)"
        }
    }
    $downloaded += 1
    if ($downloaded % 25 -eq 0) { Write-Host "Images: $downloaded / $($shopItems.Count)" }
}
$httpClient.Dispose()

$roundOdds = @(
    @(90,10,0,0,0), @(84,15,1,0,0), @(78,20,2,0,0), @(71,25,3,1,0),
    @(64,30,4,2,0), @(57,34,5,3,1), @(51,38,6,4,1), @(44,42,7,5,2),
    @(38,46,8,6,2), @(31,50,9,7,3), @(33,46,10,8,3), @(32,44,11,9,4),
    @(32,42,12,10,4), @(31,40,13,11,5), @(31,38,14,12,5), @(29,36,16,13,6),
    @(27,34,18,14,7), @(27,30,20,15,8), @(27,26,22,16,9), @(26,22,24,18,10)
)

$payload = [ordered]@{
    version = '6.0.1'
    verifiedOn = '2026-08-05'
    rarities = $rarities
    heroes = @('any') + $heroes
    roundOdds = $roundOdds
    mechanics = [ordered]@{
        shopSlots = 5
        luckyCloverUpgrade = 30
        goldenCloverUpgrade = 40
        cursedCloverDowngrade = 30
        bagPityAt = 11
        baseSaleChance = 15
        targetBoostEstimate = 10
        rerollCostBreaks = @(5, 10)
        simulationRuns = 100000
    }
    sources = @(
        [ordered]@{ label = 'Backpack Brawl Pro — Items and rounds (game 6.0.1)'; url = 'https://backpackbrawlpro.com/items' },
        [ordered]@{ label = 'Backpack Brawl Wiki — Shop mechanics'; url = 'https://backpackbrawl.wiki.gg/wiki/Shop' },
        [ordered]@{ label = 'Official Backpack Brawl news and patch notes'; url = 'https://www.backpackbrawl.com/news/' }
    )
    items = $shopItems | Select-Object id, name, rarity, hero, bag, status, weight, image
}

$json = $payload | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText($dataPath, "globalThis.BB_DATA = $json;`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "Generated $($shopItems.Count) shop candidates and $downloaded local images."
