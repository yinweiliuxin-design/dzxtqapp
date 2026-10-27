[CmdletBinding()]
param(
    [string]$ToolchainRoot = 'E:\codex\tools\android-iqoo11-20261025',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\artifacts\android-iqoo11-20261025'),
    [string]$PrivateDirectory = (Join-Path $PSScriptRoot '..\..\.private\smartvio-android-test-signing'),
    [string]$TemporaryRoot = 'E:\codex\Temp',
    [string]$NodeExecutable = 'node',
    [string]$TestMainClass = 'com.smartvio.studio.test.NativePolicyTest'
)

# Windows PowerShell 7. No Gradle or global PATH changes are required.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

function Assert-EDirectory([string]$Path) {
    $resolved = [IO.Path]::GetFullPath($Path)
    if (-not $resolved.StartsWith('E:\codex\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "All generated files must remain under E:\codex: $resolved"
    }
    return $resolved
}

$OutputDirectory = Assert-EDirectory $OutputDirectory
$PrivateDirectory = Assert-EDirectory $PrivateDirectory
$TemporaryRoot = Assert-EDirectory $TemporaryRoot
$ToolchainRoot = [IO.Path]::GetFullPath($ToolchainRoot)
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$originalSourceRoot = $sourceRoot
$work = Join-Path $TemporaryRoot ('smartvio-apk-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $OutputDirectory, $work | Out-Null
$buildLog = Join-Path $work 'build.log'
$tool = @{
    java = Join-Path $ToolchainRoot 'jdk-17.0.20.1+1\bin\java.exe'
    javac = Join-Path $ToolchainRoot 'jdk-17.0.20.1+1\bin\javac.exe'
    jar = Join-Path $ToolchainRoot 'jdk-17.0.20.1+1\bin\jar.exe'
    keytool = Join-Path $ToolchainRoot 'jdk-17.0.20.1+1\bin\keytool.exe'
    androidJar = Join-Path $ToolchainRoot 'android-35\android.jar'
    aapt2 = Join-Path $ToolchainRoot 'android-15\aapt2.exe'
    aapt = Join-Path $ToolchainRoot 'android-15\aapt.exe'
    zipalign = Join-Path $ToolchainRoot 'android-15\zipalign.exe'
    d8 = Join-Path $ToolchainRoot 'android-15\lib\d8.jar'
    apksigner = Join-Path $ToolchainRoot 'android-15\lib\apksigner.jar'
}
foreach ($path in $tool.Values) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing tool: $path" } }

function Invoke-CheckedTool([string]$Label, [string]$Executable, [string[]]$Arguments) {
    Add-Content -LiteralPath $buildLog -Value ("`n## " + $Label) -Encoding utf8
    $output = @(& $Executable @Arguments 2>&1 | ForEach-Object { $_.ToString() })
    $code = $LASTEXITCODE
    if ($output.Count -gt 0) { Add-Content -LiteralPath $buildLog -Value $output -Encoding utf8 }
    if ($code -ne 0) { throw "$Label failed with exit $code. $($output -join [Environment]::NewLine)" }
    Write-Host ("PASS " + $Label)
    return ($output -join [Environment]::NewLine)
}

function Write-JavaFileList([string]$Path, [string[]]$Files) {
    $lines = @($Files | ForEach-Object { '"' + $_.Replace('\', '/') + '"' })
    [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

$priorTemp = $env:TEMP
$priorTmp = $env:TMP
$priorPassword = $env:SMARTVIO_APK_SIGNING_PASSWORD
$env:TEMP = $TemporaryRoot
$env:TMP = $TemporaryRoot
try {
    # Some official Windows Android tools cannot open non-ASCII resource paths.
    # Compile an exact E-drive temporary snapshot; PowerShell copies support Unicode.
    $sourceSnapshot = Join-Path $work 'source'
    New-Item -ItemType Directory -Force -Path $sourceSnapshot | Out-Null
    Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $sourceSnapshot -Recurse -Force
    }
    $sourceRoot = $sourceSnapshot
    $classes = Join-Path $work 'classes'
    $generated = Join-Path $work 'generated'
    $dex = Join-Path $work 'dex'
    $testClasses = Join-Path $work 'test-classes'
    New-Item -ItemType Directory -Force -Path $classes, $generated, $dex, $testClasses | Out-Null

    $bridgeTests = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'tests') -Filter '*.test.cjs' -Recurse -File)
    $bridgeTestOutput = 'No JavaScript bridge test files present.'
    if ($bridgeTests.Count -gt 0) {
        $nodeCommand = Get-Command $NodeExecutable -ErrorAction Stop
        $bridgeTestOutput = Invoke-CheckedTool 'Run JavaScript bridge tests' $nodeCommand.Source (@('--test') + @($bridgeTests.FullName))
    }

    $tests = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'tests') -Filter '*.java' -Recurse -File)
    if ($tests.Count -eq 0) { throw 'JVM tests are required; tests/*.java is missing.' }
    $policySource = Join-Path $sourceRoot 'src\com\smartvio\studio\test\NativePolicy.java'
    $testList = Join-Path $work 'test-sources.txt'
    Write-JavaFileList $testList (@($policySource) + @($tests.FullName))
    $null = Invoke-CheckedTool 'Compile JVM tests' $tool.javac @('-J-Duser.language=en', '-J-Dfile.encoding=UTF-8', '--release', '11', '-encoding', 'UTF-8', '-d', $testClasses, ('@' + $testList))
    $testOutput = Invoke-CheckedTool 'Run JVM policy/export tests' $tool.java @(('-Djava.io.tmpdir=' + $work), '-ea', '-cp', $testClasses, $TestMainClass)

    $compiledResources = Join-Path $work 'resources.zip'
    $unsignedApk = Join-Path $work 'unsigned.apk'
    $null = Invoke-CheckedTool 'Compile Android resources' $tool.aapt2 @('compile', '--dir', (Join-Path $sourceRoot 'res'), '-o', $compiledResources)
    $linkArgs = @('link', '-o', $unsignedApk, '-I', $tool.androidJar, '--manifest', (Join-Path $sourceRoot 'AndroidManifest.xml'), '--java', $generated, $compiledResources)
    $assetsPath = Join-Path $sourceRoot 'assets'
    if (Test-Path -LiteralPath $assetsPath -PathType Container) { $linkArgs += @('-A', $assetsPath) }
    $null = Invoke-CheckedTool 'Link Android manifest and resources' $tool.aapt2 $linkArgs

    $sources = @(Get-ChildItem -LiteralPath (Join-Path $sourceRoot 'src'), $generated -Filter '*.java' -Recurse -File)
    if ($sources.Count -eq 0) { throw 'No Java app sources found.' }
    $sourceList = Join-Path $work 'app-sources.txt'
    Write-JavaFileList $sourceList @($sources.FullName)
    $null = Invoke-CheckedTool 'Compile Android Java sources' $tool.javac @('-J-Duser.language=en', '-J-Dfile.encoding=UTF-8', '--release', '8', '-encoding', 'UTF-8', '-classpath', $tool.androidJar, '-d', $classes, ('@' + $sourceList))
    $classesJar = Join-Path $work 'classes.jar'
    $null = Invoke-CheckedTool 'Package Java classes' $tool.jar @('--create', '--file', $classesJar, '-C', $classes, '.')
    $null = Invoke-CheckedTool 'Compile DEX' $tool.java @('-cp', $tool.d8, 'com.android.tools.r8.D8', '--lib', $tool.androidJar, '--min-api', '26', '--output', $dex, $classesJar)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::Open($unsignedApk, [IO.Compression.ZipArchiveMode]::Update)
    try {
        foreach ($dexFile in Get-ChildItem -LiteralPath $dex -Filter '*.dex' -File) {
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dexFile.FullName, $dexFile.Name, [IO.Compression.CompressionLevel]::Optimal)
        }
    } finally { $zip.Dispose() }
    $alignedApk = Join-Path $work 'aligned-unsigned.apk'
    $null = Invoke-CheckedTool 'Align APK' $tool.zipalign @('-P', '16', '-f', '4', $unsignedApk, $alignedApk)

    New-Item -ItemType Directory -Force -Path $PrivateDirectory | Out-Null
    $keystore = Join-Path $PrivateDirectory 'smartvio-test.p12'
    $passwordFile = Join-Path $PrivateDirectory 'password.dpapi.txt'
    $hasKey = Test-Path -LiteralPath $keystore -PathType Leaf
    $hasPassword = Test-Path -LiteralPath $passwordFile -PathType Leaf
    if ($hasKey -ne $hasPassword) { throw 'Signing storage is incomplete. Preserve it and recover the missing key/password; do not replace the existing signing identity.' }
    if (-not $hasKey) {
        $bytes = [byte[]]::new(48)
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $secret = [Convert]::ToBase64String($bytes)
        $secure = ConvertTo-SecureString -String $secret -AsPlainText -Force
        $encrypted = ConvertFrom-SecureString -SecureString $secure
        [IO.File]::WriteAllText($passwordFile, $encrypted, [Text.UTF8Encoding]::new($false))
        $env:SMARTVIO_APK_SIGNING_PASSWORD = $secret
        $secret = $null
        [Array]::Clear($bytes, 0, $bytes.Length)
        $null = Invoke-CheckedTool 'Create persistent local test signing certificate' $tool.keytool @('-genkeypair', '-keystore', $keystore, '-storetype', 'PKCS12', '-alias', 'silvio-test', '-keyalg', 'RSA', '-keysize', '3072', '-sigalg', 'SHA256withRSA', '-validity', '3650', '-dname', 'CN=Silvio Local Test, OU=Test Builds, O=SmartVio, C=CN', '-storepass:env', 'SMARTVIO_APK_SIGNING_PASSWORD', '-keypass:env', 'SMARTVIO_APK_SIGNING_PASSWORD', '-noprompt')
    } else {
        $secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText($passwordFile))
        $credential = [Management.Automation.PSCredential]::new('local-signing', $secure)
        $env:SMARTVIO_APK_SIGNING_PASSWORD = $credential.GetNetworkCredential().Password
        $credential = $null
    }

    $apk = Join-Path $OutputDirectory 'Silvio-V27-iQOO11-test.apk'
    $signedTemp = Join-Path $work 'Silvio-V27-iQOO11-test.apk'
    $null = Invoke-CheckedTool 'Sign test APK' $tool.java @('-jar', $tool.apksigner, 'sign', '--ks', $keystore, '--ks-key-alias', 'silvio-test', '--ks-pass', 'env:SMARTVIO_APK_SIGNING_PASSWORD', '--key-pass', 'env:SMARTVIO_APK_SIGNING_PASSWORD', '--v4-signing-enabled', 'false', '--out', $signedTemp, $alignedApk)
    $signatureOutput = Invoke-CheckedTool 'Verify APK signature and certificate' $tool.java @('-jar', $tool.apksigner, 'verify', '--verbose', '--print-certs', $signedTemp)
    $alignmentOutput = Invoke-CheckedTool 'Verify 16KB-aware APK alignment' $tool.zipalign @('-c', '-P', '16', '-v', '4', $signedTemp)
    $badgingOutput = Invoke-CheckedTool 'Inspect package and SDK metadata' $tool.aapt @('dump', 'badging', $signedTemp)
    $permissionOutput = Invoke-CheckedTool 'Inspect APK permissions' $tool.aapt @('dump', 'permissions', $signedTemp)
    if ($badgingOutput -notmatch "package: name='com.smartvio.studio.test' versionCode='2701' versionName='0.27.1'") { throw 'Unexpected application ID or version in compiled APK.' }
    if ($badgingOutput -notmatch "sdkVersion:'26'" -or $badgingOutput -notmatch "targetSdkVersion:'35'") { throw 'Unexpected SDK requirements in compiled APK.' }
    if ($signatureOutput -notmatch 'Verified using v2 scheme \(APK Signature Scheme v2\): true') { throw 'APK v2 signature verification failed.' }
    $certificate = [regex]::Match($signatureOutput, 'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)').Groups[1].Value.ToLower()
    if ($certificate.Length -ne 64) { throw 'Certificate SHA256 fingerprint missing.' }
    $entries = [IO.Compression.ZipFile]::OpenRead($signedTemp)
    try { $apkEntries = @($entries.Entries.FullName) } finally { $entries.Dispose() }
    foreach ($required in @('AndroidManifest.xml', 'resources.arsc', 'classes.dex')) { if ($apkEntries -notcontains $required) { throw "APK entry missing: $required" } }
    $sourceManifest = @(Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
        [ordered]@{path=[IO.Path]::GetRelativePath($sourceRoot, $_.FullName).Replace('\','/'); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()}
    })
    $currentSourceManifest = @(Get-ChildItem -LiteralPath $originalSourceRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
        [ordered]@{path=[IO.Path]::GetRelativePath($originalSourceRoot, $_.FullName).Replace('\','/'); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()}
    })
    if (($sourceManifest | ConvertTo-Json -Compress) -ne ($currentSourceManifest | ConvertTo-Json -Compress)) {
        throw 'Source files changed during the build. Re-run after source edits finish; this build is not accepted.'
    }
    Copy-Item -LiteralPath $signedTemp -Destination $apk -Force
    $result = [ordered]@{
        schemaVersion=1; generatedAt=[DateTimeOffset]::Now.ToString('o'); status='passed'; buildType='locally signed Android test build'
        packageName='com.smartvio.studio.test'; versionName='0.27.1'; versionCode=2701; minSdk=26; targetSdk=35; intendedDevice='iQOO 11 V2243A'
        artifact=[ordered]@{path=$apk; bytes=(Get-Item -LiteralPath $apk).Length; sha256=(Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLower(); entries=$apkEntries.Count}
        signing=[ordered]@{certificateSha256=$certificate; verification=$signatureOutput; privateKeyBackedUp=$false; passwordProtection='Windows DPAPI, current user'; passwordTransport='child-process environment variable'}
        checks=[ordered]@{jvmTests=$testOutput; javascriptBridgeTests=$bridgeTestOutput; zipAlignment=$alignmentOutput; badging=$badgingOutput; permissions=$permissionOutput; requiredApkEntries=$true}
        sourceFiles=$sourceManifest; toolchainRoot=$ToolchainRoot
        limitations=@('No physical phone or emulator install test was performed by this build script.','Microphone, camera, media playback, exports and device-specific layouts require the requested iQOO phone acceptance test.','This is a persistent local test certificate, not an app-store production signing identity.','Building identical sources is supported; binary hashes can vary with build timestamps.')
    }
    $jsonPath = Join-Path $OutputDirectory 'build-verification.json'
    $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $jsonPath -Encoding utf8
    @(
        'Silvio V27 Android test build verification', ('Generated: ' + $result.generatedAt), ('APK: ' + $apk),
        ('APK SHA256: ' + $result.artifact.sha256), ('Certificate SHA256: ' + $certificate),
        'Package: com.smartvio.studio.test; version 0.27.1 (2701); minSdk 26; targetSdk 35',
        '', 'JVM tests:', $testOutput, '', 'JavaScript bridge tests:', $bridgeTestOutput, '', 'Signature verification:', $signatureOutput, '',
        'ZIP alignment:', $alignmentOutput, '', 'APK metadata:', $badgingOutput, '', 'Permissions:', $permissionOutput, '',
        'Physical device validation: NOT PERFORMED. User requested this APK for actual testing.',
        'Signing key and DPAPI password remain local and are excluded from source backup.'
    ) | Set-Content -LiteralPath (Join-Path $OutputDirectory 'build-verification.txt') -Encoding utf8
    Write-Host ('APK ready: ' + $apk)
    Write-Host ('SHA256: ' + $result.artifact.sha256)
    Write-Host ('Certificate SHA256: ' + $certificate)
    Write-Host ('Verification: ' + $jsonPath)
} finally {
    $env:TEMP = $priorTemp
    $env:TMP = $priorTmp
    $env:SMARTVIO_APK_SIGNING_PASSWORD = $priorPassword
    if ($null -ne (Get-Variable -Name secure -ErrorAction SilentlyContinue)) { if ($null -ne $secure) { $secure.Dispose() } }
}
