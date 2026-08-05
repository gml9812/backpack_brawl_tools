param(
    [switch]$WriteReport
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = 'https://backpackbrawlpro.com/items'
$verifiedOn = '2026-08-05'

# Reviewed fixture signatures. Coordinates use the source page's one-based grid.
$fixtures = [ordered]@{
    'rock' = 'occupied:1,1'
    'wooden-stick' = 'occupied:1,1;occupied:1,2'
    'wooden-sword' = 'occupied:1,1;occupied:1,2'
    'dagger' = 'occupied:1,1;occupied:1,2'
    'apple' = 'star:2,1;star:1,2;occupied:2,2;star:3,2;star:2,3'
    'brown-rat' = 'star:3,1;star:1,2;occupied:2,2;occupied:3,2;star:4,2;star:2,3'
    'banana' = 'star:3,1;star:2,2;occupied:3,2;star:4,2;star:1,3;occupied:2,3;occupied:3,3;star:4,3;star:2,4;star:3,4'
    'mana-strudel' = 'star:2,1;star:3,1;star:1,2;occupied:2,2;occupied:3,2;star:4,2;star:2,3;star:3,3'
    'light-bow' = 'occupied:1,1;occupied:1,2'
    'searing-wand' = 'occupied:1,1;occupied:1,2'
    'iron-bar' = 'star:1,1;occupied:2,1;occupied:3,1;star:4,1'
    'pet-collar' = 'star:1,1;occupied:2,1;occupied:3,1;star:4,1;star:2,2;star:3,2'
    'cauldron' = 'occupied:1,1;occupied:2,1;occupied:1,2;occupied:2,2'
    'simple-quiver' = 'star:1,1;occupied:2,1;star:3,1;occupied:2,2;star:1,3;occupied:2,3;star:3,3'
    'armor-pack' = 'occupied:1,1;occupied:2,1;occupied:1,2;occupied:2,2'
}

$results = foreach ($entry in $fixtures.GetEnumerator()) {
    $slug = $entry.Key
    $url = "$baseUrl/$slug/"
    try {
        $html = (Invoke-WebRequest -UseBasicParsing $url).Content
        $matches = [regex]::Matches(
            $html,
            'item-footprint__cell item-footprint__cell--(?<kind>occupied|star)" style="grid-column:(?<x>\d+);grid-row:(?<y>\d+)'
        )
        $actual = ($matches | ForEach-Object {
            "$($_.Groups['kind'].Value):$($_.Groups['x'].Value),$($_.Groups['y'].Value)"
        }) -join ';'
        [ordered]@{
            id = $slug
            url = $url
            expected = $entry.Value
            actual = $actual
            matches = $actual -eq $entry.Value
            checkedOn = (Get-Date).ToString('yyyy-MM-dd')
        }
    }
    catch {
        [ordered]@{
            id = $slug
            url = $url
            expected = $entry.Value
            actual = $null
            matches = $false
            error = $_.Exception.Message
            checkedOn = (Get-Date).ToString('yyyy-MM-dd')
        }
    }
}

$failed = @($results | Where-Object { -not $_.matches })
$results | ForEach-Object {
    $status = if ($_.matches) { 'OK' } else { 'CHANGED' }
    Write-Host ("{0,-8} {1}" -f $status, $_.id)
}

if ($WriteReport) {
    $reportPath = Join-Path $projectRoot 'optimizer-data-report.json'
    $payload = [ordered]@{
        schemaVersion = 1
        gameVersion = '6.0.1'
        fixtureBaseline = $verifiedOn
        generatedOn = (Get-Date).ToString('o')
        source = $baseUrl
        results = $results
    }
    $json = $payload | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($reportPath, $json, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Report: $reportPath"
}

if ($failed.Count) {
    throw "$($failed.Count) optimizer fixture layout(s) changed. Review the source pages; runtime data was not overwritten."
}

Write-Host "Verified $($results.Count) optimizer fixtures against structured source layouts."
