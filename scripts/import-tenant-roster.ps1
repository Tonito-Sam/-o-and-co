param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Xml.Linq

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mainNs = [System.Xml.Linq.XNamespace]::Get('http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$relNs = [System.Xml.Linq.XNamespace]::Get('http://schemas.openxmlformats.org/officeDocument/2006/relationships')
$packageRelNs = [System.Xml.Linq.XNamespace]::Get('http://schemas.openxmlformats.org/package/2006/relationships')

function Read-ZipXml($zip, [string]$name) {
  $entry = $zip.GetEntry($name)
  if (-not $entry) { throw "Workbook is missing $name" }
  $stream = $entry.Open()
  try { return [System.Xml.Linq.XDocument]::Load($stream) }
  finally { $stream.Dispose() }
}

function Get-CellText($cell, [string[]]$sharedStrings) {
  $type = $cell.Attribute('t')
  $value = $cell.Element($mainNs + 'v')
  if ($type -and $type.Value -eq 's' -and $value) { return $sharedStrings[[int]$value.Value] }
  if ($type -and $type.Value -eq 'inlineStr') { return (($cell.Descendants($mainNs + 't') | ForEach-Object { $_.Value }) -join '') }
  if ($value) { return $value.Value }
  return ''
}

function Convert-ExcelDate([string]$value) {
  $number = 0.0
  if ([double]::TryParse($value.Trim(), [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return [datetime]::FromOADate($number).ToString('yyyy-MM-dd')
  }
  return $null
}

function Convert-ExcelAmount([string]$value) {
  $normalized = ($value -replace '[R,\s]', '').Trim()
  $amount = 0.0
  if ([double]::TryParse($normalized, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$amount)) {
    return $amount
  }
  return $null
}

function Read-WorkbookRows([string]$fileName, [string]$branch) {
  $path = Join-Path $root $fileName
  $zip = [IO.Compression.ZipFile]::OpenRead($path)
  try {
    $sharedStrings = @()
    if ($zip.GetEntry('xl/sharedStrings.xml')) {
      $sharedDoc = Read-ZipXml $zip 'xl/sharedStrings.xml'
      $sharedStrings = @($sharedDoc.Root.Elements($mainNs + 'si') | ForEach-Object {
        (($_.Descendants($mainNs + 't') | ForEach-Object { $_.Value }) -join '')
      })
    }

    $workbook = Read-ZipXml $zip 'xl/workbook.xml'
    $relationships = Read-ZipXml $zip 'xl/_rels/workbook.xml.rels'
    $sheet = $workbook.Root.Element($mainNs + 'sheets').Element($mainNs + 'sheet')
    $relationshipId = $sheet.Attribute($relNs + 'id').Value
    $relationship = $relationships.Root.Elements($packageRelNs + 'Relationship') |
      Where-Object { $_.Attribute('Id').Value -eq $relationshipId }
    $target = $relationship.Attribute('Target').Value.TrimStart('/')
    if (-not $target.StartsWith('xl/')) { $target = "xl/$target" }
    $sheetDoc = Read-ZipXml $zip $target

    $rows = @{}
    foreach ($row in $sheetDoc.Descendants($mainNs + 'row')) {
      $rowNumber = [int]$row.Attribute('r').Value
      $cells = @{}
      foreach ($cell in $row.Elements($mainNs + 'c')) {
        $column = $cell.Attribute('r').Value -replace '\d', ''
        $cells[$column] = Get-CellText $cell $sharedStrings
      }
      $rows[$rowNumber] = $cells
    }

    $headers = $rows[2]
    if (-not $headers) { throw "No column-header row found in $fileName" }
    $result = @()
    foreach ($rowNumber in ($rows.Keys | Sort-Object)) {
      if ($rowNumber -lt 5) { continue }
      $cells = $rows[$rowNumber]
      $office = ([string]$cells['A']).Trim()
      $company = ([string]$cells['B']).Trim()
      if (-not $office -or -not $company -or $company -ieq 'Total') { continue }

      $sourceData = [ordered]@{}
      foreach ($column in $headers.Keys) {
        $sourceData[$column] = @{
          header = ([string]$headers[$column]).Trim()
          value = [string]$cells[$column]
        }
      }
      $officeSizeColumn = if ($branch -eq 'rosebank') { 'C' } else { $null }
      $notesColumn = if ($branch -eq 'rosebank') { 'AI' } else { 'AH' }
      $dateColumns = if ($branch -eq 'rosebank') {
        @{ start = 'F'; end = 'G'; escalation = 'H'; deposit = 'J'; rent = 'K'; industry = 'I'; term = 'E' }
      } else {
        @{ start = 'D'; end = 'E'; escalation = 'F'; deposit = 'H'; rent = 'I'; industry = 'G'; term = 'C' }
      }

      $officeNumber = $office -replace '\s+', ' '
      $result += @{
        branch = $branch
        organization_name = $company
        office_number = $officeNumber
        tier = if ($officeNumber -match '^VIRTUAL$') { 'flex' } else { 'private_office' }
        office_size = if ($officeSizeColumn) { Convert-ExcelAmount ([string]$cells[$officeSizeColumn]) } else { $null }
        office_rental_zar = Convert-ExcelAmount ([string]$cells[$dateColumns.rent])
        lease_term = ([string]$cells[$dateColumns.term]).Trim()
        lease_start_date = Convert-ExcelDate ([string]$cells[$dateColumns.start])
        rental_end_date = Convert-ExcelDate ([string]$cells[$dateColumns.end])
        next_escalation_date = Convert-ExcelDate ([string]$cells[$dateColumns.escalation])
        deposit_paid_zar = Convert-ExcelAmount ([string]$cells[$dateColumns.deposit])
        industry = ([string]$cells[$dateColumns.industry]).Trim()
        office_details = ([string]$cells[$notesColumn]).Trim()
        source_data = $sourceData
      }
    }
    return ,$result
  }
  finally { $zip.Dispose() }
}

$rows = @()
$rows += Read-WorkbookRows 'Kyalami Client List.xlsx' 'kyalami'
$rows += Read-WorkbookRows 'Rosebank Clients List updated.xlsx' 'rosebank'
if ($rows.Count -ne 61) { throw "Expected 61 occupied tenant rows, extracted $($rows.Count). Review the workbook before import." }

$duplicates = @($rows | Group-Object { "$($_.branch)|$($_.organization_name.Trim().ToLowerInvariant())|$($_.office_number.Trim().ToLowerInvariant())" } | Where-Object Count -gt 1)
if ($duplicates.Count) { throw "Duplicate branch/company/office keys found: $($duplicates.Count)" }

if ($DryRun) {
  "Validated $($rows.Count) occupied rows: Kyalami=$(@($rows | Where-Object branch -eq 'kyalami').Count), Rosebank=$(@($rows | Where-Object branch -eq 'rosebank').Count). No client values printed."
  return
}

$envPath = Join-Path $root '.env'
if (-not (Test-Path $envPath)) { throw 'Create a local .env with Supabase URL and service-role key before importing.' }
$environment = @{}
foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
    $environment[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
$supabaseUrl = $environment['SUPABASE_URL']
if (-not $supabaseUrl) { $supabaseUrl = $environment['VITE_SUPABASE_URL'] }
$serviceRoleKey = $environment['SUPABASE_SERVICE_ROLE_KEY']
if (-not $supabaseUrl -or -not $serviceRoleKey) { throw 'SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required in .env.' }

$body = ConvertTo-Json -InputObject @($rows) -Depth 20 -Compress
$response = Invoke-RestMethod -Method Post `
  -Uri "$($supabaseUrl.TrimEnd('/'))/rest/v1/rpc/import_client_roster" `
  -Headers @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" } `
  -ContentType 'application/json' `
  -Body $body

$errorCount = @($response.errors).Count
"Import result: imported=$($response.imported), errors=$errorCount."
if ($errorCount) { $response.errors | ConvertTo-Json -Depth 5; throw 'Some rows failed; rerun after resolving the reported row errors.' }