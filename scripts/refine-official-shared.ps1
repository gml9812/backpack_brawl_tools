$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $projectRoot 'data.js'
$assetDirectory = Join-Path $projectRoot 'assets\items'
$officialBaseUrl = 'https://www.backpackbrawl.com'

$raw = [System.IO.File]::ReadAllText($dataPath)
$json = $raw.Substring('globalThis.BB_DATA = '.Length).TrimEnd(';', "`r", "`n")
$data = $json | ConvertFrom-Json
$page = (Invoke-WebRequest -UseBasicParsing "$officialBaseUrl/items/").Content
$pattern = '<a href="/items/(?<slug>[^"]+)"[^>]+data-card="card-shared-shop-\d+" data-search="(?<search>[^"]+)" data-rarity="(?<rarity>[^"]+)">[\s\S]*?<img src="(?<image>[^"]+)" alt[^>]*class="mt-3[^>]*>[\s\S]*?<span class="mt-1\.5[^>]*>(?<name>[^<]+)</span></a>'

$officialItems = foreach ($match in [regex]::Matches($page, $pattern)) {
    $slug = $match.Groups['slug'].Value
    $rarity = $match.Groups['rarity'].Value
    if ($data.rarities -notcontains $rarity) { continue }
    [pscustomobject]@{
        id = $slug
        name = [System.Net.WebUtility]::HtmlDecode($match.Groups['name'].Value)
        rarity = $rarity
        hero = 'shared'
        bag = $match.Groups['search'].Value -match '(^| )bag( |$)'
        status = 'available'
        weight = 1
        image = "assets/items/$slug.webp"
        sourceImage = "$officialBaseUrl$($match.Groups['image'].Value)"
    }
}

if ($officialItems.Count -lt 90) {
    throw "Official shared pool extraction returned only $($officialItems.Count) items."
}

$client = [System.Net.Http.HttpClient]::new()
foreach ($item in $officialItems) {
    $destination = Join-Path $projectRoot ($item.image -replace '/', '\')
    if (-not (Test-Path $destination)) {
        $bytes = $client.GetByteArrayAsync($item.sourceImage).GetAwaiter().GetResult()
        [System.IO.File]::WriteAllBytes($destination, $bytes)
    }
}
$client.Dispose()

$heroItems = @($data.items | Where-Object { $_.hero -ne 'shared' })
$data.items = @($officialItems | Select-Object id, name, rarity, hero, bag, status, weight, image) + $heroItems
$officialSource = [pscustomobject]@{ label = 'Official Backpack Brawl item library — Shared shop pool'; url = 'https://www.backpackbrawl.com/items/' }
$data.sources = @($officialSource) + @($data.sources | Where-Object { $_.url -ne $officialSource.url })

$output = $data | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText($dataPath, "globalThis.BB_DATA = $output;`n", [System.Text.UTF8Encoding]::new($false))
Write-Host "Official shared pool: $($officialItems.Count); total calculator items: $($data.items.Count)."
