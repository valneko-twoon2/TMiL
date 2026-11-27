# TaskManagerLite をインストールする（Windows・x64）。管理者権限は要らない（ユーザーごとのインストール）。
#
#   irm https://github.com/valneko-twoon2/TaskManagerLite/releases/latest/download/install.ps1 | iex
#
# リリースのインストーラー（*_x64-setup.exe）を、SHA256SUMS とハッシュが一致するか確かめてから静かに実行する。
#
#   バージョンを決める:  $env:TASKMANAGERLITE_VERSION = '0.2.0'; irm ... | iex
#   確かめるだけ:        $env:TASKMANAGERLITE_DRY_RUN = '1'（ダウンロードとハッシュの確認だけ行う）
#
# iex で読み込まれるので、変数が呼び出し元に残らないようスクリプト ブロックの中で動かす。
# exit は呼び出し元の PowerShell ごと閉じてしまうので使わず、失敗は throw で知らせる。
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $repo = 'valneko-twoon2/TaskManagerLite'

  # Windows PowerShell の irm は、文字コードの書かれていない応答（GitHub のリリース）を Latin-1 として読むので、
  # このファイルの日本語が化ける。化けている文は UTF-8 として読み直してから出す（PowerShell 7 ではそのまま）
  function Get-Message([string] $text) {
    if ($text -match '[^\x00-\xff]' -or $text -notmatch '[\x80-\xff]') { return $text }
    return [Text.Encoding]::UTF8.GetString([Text.Encoding]::GetEncoding(28591).GetBytes($text))
  }

  function Get-Sha256([string] $path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      $stream = [IO.File]::OpenRead($path)
      try {
        return (($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '')
      } finally {
        $stream.Dispose()
      }
    } finally {
      $sha.Dispose()
    }
  }

  if ($env:TASKMANAGERLITE_DOWNLOAD_BASE) {
    $base = $env:TASKMANAGERLITE_DOWNLOAD_BASE
  } elseif ($env:TASKMANAGERLITE_VERSION) {
    $base = "https://github.com/$repo/releases/download/v$($env:TASKMANAGERLITE_VERSION)"
  } else {
    $base = "https://github.com/$repo/releases/latest/download"
  }

  # 古い Windows PowerShell でも TLS 1.2 で GitHub につなげるようにする
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $temp = Join-Path ([IO.Path]::GetTempPath()) ('taskmanagerlite-install-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temp | Out-Null
  try {
    Write-Host (Get-Message 'TaskManagerLite のリリースを確かめています...')
    $sumsPath = Join-Path $temp 'SHA256SUMS'
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile $sumsPath

    # 「ハッシュ  ファイル名」の行からインストーラーを探す
    $expected = $null
    $name = $null
    foreach ($line in [IO.File]::ReadAllLines($sumsPath)) {
      if ($line -match '^([0-9a-f]{64}) [ *]([^ /\\]+_x64-setup\.exe)$') {
        $expected = $Matches[1]
        $name = $Matches[2]
        break
      }
    }
    if (-not $name) { throw (Get-Message 'リリースにインストーラーが見つかりません。') }

    Write-Host ($name + (Get-Message ' をダウンロードしています...'))
    $setup = Join-Path $temp $name
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$name" -OutFile $setup
    if ((Get-Sha256 $setup) -ne $expected) {
      throw (Get-Message 'ハッシュが一致しません（ダウンロードが壊れているか、書き換えられています）。')
    }
    Write-Host (Get-Message 'ハッシュを確かめました。')

    if ($env:TASKMANAGERLITE_DRY_RUN -eq '1') {
      Write-Host (Get-Message '確かめるだけなので、インストールはしません。')
      return
    }

    Write-Host (Get-Message 'インストールしています...')
    $process = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw ((Get-Message 'インストーラーが失敗しました。終了コード: ') + $process.ExitCode)
    }
    Write-Host (Get-Message 'TaskManagerLite をインストールしました。スタート メニューから起動できます。')
  } finally {
    Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
