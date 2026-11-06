param([string]$RepairScript = "scripts/repair-current-paper.ts")

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct RepairNativeCredential
{
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
}

public static class RepairNativeCredentials
{
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);

    [DllImport("advapi32.dll", EntryPoint = "CredFree")]
    public static extern void CredFree(IntPtr credential);
}
"@

$target = "e1d0e7e5-1496-43d0-836a-ed25a5243ecb.com.cet6.paperstudio"
$pointer = [IntPtr]::Zero
if (-not [RepairNativeCredentials]::CredRead($target, 1, 0, [ref]$pointer)) {
    throw "Could not read the DeepSeek credential."
}

try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
        $pointer,
        [type][RepairNativeCredential]
    )
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy(
        $credential.CredentialBlob,
        $bytes,
        0,
        $bytes.Length
    )
    $env:CET6_LIVE_DEEPSEEK_KEY = [Text.Encoding]::Unicode.GetString($bytes)
} finally {
    [RepairNativeCredentials]::CredFree($pointer)
}

$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$repairDir = "E:\Download\CET-6\.repair-eb32c436"
New-Item -ItemType Directory -Force -Path $repairDir | Out-Null
$stdout = Join-Path $repairDir "repair.stdout.log"
$stderr = Join-Path $repairDir "repair.stderr.log"
$pidFile = Join-Path $repairDir "repair.pid"
$process = Start-Process `
    -FilePath "npx.cmd" `
    -ArgumentList @("--yes", "tsx", $RepairScript) `
    -WorkingDirectory $workspace `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
Write-Output "repair_pid=$($process.Id)"
Write-Output "stdout=$stdout"
Write-Output "stderr=$stderr"
