param([string]$Folder, [string]$Output)
$ErrorActionPreference = 'Stop'
try {
  if (-not [IO.Path]::IsPathRooted($Folder)) { throw '请选择完整路径。' }
  $target = [IO.Path]::GetFullPath($Folder)
  if (Test-Path -LiteralPath $target) {
    if (-not (Test-Path -LiteralPath $target -PathType Container)) { throw '请选择文件夹。' }
    $entries = @(Get-ChildItem -LiteralPath $target -Force)
    if ($entries.Count -gt 0) {
      $allowed = @('library.json','attachments','backups','window-state.json')
      if (@($entries | Where-Object { $_.Name -notin $allowed }).Count -gt 0) { throw '文件夹包含不属于栖简文稿库的文件。' }
      $libraryFile = Join-Path $target 'library.json'
      if (-not (Test-Path -LiteralPath $libraryFile -PathType Leaf)) { throw '缺少 library.json 文稿库数据。' }
      $library = Get-Content -LiteralPath $libraryFile -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($null -eq $library.version -or $null -eq $library.nodes -or $library.nodes -isnot [Array]) { throw '文稿库数据格式不正确。' }
      foreach ($node in $library.nodes) {
        if (-not $node.id -or $node.type -notin @('folder','document')) { throw '文稿库条目格式不正确。' }
      }
      foreach ($name in @('attachments','backups')) {
        $item = Join-Path $target $name
        if ((Test-Path -LiteralPath $item) -and -not (Test-Path -LiteralPath $item -PathType Container)) { throw '附件或备份路径不是文件夹。' }
      }
    }
  }
  # Test access without changing existing documents.
  if (-not (Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target | Out-Null }
  $probe = Join-Path $target ('.qijian-install-check-' + [Guid]::NewGuid().ToString('N'))
  [IO.File]::WriteAllText($probe, '')
  Remove-Item -LiteralPath $probe
  if ($Output) {
    $selection = @{ root=$target; installedAt=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ') } | ConvertTo-Json
    [IO.File]::WriteAllText($Output, $selection, (New-Object Text.UTF8Encoding($false)))
  }
  exit 0
} catch { Write-Output $_.Exception.Message; exit 1 }
