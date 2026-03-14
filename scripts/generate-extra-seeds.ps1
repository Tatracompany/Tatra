param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\src\data\extra-seeds.generated.js')
)

$workbooks = @(
  @{
    Path = 'C:\Users\Y PC\Desktop\Real Estate 2026 -\Fahahil\fahaheel.xlsm'
    Id = 'fahaheel'
    Name = 'fahaheel'
    Area = 'fahaheel'
    SkipNumericFloor = $true
    FooterRows = 2
  },
  @{
    Path = 'C:\Users\Y PC\Desktop\Real Estate 2026 -\Glibe\SHWEHK 41.xlsx'
    Id = 'shwehik'
    Name = 'shwehik'
    Area = 'shwehik'
    SkipNumericFloor = $false
    FooterRows = 2
  },
  @{
    Path = 'C:\Users\Y PC\Desktop\Real Estate 2026 -\Mahbolah\mahbola303.xlsx'
    Id = 'mahbola'
    Name = 'mahbola'
    Area = 'mahbola'
    SkipNumericFloor = $false
    FooterRows = 2
  }
)

function Parse-Number($text) {
  $value = [string]$text
  if ([string]::IsNullOrWhiteSpace($value)) { return 0 }
  $trimmed = $value.Trim()
  if ($trimmed -eq '-') { return 0 }
  $normalized = $trimmed -replace ',', ''
  return [double]::Parse($normalized, [System.Globalization.CultureInfo]::InvariantCulture)
}

function Parse-DateIso($text) {
  $value = [string]$text
  if ([string]::IsNullOrWhiteSpace($value)) { return '' }
  $trimmed = $value.Trim()
  if ($trimmed -eq '-') { return '' }
  try {
    $date = [datetime]::ParseExact($trimmed, 'dd/MM/yyyy', [System.Globalization.CultureInfo]::InvariantCulture)
    if ($date.Year -lt 2000) { return '' }
    return $date.ToString('yyyy-MM-dd')
  } catch {
    return ''
  }
}

function Infer-Floor($explicit, $skipNumericFloor) {
  $value = [string]$explicit
  $trimmed = $value.Trim()
  if ($trimmed) {
    if (-not ($skipNumericFloor -and $trimmed -match '^[0-9]+$')) {
      return $trimmed
    }
  }
  return ''
}

function Build-SeedImports($excel) {
  $imports = @()

  foreach ($workbookConfig in $workbooks) {
    if (-not (Test-Path -LiteralPath $workbookConfig.Path)) {
      throw "Workbook not found: $($workbookConfig.Path)"
    }

    $workbook = $excel.Workbooks.Open($workbookConfig.Path, 0, $true)
    try {
      $sheet = $workbook.Worksheets.Item(1)
      $used = $sheet.UsedRange
      $rowCount = $used.Rows.Count
      $lastDataRow = [Math]::Max(4, $rowCount - [int]$workbookConfig.FooterRows)
      $tenants = @()

      for ($row = 4; $row -le $lastDataRow; $row += 1) {
        $c1 = [string]$used.Item($row, 1).Text
        $c2 = [string]$used.Item($row, 2).Text
        $c3 = [string]$used.Item($row, 3).Text
        $c4 = [string]$used.Item($row, 4).Text
        $c5 = [string]$used.Item($row, 5).Text
        $c6 = [string]$used.Item($row, 6).Text
        $c7 = [string]$used.Item($row, 7).Text
        $c9 = [string]$used.Item($row, 9).Text
        $c10 = [string]$used.Item($row, 10).Text
        $c12 = [string]$used.Item($row, 12).Text
        $c13 = [string]$used.Item($row, 13).Text
        $c14 = [string]$used.Item($row, 14).Text
        $c19 = [string]$used.Item($row, 19).Text

        $unit = $c2.Trim()
        $name = $c3.Trim()
        if ([string]::IsNullOrWhiteSpace($unit)) { continue }

        $contractRent = Parse-Number $c6
        $discount = Parse-Number $c7
        $actualRent = Parse-Number $c9
        if (-not ($actualRent -gt 0) -and $contractRent -gt 0) {
          $actualRent = [Math]::Max($contractRent - $discount, 0)
        }

        $tenants += [pscustomobject][ordered]@{
          unit = $unit
          floor = Infer-Floor $c1 $workbookConfig.SkipNumericFloor
          name = $name
          contractStart = Parse-DateIso $c4
          contractEnd = Parse-DateIso $c5
          contractRent = $contractRent
          discount = $discount
          actualRent = $actualRent
          previousDue = [Math]::Max((Parse-Number $c10) - (Parse-Number $c13), 0)
          paidCurrent = Parse-Number $c12
          prepaid = Parse-Number $c14
          note = $c19.Trim()
        }
      }

      $imports += [pscustomobject][ordered]@{
        id = $workbookConfig.Id
        name = $workbookConfig.Name
        area = $workbookConfig.Area
        totalUnits = $tenants.Count
        tenants = $tenants
      }
    } finally {
      $workbook.Close($false)
    }
  }

  return $imports
}

$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Path $resolvedOutputPath -Parent
if (-not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $imports = Build-SeedImports $excel
  $json = $imports | ConvertTo-Json -Depth 6
  $content = "window.__extraSeedImports = $json`r`n;"
  Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
  Write-Output "Generated $resolvedOutputPath"
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
  [gc]::Collect()
  [gc]::WaitForPendingFinalizers()
}
